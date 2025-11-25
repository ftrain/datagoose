"""
Transform raw IPEDS 2023 data into normalized schema.

Assumes raw tables (hd2023, adm2023, gr2023, etc.) are already loaded.
"""

import logging
import psycopg2
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")
logger = logging.getLogger(__name__)

CONN_STRING = "host=localhost port=5433 dbname=datagoose user=postgres password=postgres"
SCHEMA_FILE = Path(__file__).parent.parent / "schemas" / "migrations" / "001_core_schema.sql"


def run_schema(conn):
    """Create schema tables."""
    logger.info("Creating schema...")
    with open(SCHEMA_FILE) as f:
        sql = f.read()
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()
    logger.info("  Done")


def load_institutions(conn):
    """Transform HD2023 into institution table."""
    logger.info("Loading institutions...")
    sql = """
    INSERT INTO institution (unitid, name, city, state, zip, latitude, longitude,
                             sector, control, level, hbcu, tribal)
    SELECT
        unitid,
        instnm,
        city,
        stabbr,
        zip,
        latitude::double precision,
        longitud::double precision,
        sector::integer,
        control::integer,
        iclevel::integer,
        CASE WHEN hbcu = 1 THEN true ELSE false END,
        CASE WHEN tribal = 1 THEN true ELSE false END
    FROM hd2023
    WHERE unitid IS NOT NULL
    ON CONFLICT (unitid) DO UPDATE SET
        name = EXCLUDED.name,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        zip = EXCLUDED.zip,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        sector = EXCLUDED.sector,
        control = EXCLUDED.control,
        level = EXCLUDED.level,
        hbcu = EXCLUDED.hbcu,
        tribal = EXCLUDED.tribal,
        updated_at = NOW()
    """
    with conn.cursor() as cur:
        cur.execute(sql)
        count = cur.rowcount
    conn.commit()
    logger.info(f"  Loaded {count} institutions")
    return count


def load_admissions(conn, year=2023):
    """Transform ADM2023 into admissions table."""
    logger.info(f"Loading admissions for {year}...")
    sql = f"""
    INSERT INTO admissions (unitid, year, applicants_total, applicants_men, applicants_women,
                           admitted_total, admitted_men, admitted_women,
                           enrolled_total, enrolled_men, enrolled_women,
                           sat_verbal_25, sat_verbal_75, sat_math_25, sat_math_75,
                           act_composite_25, act_composite_75)
    SELECT
        unitid,
        {year},
        applcn::integer,
        applcnm::integer,
        applcnw::integer,
        admssn::integer,
        admssnm::integer,
        admssnw::integer,
        enrlt::integer,
        enrlm::integer,
        enrlw::integer,
        satvr25::integer,
        satvr75::integer,
        satmt25::integer,
        satmt75::integer,
        actcm25::integer,
        actcm75::integer
    FROM adm2023
    WHERE unitid IN (SELECT unitid FROM institution)
    ON CONFLICT (unitid, year) DO UPDATE SET
        applicants_total = EXCLUDED.applicants_total,
        applicants_men = EXCLUDED.applicants_men,
        applicants_women = EXCLUDED.applicants_women,
        admitted_total = EXCLUDED.admitted_total,
        admitted_men = EXCLUDED.admitted_men,
        admitted_women = EXCLUDED.admitted_women,
        enrolled_total = EXCLUDED.enrolled_total,
        enrolled_men = EXCLUDED.enrolled_men,
        enrolled_women = EXCLUDED.enrolled_women,
        sat_verbal_25 = EXCLUDED.sat_verbal_25,
        sat_verbal_75 = EXCLUDED.sat_verbal_75,
        sat_math_25 = EXCLUDED.sat_math_25,
        sat_math_75 = EXCLUDED.sat_math_75,
        act_composite_25 = EXCLUDED.act_composite_25,
        act_composite_75 = EXCLUDED.act_composite_75
    """
    with conn.cursor() as cur:
        cur.execute(sql)
        count = cur.rowcount
    conn.commit()
    logger.info(f"  Loaded {count} admissions records")
    return count


def load_graduation_rates(conn, year=2023):
    """Transform GR2023 into graduation_rates table.

    GR2023 structure:
    - grtype 8 = Bachelor's adjusted cohort
    - grtype 12 = Bachelor's completers within 150%
    - grtype 16 = Bachelor's transfer-out
    - Columns: grtotlt/m/w, graiant/m/w, grasiat/m/w, etc. for each race
    """
    logger.info(f"Loading graduation rates for {year}...")

    # Map IPEDS column suffixes to our race codes
    race_map = {
        'totl': 'APTS',  # total
        'aian': 'AIAN',
        'asia': 'ASIA',
        'bkaa': 'BKAA',
        'hisp': 'HISP',
        'nhpi': 'NHPI',
        'whit': 'WHIT',
        '2mor': '2MOR',
        'unkn': 'UNKN',
        'nral': 'NRAL',
    }

    # We'll pivot the wide data into our normalized structure
    # For now, just load total/men/women for all students (simplified)
    sql = f"""
    WITH cohorts AS (
        SELECT unitid,
            grtotlt as total, grtotlm as men, grtotlw as women,
            graiant as aian_t, graianm as aian_m, graianw as aian_w,
            grasiat as asia_t, grasiam as asia_m, grasiaw as asia_w,
            grbkaat as bkaa_t, grbkaam as bkaa_m, grbkaaw as bkaa_w,
            grhispt as hisp_t, grhispm as hisp_m, grhispw as hisp_w,
            grnhpit as nhpi_t, grnhpim as nhpi_m, grnhpiw as nhpi_w,
            grwhitt as whit_t, grwhitm as whit_m, grwhitw as whit_w,
            gr2mort as tmor_t, gr2morm as tmor_m, gr2morw as tmor_w,
            grunknt as unkn_t, grunknm as unkn_m, grunknw as unkn_w,
            grnralt as nral_t, grnralm as nral_m, grnralw as nral_w
        FROM gr2023 WHERE grtype = 8
    ),
    completers AS (
        SELECT unitid,
            grtotlt as total, grtotlm as men, grtotlw as women,
            graiant as aian_t, graianm as aian_m, graianw as aian_w,
            grasiat as asia_t, grasiam as asia_m, grasiaw as asia_w,
            grbkaat as bkaa_t, grbkaam as bkaa_m, grbkaaw as bkaa_w,
            grhispt as hisp_t, grhispm as hisp_m, grhispw as hisp_w,
            grnhpit as nhpi_t, grnhpim as nhpi_m, grnhpiw as nhpi_w,
            grwhitt as whit_t, grwhitm as whit_m, grwhitw as whit_w,
            gr2mort as tmor_t, gr2morm as tmor_m, gr2morw as tmor_w,
            grunknt as unkn_t, grunknm as unkn_m, grunknw as unkn_w,
            grnralt as nral_t, grnralm as nral_m, grnralw as nral_w
        FROM gr2023 WHERE grtype = 12
    ),
    transfers AS (
        SELECT unitid,
            grtotlt as total, grtotlm as men, grtotlw as women,
            graiant as aian_t, graianm as aian_m, graianw as aian_w,
            grasiat as asia_t, grasiam as asia_m, grasiaw as asia_w,
            grbkaat as bkaa_t, grbkaam as bkaa_m, grbkaaw as bkaa_w,
            grhispt as hisp_t, grhispm as hisp_m, grhispw as hisp_w,
            grnhpit as nhpi_t, grnhpim as nhpi_m, grnhpiw as nhpi_w,
            grwhitt as whit_t, grwhitm as whit_m, grwhitw as whit_w,
            gr2mort as tmor_t, gr2morm as tmor_m, gr2morw as tmor_w,
            grunknt as unkn_t, grunknm as unkn_m, grunknw as unkn_w,
            grnralt as nral_t, grnralm as nral_m, grnralw as nral_w
        FROM gr2023 WHERE grtype = 16
    ),
    -- Unpivot into rows: race, gender combinations
    unpivoted AS (
        -- All students total
        SELECT c.unitid, 'APTS' as race, 'total' as gender,
               c.total::int as cohort_size, comp.total::int as completers_150pct,
               t.total::int as transfer_out
        FROM cohorts c
        LEFT JOIN completers comp ON c.unitid = comp.unitid
        LEFT JOIN transfers t ON c.unitid = t.unitid

        UNION ALL SELECT c.unitid, 'APTS', 'men', c.men::int, comp.men::int, t.men::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid

        UNION ALL SELECT c.unitid, 'APTS', 'women', c.women::int, comp.women::int, t.women::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid

        -- AIAN
        UNION ALL SELECT c.unitid, 'AIAN', 'total', c.aian_t::int, comp.aian_t::int, t.aian_t::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
        UNION ALL SELECT c.unitid, 'AIAN', 'men', c.aian_m::int, comp.aian_m::int, t.aian_m::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
        UNION ALL SELECT c.unitid, 'AIAN', 'women', c.aian_w::int, comp.aian_w::int, t.aian_w::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid

        -- Asian
        UNION ALL SELECT c.unitid, 'ASIA', 'total', c.asia_t::int, comp.asia_t::int, t.asia_t::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
        UNION ALL SELECT c.unitid, 'ASIA', 'men', c.asia_m::int, comp.asia_m::int, t.asia_m::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
        UNION ALL SELECT c.unitid, 'ASIA', 'women', c.asia_w::int, comp.asia_w::int, t.asia_w::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid

        -- Black
        UNION ALL SELECT c.unitid, 'BKAA', 'total', c.bkaa_t::int, comp.bkaa_t::int, t.bkaa_t::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
        UNION ALL SELECT c.unitid, 'BKAA', 'men', c.bkaa_m::int, comp.bkaa_m::int, t.bkaa_m::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
        UNION ALL SELECT c.unitid, 'BKAA', 'women', c.bkaa_w::int, comp.bkaa_w::int, t.bkaa_w::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid

        -- Hispanic
        UNION ALL SELECT c.unitid, 'HISP', 'total', c.hisp_t::int, comp.hisp_t::int, t.hisp_t::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
        UNION ALL SELECT c.unitid, 'HISP', 'men', c.hisp_m::int, comp.hisp_m::int, t.hisp_m::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
        UNION ALL SELECT c.unitid, 'HISP', 'women', c.hisp_w::int, comp.hisp_w::int, t.hisp_w::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid

        -- NHPI
        UNION ALL SELECT c.unitid, 'NHPI', 'total', c.nhpi_t::int, comp.nhpi_t::int, t.nhpi_t::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
        UNION ALL SELECT c.unitid, 'NHPI', 'men', c.nhpi_m::int, comp.nhpi_m::int, t.nhpi_m::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
        UNION ALL SELECT c.unitid, 'NHPI', 'women', c.nhpi_w::int, comp.nhpi_w::int, t.nhpi_w::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid

        -- White
        UNION ALL SELECT c.unitid, 'WHIT', 'total', c.whit_t::int, comp.whit_t::int, t.whit_t::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
        UNION ALL SELECT c.unitid, 'WHIT', 'men', c.whit_m::int, comp.whit_m::int, t.whit_m::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
        UNION ALL SELECT c.unitid, 'WHIT', 'women', c.whit_w::int, comp.whit_w::int, t.whit_w::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid

        -- Two or more
        UNION ALL SELECT c.unitid, '2MOR', 'total', c.tmor_t::int, comp.tmor_t::int, t.tmor_t::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
        UNION ALL SELECT c.unitid, '2MOR', 'men', c.tmor_m::int, comp.tmor_m::int, t.tmor_m::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
        UNION ALL SELECT c.unitid, '2MOR', 'women', c.tmor_w::int, comp.tmor_w::int, t.tmor_w::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid

        -- Unknown
        UNION ALL SELECT c.unitid, 'UNKN', 'total', c.unkn_t::int, comp.unkn_t::int, t.unkn_t::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
        UNION ALL SELECT c.unitid, 'UNKN', 'men', c.unkn_m::int, comp.unkn_m::int, t.unkn_m::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
        UNION ALL SELECT c.unitid, 'UNKN', 'women', c.unkn_w::int, comp.unkn_w::int, t.unkn_w::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid

        -- Nonresident
        UNION ALL SELECT c.unitid, 'NRAL', 'total', c.nral_t::int, comp.nral_t::int, t.nral_t::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
        UNION ALL SELECT c.unitid, 'NRAL', 'men', c.nral_m::int, comp.nral_m::int, t.nral_m::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
        UNION ALL SELECT c.unitid, 'NRAL', 'women', c.nral_w::int, comp.nral_w::int, t.nral_w::int
        FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
    )
    INSERT INTO graduation_rates (unitid, year, cohort_type, race, gender,
                                  cohort_size, completers_150pct, transfer_out)
    SELECT unitid, {year}, 'bachelor', race, gender,
           cohort_size, completers_150pct, transfer_out
    FROM unpivoted
    WHERE unitid IN (SELECT unitid FROM institution)
    ON CONFLICT (unitid, year, cohort_type, race, gender) DO UPDATE SET
        cohort_size = EXCLUDED.cohort_size,
        completers_150pct = EXCLUDED.completers_150pct,
        transfer_out = EXCLUDED.transfer_out
    """
    with conn.cursor() as cur:
        cur.execute(sql)
        count = cur.rowcount
    conn.commit()
    logger.info(f"  Loaded {count} graduation rate records")
    return count


def load_graduation_rates_pell(conn, year=2023):
    """Transform GR2023_PELL_SSL into graduation_rates_pell table.

    psgrtype values:
    1 = Total (all students)
    2 = Pell Grant recipients
    3 = Subsidized loan recipients (no Pell)
    4 = Neither Pell nor subsidized loan
    """
    logger.info(f"Loading Pell graduation rates for {year}...")

    sql = f"""
    INSERT INTO graduation_rates_pell (unitid, year, cohort_type, pell_status,
                                       cohort_size, completers_150pct)
    SELECT
        unitid,
        {year},
        'bachelor',
        CASE psgrtype
            WHEN 1 THEN 'total'
            WHEN 2 THEN 'pell'
            WHEN 3 THEN 'non_pell_loan'
            WHEN 4 THEN 'neither'
        END,
        pgadjct::int,
        pgcmbac::int
    FROM gr2023_pell_ssl
    WHERE unitid IN (SELECT unitid FROM institution)
      AND psgrtype IN (1, 2, 3, 4)
    ON CONFLICT (unitid, year, cohort_type, pell_status) DO UPDATE SET
        cohort_size = EXCLUDED.cohort_size,
        completers_150pct = EXCLUDED.completers_150pct
    """
    with conn.cursor() as cur:
        cur.execute(sql)
        count = cur.rowcount
    conn.commit()
    logger.info(f"  Loaded {count} Pell graduation rate records")
    return count


def load_enrollment(conn, year=2023):
    """Transform EF2023A into enrollment table.

    EF2023A has efbage (age category) and multiple race/gender columns.
    We'll aggregate across all ages for simplicity.
    """
    logger.info(f"Loading enrollment for {year}...")

    # efalevel: 1=All students, 2=Undergrad, 3=First-time undergrad, etc.
    sql = f"""
    INSERT INTO enrollment (unitid, year, level, race, gender, full_time, part_time)
    SELECT
        unitid,
        {year},
        CASE efalevel
            WHEN 1 THEN 'all'
            WHEN 2 THEN 'undergraduate'
            WHEN 3 THEN 'undergraduate'  -- first-time
            WHEN 4 THEN 'graduate'
            ELSE 'other'
        END as level,
        'APTS' as race,  -- Start with totals only
        'total' as gender,
        SUM(eftotlt)::int as full_time,
        0 as part_time  -- will need EF2023B for part-time
    FROM ef2023a
    WHERE unitid IN (SELECT unitid FROM institution)
      AND efalevel IN (1, 2, 4)  -- all, undergrad, graduate
    GROUP BY unitid, efalevel
    ON CONFLICT (unitid, year, level, race, gender) DO UPDATE SET
        full_time = EXCLUDED.full_time,
        part_time = EXCLUDED.part_time
    """
    with conn.cursor() as cur:
        cur.execute(sql)
        count = cur.rowcount
    conn.commit()
    logger.info(f"  Loaded {count} enrollment records")
    return count


def main():
    logger.info("Connecting to PostgreSQL...")
    conn = psycopg2.connect(CONN_STRING)

    try:
        run_schema(conn)
        load_institutions(conn)
        load_admissions(conn)
        load_graduation_rates(conn)
        load_graduation_rates_pell(conn)
        load_enrollment(conn)

        # Verification
        logger.info("Verifying...")
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM institution")
            logger.info(f"  institution: {cur.fetchone()[0]} rows")
            cur.execute("SELECT COUNT(*) FROM admissions")
            logger.info(f"  admissions: {cur.fetchone()[0]} rows")
            cur.execute("SELECT COUNT(*) FROM graduation_rates")
            logger.info(f"  graduation_rates: {cur.fetchone()[0]} rows")
            cur.execute("SELECT COUNT(*) FROM graduation_rates_pell")
            logger.info(f"  graduation_rates_pell: {cur.fetchone()[0]} rows")
            cur.execute("SELECT COUNT(*) FROM enrollment")
            logger.info(f"  enrollment: {cur.fetchone()[0]} rows")

    finally:
        conn.close()

    logger.info("All done!")


if __name__ == "__main__":
    main()
