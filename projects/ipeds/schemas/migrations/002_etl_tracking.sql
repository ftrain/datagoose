-- ETL Tracking Schema
-- Records all data loading and transformation operations for auditability

-- ============================================================================
-- ETL RUN LOG (tracks each ETL execution)
-- ============================================================================

CREATE TABLE IF NOT EXISTS etl_run (
    id SERIAL PRIMARY KEY,
    run_type TEXT NOT NULL,  -- 'raw_load', 'transform'
    data_year INTEGER NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'running',  -- 'running', 'completed', 'failed'
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_etl_run_year ON etl_run(data_year);
CREATE INDEX IF NOT EXISTS idx_etl_run_type ON etl_run(run_type);
CREATE INDEX IF NOT EXISTS idx_etl_run_status ON etl_run(status);

-- ============================================================================
-- ETL TABLE LOG (tracks each table loaded/transformed within a run)
-- ============================================================================

CREATE TABLE IF NOT EXISTS etl_table_log (
    id SERIAL PRIMARY KEY,
    run_id INTEGER NOT NULL REFERENCES etl_run(id),
    table_name TEXT NOT NULL,
    source_file TEXT,  -- for raw loads
    source_table TEXT,  -- for transforms
    operation TEXT NOT NULL,  -- 'load', 'transform', 'truncate'
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    rows_affected INTEGER,
    status TEXT NOT NULL DEFAULT 'running',
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_etl_table_run ON etl_table_log(run_id);
CREATE INDEX IF NOT EXISTS idx_etl_table_name ON etl_table_log(table_name);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Start a new ETL run
CREATE OR REPLACE FUNCTION etl_start_run(
    p_run_type TEXT,
    p_data_year INTEGER,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS INTEGER AS $$
DECLARE
    v_run_id INTEGER;
BEGIN
    INSERT INTO etl_run (run_type, data_year, metadata)
    VALUES (p_run_type, p_data_year, p_metadata)
    RETURNING id INTO v_run_id;
    RETURN v_run_id;
END;
$$ LANGUAGE plpgsql;

-- Complete an ETL run
CREATE OR REPLACE FUNCTION etl_complete_run(
    p_run_id INTEGER,
    p_status TEXT DEFAULT 'completed',
    p_error TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    UPDATE etl_run
    SET completed_at = NOW(),
        status = p_status,
        error_message = p_error
    WHERE id = p_run_id;
END;
$$ LANGUAGE plpgsql;

-- Log a table operation start
CREATE OR REPLACE FUNCTION etl_log_table_start(
    p_run_id INTEGER,
    p_table_name TEXT,
    p_operation TEXT,
    p_source_file TEXT DEFAULT NULL,
    p_source_table TEXT DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_log_id INTEGER;
BEGIN
    INSERT INTO etl_table_log (run_id, table_name, operation, source_file, source_table)
    VALUES (p_run_id, p_table_name, p_operation, p_source_file, p_source_table)
    RETURNING id INTO v_log_id;
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- Complete a table operation
CREATE OR REPLACE FUNCTION etl_log_table_complete(
    p_log_id INTEGER,
    p_rows_affected INTEGER,
    p_status TEXT DEFAULT 'completed',
    p_error TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    UPDATE etl_table_log
    SET completed_at = NOW(),
        rows_affected = p_rows_affected,
        status = p_status,
        error_message = p_error
    WHERE id = p_log_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CONVENIENCE VIEWS
-- ============================================================================

CREATE OR REPLACE VIEW v_etl_summary AS
SELECT
    r.id as run_id,
    r.run_type,
    r.data_year,
    r.started_at,
    r.completed_at,
    r.status as run_status,
    EXTRACT(EPOCH FROM (r.completed_at - r.started_at)) as duration_seconds,
    COUNT(t.id) as tables_processed,
    SUM(t.rows_affected) as total_rows
FROM etl_run r
LEFT JOIN etl_table_log t ON r.id = t.run_id
GROUP BY r.id, r.run_type, r.data_year, r.started_at, r.completed_at, r.status
ORDER BY r.started_at DESC;

CREATE OR REPLACE VIEW v_etl_table_status AS
SELECT
    r.data_year,
    t.table_name,
    t.operation,
    t.source_file,
    t.source_table,
    t.rows_affected,
    t.status,
    t.completed_at
FROM etl_table_log t
JOIN etl_run r ON t.run_id = r.id
WHERE t.status = 'completed'
ORDER BY t.completed_at DESC;

-- What tables are loaded for each year
CREATE OR REPLACE VIEW v_loaded_tables AS
SELECT DISTINCT
    r.data_year,
    t.table_name,
    MAX(t.completed_at) as last_loaded,
    MAX(t.rows_affected) as rows
FROM etl_table_log t
JOIN etl_run r ON t.run_id = r.id
WHERE t.status = 'completed'
GROUP BY r.data_year, t.table_name
ORDER BY r.data_year DESC, t.table_name;
