-- IPEDS Database Trimming Script for Fly.io Deployment
-- Reduces database from ~44GB to ~8-10GB while preserving all analytical functionality
--
-- Run with: docker exec -i datagoose-ipeds-postgres-1 psql -U postgres -d datagoose < scripts/trim_for_deploy.sql
--
-- What gets removed:
-- 1. Raw staging tables (c_a*, hd*, ef*, gr*, sfa*, adm*, ic*) - ~4.6GB
-- 2. Redundant gender='total' rows from completions - ~11GB
--    (gender totals can be computed from men + women)
--
-- What is preserved:
-- - All race breakdowns (AIAN, ASIA, BKAA, HISP, NHPI, WHIT, 2MOR, APTS, UNKN, NRAL)
-- - Gender breakdowns (men, women) - totals computable via SUM()
-- - All years of data
-- - All transformed tables (institution, admissions, enrollment, graduation_rates, etc.)

\echo '=============================================='
\echo 'IPEDS Database Trim for Deployment'
\echo '=============================================='

-- Show initial size
\echo ''
\echo 'Initial database size:'
SELECT pg_size_pretty(pg_database_size('datagoose')) as database_size;

-- Step 1: Drop raw staging tables
\echo ''
\echo 'Step 1: Dropping raw staging tables...'

DO $$
DECLARE
    tbl RECORD;
    dropped_count INT := 0;
BEGIN
    FOR tbl IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename ~ '^(c_a|c[0-9]|hd|ef|adm|gr|sfa|ic)[0-9]'
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', tbl.tablename);
        dropped_count := dropped_count + 1;
    END LOOP;
    RAISE NOTICE 'Dropped % raw staging tables', dropped_count;
END $$;

-- Step 2: Remove redundant gender='total' rows from completions
\echo ''
\echo 'Step 2: Removing gender=total rows from completions (keeping men/women)...'
\echo '        This may take a few minutes...'

-- Count before
SELECT COUNT(*) as rows_before FROM completions;

-- Delete gender='total' rows
DELETE FROM completions WHERE gender = 'total';

-- Count after
SELECT COUNT(*) as rows_after FROM completions;

-- Step 3: Vacuum and reindex to reclaim space
\echo ''
\echo 'Step 3: Vacuuming completions table to reclaim space...'
VACUUM FULL completions;

\echo ''
\echo 'Step 4: Reindexing completions table...'
REINDEX TABLE completions;

-- Step 5: Vacuum the whole database
\echo ''
\echo 'Step 5: Running full database vacuum...'
VACUUM FULL;

-- Show final size
\echo ''
\echo '=============================================='
\echo 'Final Results:'
\echo '=============================================='
SELECT pg_size_pretty(pg_database_size('datagoose')) as final_database_size;

-- Show table sizes
\echo ''
\echo 'Largest tables after trim:'
SELECT
    relname as table_name,
    pg_size_pretty(pg_total_relation_size(relid)) as size
FROM pg_catalog.pg_statio_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 10;

\echo ''
\echo 'Done! Database is ready for export.'
\echo 'Export with: pg_dump -Fc -Z9 datagoose > ipeds_trimmed.dump'
