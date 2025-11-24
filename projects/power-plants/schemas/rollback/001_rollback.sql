-- Rollback: Remove power plants schema
-- WARNING: This will delete all power plant data!

BEGIN;

DROP TRIGGER IF EXISTS power_plants_updated_at ON power_plants;
DROP FUNCTION IF EXISTS update_updated_at();
DROP TABLE IF EXISTS power_plant_generation CASCADE;
DROP TABLE IF EXISTS power_plants CASCADE;
DROP TYPE IF EXISTS fuel_type;

COMMIT;
