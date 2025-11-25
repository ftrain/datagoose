-- Maximal PostgreSQL: Enable all useful extensions for data migration projects
-- This runs automatically on database creation

-- =============================================================================
-- CORE EXTENSIONS (Always Enabled)
-- =============================================================================

-- Vector similarity search (embeddings, ML, semantic search)
CREATE EXTENSION IF NOT EXISTS vector;

-- Geospatial queries (PostGIS)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Full-text search enhancements - trigram for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- INDEX SUPPORT EXTENSIONS
-- =============================================================================

-- GiST index support for B-tree types (range queries, exclusion constraints)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- GIN index support for B-tree types (multi-value columns, arrays)
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- =============================================================================
-- DATA TYPE EXTENSIONS
-- =============================================================================

-- Key-value store type (flexible semi-structured data)
CREATE EXTENSION IF NOT EXISTS hstore;

-- Case-insensitive text type
CREATE EXTENSION IF NOT EXISTS citext;

-- Hierarchical tree data type (taxonomies, org charts)
CREATE EXTENSION IF NOT EXISTS ltree;

-- Integer array utilities (set operations, indexing)
CREATE EXTENSION IF NOT EXISTS intarray;

-- =============================================================================
-- STRING MATCHING EXTENSIONS
-- =============================================================================

-- String similarity and distance functions (Levenshtein, Soundex, Metaphone)
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

-- =============================================================================
-- UTILITY EXTENSIONS
-- =============================================================================

-- Crosstab and pivot table functions
CREATE EXTENSION IF NOT EXISTS tablefunc;

-- Cryptographic functions (hashing, encryption)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Query statistics tracking (performance analysis)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- =============================================================================
-- VERIFY INSTALLATION
-- =============================================================================

DO $$
DECLARE
    ext RECORD;
BEGIN
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Datagoose PostgreSQL - Extensions Loaded:';
    RAISE NOTICE '============================================';
    FOR ext IN SELECT extname, extversion FROM pg_extension ORDER BY extname LOOP
        RAISE NOTICE '  % (%)', ext.extname, ext.extversion;
    END LOOP;
    RAISE NOTICE '============================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Key capabilities enabled:';
    RAISE NOTICE '  - pgvector: Vector similarity search (cosine, L2, inner product)';
    RAISE NOTICE '  - PostGIS: Spatial queries (ST_Distance, ST_Within, etc.)';
    RAISE NOTICE '  - pg_trgm: Trigram fuzzy text search (similarity, %%)';
    RAISE NOTICE '  - fuzzystrmatch: Levenshtein, Soundex, Metaphone';
    RAISE NOTICE '  - hstore: Key-value columns';
    RAISE NOTICE '  - ltree: Hierarchical data';
    RAISE NOTICE '  - tablefunc: Crosstab/pivot queries';
    RAISE NOTICE '============================================';
END $$;
