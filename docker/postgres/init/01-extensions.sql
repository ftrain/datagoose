-- Maximal PostgreSQL: Enable all extensions for data migration projects
-- This runs automatically on database creation

-- Vector similarity search (embeddings, ML)
CREATE EXTENSION IF NOT EXISTS vector;

-- Geospatial queries (PostGIS)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Full-text search is built-in, but enable trigram for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Useful built-in extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";     -- UUID generation
CREATE EXTENSION IF NOT EXISTS btree_gist;      -- GiST index support for btree types
CREATE EXTENSION IF NOT EXISTS btree_gin;       -- GIN index support for btree types

-- Verify extensions loaded
DO $$
BEGIN
    RAISE NOTICE 'Datagoose PostgreSQL initialized with extensions:';
    RAISE NOTICE '  - pgvector (vector similarity search)';
    RAISE NOTICE '  - PostGIS (geospatial)';
    RAISE NOTICE '  - pg_trgm (trigram fuzzy matching)';
    RAISE NOTICE '  - uuid-ossp (UUID generation)';
    RAISE NOTICE '  - btree_gist, btree_gin (index support)';
END $$;
