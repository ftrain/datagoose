-- Migration: Create power plants schema
-- Source: Global Power Plant Database v1.3.0
-- Author: @schema-architect
-- Date: 2024

BEGIN;

-- Enum for fuel types
CREATE TYPE fuel_type AS ENUM (
    'Biomass',
    'Coal',
    'Cogeneration',
    'Gas',
    'Geothermal',
    'Hydro',
    'Nuclear',
    'Oil',
    'Other',
    'Petcoke',
    'Solar',
    'Storage',
    'Waste',
    'Wave and Tidal',
    'Wind'
);

-- Main power plants table
CREATE TABLE power_plants (
    id                      BIGSERIAL PRIMARY KEY,
    gppd_idnr               VARCHAR(20) UNIQUE NOT NULL,  -- Original database ID
    name                    VARCHAR(500) NOT NULL,
    country_code            CHAR(3) NOT NULL,             -- ISO 3166-1 alpha-3
    country                 VARCHAR(100) NOT NULL,

    -- Capacity and location
    capacity_mw             DECIMAL(12,2) NOT NULL,
    latitude                DECIMAL(10,6) NOT NULL,
    longitude               DECIMAL(11,6) NOT NULL,

    -- Fuel information
    primary_fuel            fuel_type NOT NULL,
    other_fuel1             fuel_type,
    other_fuel2             fuel_type,
    other_fuel3             fuel_type,

    -- Plant details
    commissioning_year      INTEGER,
    owner                   VARCHAR(500),

    -- Source attribution
    source                  VARCHAR(200),
    url                     TEXT,
    geolocation_source      VARCHAR(200),
    wepp_id                 VARCHAR(50),
    year_of_capacity_data   INTEGER,

    -- Metadata
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT power_plants_capacity_positive CHECK (capacity_mw > 0),
    CONSTRAINT power_plants_valid_latitude CHECK (latitude BETWEEN -90 AND 90),
    CONSTRAINT power_plants_valid_longitude CHECK (longitude BETWEEN -180 AND 180)
);

-- Generation data (normalized into separate table)
CREATE TABLE power_plant_generation (
    id                      BIGSERIAL PRIMARY KEY,
    power_plant_id          BIGINT NOT NULL REFERENCES power_plants(id) ON DELETE CASCADE,
    year                    INTEGER NOT NULL,
    generation_gwh          DECIMAL(12,2),           -- Reported generation
    estimated_generation_gwh DECIMAL(12,2),          -- Estimated generation
    estimation_method       VARCHAR(50),             -- e.g., SOLAR-V1, HYDRO-V1
    data_source             VARCHAR(200),

    CONSTRAINT generation_year_valid CHECK (year BETWEEN 2000 AND 2030),
    CONSTRAINT unique_plant_year UNIQUE (power_plant_id, year)
);

-- Audit trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER power_plants_updated_at
    BEFORE UPDATE ON power_plants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Indexes for common queries
CREATE INDEX idx_power_plants_country ON power_plants(country_code);
CREATE INDEX idx_power_plants_fuel ON power_plants(primary_fuel);
CREATE INDEX idx_power_plants_capacity ON power_plants(capacity_mw DESC);
CREATE INDEX idx_power_plants_location ON power_plants USING gist (
    point(longitude, latitude)
);
CREATE INDEX idx_power_plants_name_search ON power_plants USING gin (
    to_tsvector('english', name)
);

CREATE INDEX idx_generation_plant ON power_plant_generation(power_plant_id);
CREATE INDEX idx_generation_year ON power_plant_generation(year);

-- Comments
COMMENT ON TABLE power_plants IS 'Global Power Plant Database - grid-scale power plants (1 MW+)';
COMMENT ON COLUMN power_plants.gppd_idnr IS 'Original identifier from Global Power Plant Database';
COMMENT ON COLUMN power_plants.capacity_mw IS 'Electrical generating capacity in megawatts';
COMMENT ON COLUMN power_plants.primary_fuel IS 'Primary energy source for electricity generation';
COMMENT ON TABLE power_plant_generation IS 'Annual generation data (reported and estimated) per power plant';

COMMIT;
