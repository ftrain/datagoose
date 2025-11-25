"""
Transform raw IPEDS 2023 data into normalized schema.

Assumes raw tables (hd2023, adm2023, gr2023, etc.) are already loaded.
Uses ETL tracking for auditability.
"""

import logging
import psycopg2
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")
logger = logging.getLogger(__name__)

CONN_STRING = "host=localhost port=5433 dbname=datagoose user=postgres password=postgres"
SCHEMA_FILE = Path(__file__).parent.parent / "schemas" / "migrations" / "001_core_schema.sql"


class ETLTracker:
    """Helper class for ETL tracking within transforms."""

    def __init__(self, conn, data_year: int):
        self.conn = conn
        self.data_year = data_year
        self.run_id = None

    def start_run(self):
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT etl_start_run(%s, %s, %s)",
                ("transform", self.data_year, '{"stage": "normalized"}')
            )
            self.run_id = cur.fetchone()[0]
        self.conn.commit()
        logger.info(f"Started transform run {self.run_id}")
        return self.run_id

    def complete_run(self, status="completed", error=None):
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT etl_complete_run(%s, %s, %s)",
                (self.run_id, status, error)
            )
        self.conn.commit()

    def log_table(self, table_name: str, source_table: str, operation: str = "transform"):
        """Context manager for logging table operations."""
        return TableLogger(self.conn, self.run_id, table_name, source_table, operation)


class TableLogger:
    """Context manager for table-level ETL logging."""

    def __init__(self, conn, run_id, table_name, source_table, operation):
        self.conn = conn
        self.run_id = run_id
        self.table_name = table_name
        self.source_table = source_table
        self.operation = operation
        self.log_id = None

    def __enter__(self):
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT etl_log_table_start(%s, %s, %s, NULL, %s)",
                (self.run_id, self.table_name, self.operation, self.source_table)
            )
            self.log_id = cur.fetchone()[0]
        self.conn.commit()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            with self.conn.cursor() as cur:
                cur.execute(
                    "SELECT etl_log_table_complete(%s, %s, %s, %s)",
                    (self.log_id, 0, "failed", str(exc_val))
                )
            self.conn.commit()
            return False

    def complete(self, rows_affected: int):
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT etl_log_table_complete(%s, %s, %s, NULL)",
                (self.log_id, rows_affected, "completed")
            )
        self.conn.commit()


def run_schema(conn):
    """Create schema tables if they don't exist."""
    logger.info("Ensuring schema exists...")
    with open(SCHEMA_FILE) as f:
        sql = f.read()
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()
    logger.info("  Done")


def load_institutions(conn, tracker: ETLTracker, year=2023):
    """Transform HD2023 into institution table."""
    logger.info("Loading institutions...")

    with tracker.log_table("institution", "hd2023") as tlog:
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
        tlog.complete(count)

    logger.info(f"  Loaded {count} institutions")
    return count


def load_admissions(conn, tracker: ETLTracker, year=2023):
    """Transform ADM2023 into admissions table."""
    logger.info(f"Loading admissions for {year}...")

    with tracker.log_table("admissions", "adm2023") as tlog:
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
        tlog.complete(count)

    logger.info(f"  Loaded {count} admissions records")
    return count


def load_graduation_rates(conn, tracker: ETLTracker, year=2023):
    """Transform GR2023 into graduation_rates table.

    GR2023 structure:
    - grtype 8 = Bachelor's adjusted cohort
    - grtype 12 = Bachelor's completers within 150%
    - grtype 16 = Bachelor's transfer-out
    - Columns: grtotlt/m/w, graiant/m/w, grasiat/m/w, etc. for each race
    """
    logger.info(f"Loading graduation rates for {year}...")

    with tracker.log_table("graduation_rates", "gr2023") as tlog:
        # Large unpivoting query for all race/gender combinations
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
        unpivoted AS (
            -- All students
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
        tlog.complete(count)

    logger.info(f"  Loaded {count} graduation rate records")
    return count


def load_graduation_rates_pell(conn, tracker: ETLTracker, year=2023):
    """Transform GR2023_PELL_SSL into graduation_rates_pell table.

    psgrtype values:
    1 = Total (all students)
    2 = Pell Grant recipients
    3 = Subsidized loan recipients (no Pell)
    4 = Neither Pell nor subsidized loan
    """
    logger.info(f"Loading Pell graduation rates for {year}...")

    with tracker.log_table("graduation_rates_pell", "gr2023_pell_ssl") as tlog:
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
        tlog.complete(count)

    logger.info(f"  Loaded {count} Pell graduation rate records")
    return count


def load_enrollment(conn, tracker: ETLTracker, year=2023):
    """Transform EF2023A into enrollment table with full race/gender breakdown.

    EF2023A has efalevel (student level) and columns for each race/gender combo.
    efalevel: 1=All, 2=Undergrad, 3=First-time UG, 4=Graduate, etc.
    """
    logger.info(f"Loading enrollment for {year}...")

    with tracker.log_table("enrollment", "ef2023a") as tlog:
        # We need to unpivot the race/gender columns
        sql = f"""
        WITH base AS (
            SELECT
                unitid,
                CASE efalevel
                    WHEN 1 THEN 'all'
                    WHEN 2 THEN 'undergraduate'
                    WHEN 4 THEN 'graduate'
                END as level,
                -- Total
                eftotlt, eftotlm, eftotlw,
                -- By race: American Indian
                efaiant, efaianm, efaianw,
                -- Asian
                efasiat, efasiam, efasiaw,
                -- Black
                efbkaat, efbkaam, efbkaaw,
                -- Hispanic
                efhispt, efhispm, efhispw,
                -- NHPI
                efnhpit, efnhpim, efnhpiw,
                -- White
                efwhitt, efwhitm, efwhitw,
                -- Two or more
                ef2mort, ef2morm, ef2morw,
                -- Unknown
                efunknt, efunknm, efunknw,
                -- Nonresident
                efnralt, efnralm, efnralw
            FROM ef2023a
            WHERE efalevel IN (1, 2, 4)
              AND unitid IN (SELECT unitid FROM institution)
        ),
        unpivoted AS (
            -- APTS (all students)
            SELECT unitid, level, 'APTS' as race, 'total' as gender, eftotlt::int as full_time FROM base
            UNION ALL SELECT unitid, level, 'APTS', 'men', eftotlm::int FROM base
            UNION ALL SELECT unitid, level, 'APTS', 'women', eftotlw::int FROM base
            -- AIAN
            UNION ALL SELECT unitid, level, 'AIAN', 'total', efaiant::int FROM base
            UNION ALL SELECT unitid, level, 'AIAN', 'men', efaianm::int FROM base
            UNION ALL SELECT unitid, level, 'AIAN', 'women', efaianw::int FROM base
            -- ASIA
            UNION ALL SELECT unitid, level, 'ASIA', 'total', efasiat::int FROM base
            UNION ALL SELECT unitid, level, 'ASIA', 'men', efasiam::int FROM base
            UNION ALL SELECT unitid, level, 'ASIA', 'women', efasiaw::int FROM base
            -- BKAA
            UNION ALL SELECT unitid, level, 'BKAA', 'total', efbkaat::int FROM base
            UNION ALL SELECT unitid, level, 'BKAA', 'men', efbkaam::int FROM base
            UNION ALL SELECT unitid, level, 'BKAA', 'women', efbkaaw::int FROM base
            -- HISP
            UNION ALL SELECT unitid, level, 'HISP', 'total', efhispt::int FROM base
            UNION ALL SELECT unitid, level, 'HISP', 'men', efhispm::int FROM base
            UNION ALL SELECT unitid, level, 'HISP', 'women', efhispw::int FROM base
            -- NHPI
            UNION ALL SELECT unitid, level, 'NHPI', 'total', efnhpit::int FROM base
            UNION ALL SELECT unitid, level, 'NHPI', 'men', efnhpim::int FROM base
            UNION ALL SELECT unitid, level, 'NHPI', 'women', efnhpiw::int FROM base
            -- WHIT
            UNION ALL SELECT unitid, level, 'WHIT', 'total', efwhitt::int FROM base
            UNION ALL SELECT unitid, level, 'WHIT', 'men', efwhitm::int FROM base
            UNION ALL SELECT unitid, level, 'WHIT', 'women', efwhitw::int FROM base
            -- 2MOR
            UNION ALL SELECT unitid, level, '2MOR', 'total', ef2mort::int FROM base
            UNION ALL SELECT unitid, level, '2MOR', 'men', ef2morm::int FROM base
            UNION ALL SELECT unitid, level, '2MOR', 'women', ef2morw::int FROM base
            -- UNKN
            UNION ALL SELECT unitid, level, 'UNKN', 'total', efunknt::int FROM base
            UNION ALL SELECT unitid, level, 'UNKN', 'men', efunknm::int FROM base
            UNION ALL SELECT unitid, level, 'UNKN', 'women', efunknw::int FROM base
            -- NRAL
            UNION ALL SELECT unitid, level, 'NRAL', 'total', efnralt::int FROM base
            UNION ALL SELECT unitid, level, 'NRAL', 'men', efnralm::int FROM base
            UNION ALL SELECT unitid, level, 'NRAL', 'women', efnralw::int FROM base
        )
        INSERT INTO enrollment (unitid, year, level, race, gender, full_time, part_time)
        SELECT unitid, {year}, level, race, gender, full_time, 0 as part_time
        FROM unpivoted
        WHERE level IS NOT NULL
        ON CONFLICT (unitid, year, level, race, gender) DO UPDATE SET
            full_time = EXCLUDED.full_time,
            part_time = EXCLUDED.part_time
        """
        with conn.cursor() as cur:
            cur.execute(sql)
            count = cur.rowcount
        conn.commit()
        tlog.complete(count)

    logger.info(f"  Loaded {count} enrollment records")
    return count


def load_completions(conn, tracker: ETLTracker, year=2023):
    """Transform C2023_A into completions table.

    C2023_A has CIP codes, award levels, and counts by race/gender.
    awlevel: 1=cert<1yr, 2=cert1-2yr, 3=assoc, 5=bach, 7=masters, 9=doctor-research, etc.
    """
    logger.info(f"Loading completions for {year}...")

    with tracker.log_table("completions", "c2023_a") as tlog:
        # Unpivot race/gender columns
        sql = f"""
        WITH base AS (
            SELECT
                unitid,
                cipcode,
                awlevel,
                ctotalt, ctotalm, ctotalw,
                caiant, caianm, caianw,
                casiat, casiam, casiaw,
                cbkaat, cbkaam, cbkaaw,
                chispt, chispm, chispw,
                cnhpit, cnhpim, cnhpiw,
                cwhitt, cwhitm, cwhitw,
                c2mort, c2morm, c2morw,
                cunknt, cunknm, cunknw,
                cnralt, cnralm, cnralw
            FROM c2023_a
            WHERE unitid IN (SELECT unitid FROM institution)
              AND majornum = 1  -- Primary major only
        ),
        unpivoted AS (
            SELECT unitid, cipcode, awlevel, 'APTS' as race, 'total' as gender, ctotalt::int as count FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, 'APTS', 'men', ctotalm::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, 'APTS', 'women', ctotalw::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, 'AIAN', 'total', caiant::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, 'AIAN', 'men', caianm::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, 'AIAN', 'women', caianw::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, 'ASIA', 'total', casiat::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, 'ASIA', 'men', casiam::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, 'ASIA', 'women', casiaw::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, 'BKAA', 'total', cbkaat::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, 'BKAA', 'men', cbkaam::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, 'BKAA', 'women', cbkaaw::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, 'HISP', 'total', chispt::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, 'HISP', 'men', chispm::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, 'HISP', 'women', chispw::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, 'NHPI', 'total', cnhpit::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, 'NHPI', 'men', cnhpim::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, 'NHPI', 'women', cnhpiw::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, 'WHIT', 'total', cwhitt::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, 'WHIT', 'men', cwhitm::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, 'WHIT', 'women', cwhitw::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, '2MOR', 'total', c2mort::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, '2MOR', 'men', c2morm::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, '2MOR', 'women', c2morw::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, 'UNKN', 'total', cunknt::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, 'UNKN', 'men', cunknm::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, 'UNKN', 'women', cunknw::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, 'NRAL', 'total', cnralt::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, 'NRAL', 'men', cnralm::int FROM base
            UNION ALL SELECT unitid, cipcode, awlevel, 'NRAL', 'women', cnralw::int FROM base
        )
        INSERT INTO completions (unitid, year, cip_code, award_level, race, gender, count)
        SELECT unitid, {year}, cipcode, awlevel::int, race, gender, count
        FROM unpivoted
        ON CONFLICT (unitid, year, cip_code, award_level, race, gender) DO UPDATE SET
            count = EXCLUDED.count
        """
        with conn.cursor() as cur:
            cur.execute(sql)
            count = cur.rowcount
        conn.commit()
        tlog.complete(count)

    logger.info(f"  Loaded {count} completion records")
    return count


def load_financial_aid(conn, tracker: ETLTracker, year=2023):
    """Transform SFA2223 into financial_aid table.

    SFA2223 contains student financial aid data for the 2022-23 academic year
    (reported in the 2023 collection cycle).
    """
    logger.info(f"Loading financial aid for {year}...")

    with tracker.log_table("financial_aid", "sfa2223") as tlog:
        sql = f"""
        INSERT INTO financial_aid (unitid, year, undergrad_enrolled, pell_recipients,
                                   avg_net_price, avg_net_price_0_30k, avg_net_price_30_48k,
                                   avg_net_price_48_75k, avg_net_price_75_110k, avg_net_price_110k_plus)
        SELECT
            unitid,
            {year},
            scugrad::int,           -- Total undergrads
            uagrntp::int,           -- Pell recipients
            npist2::int,            -- Average net price (Title IV)
            npis412::int,           -- Net price $0-30k income
            npis422::int,           -- Net price $30-48k income
            npis432::int,           -- Net price $48-75k income
            npis442::int,           -- Net price $75-110k income
            npis452::int            -- Net price $110k+ income
        FROM sfa2223
        WHERE unitid IN (SELECT unitid FROM institution)
        ON CONFLICT (unitid, year) DO UPDATE SET
            undergrad_enrolled = EXCLUDED.undergrad_enrolled,
            pell_recipients = EXCLUDED.pell_recipients,
            avg_net_price = EXCLUDED.avg_net_price,
            avg_net_price_0_30k = EXCLUDED.avg_net_price_0_30k,
            avg_net_price_30_48k = EXCLUDED.avg_net_price_30_48k,
            avg_net_price_48_75k = EXCLUDED.avg_net_price_48_75k,
            avg_net_price_75_110k = EXCLUDED.avg_net_price_75_110k,
            avg_net_price_110k_plus = EXCLUDED.avg_net_price_110k_plus
        """
        with conn.cursor() as cur:
            cur.execute(sql)
            count = cur.rowcount
        conn.commit()
        tlog.complete(count)

    logger.info(f"  Loaded {count} financial aid records")
    return count


def main():
    logger.info("Connecting to PostgreSQL...")
    conn = psycopg2.connect(CONN_STRING)

    try:
        run_schema(conn)

        tracker = ETLTracker(conn, 2023)
        tracker.start_run()

        try:
            load_institutions(conn, tracker)
            load_admissions(conn, tracker)
            load_graduation_rates(conn, tracker)
            load_graduation_rates_pell(conn, tracker)
            load_enrollment(conn, tracker)
            load_completions(conn, tracker)
            load_financial_aid(conn, tracker)

            tracker.complete_run("completed")

            # Verification
            logger.info("Verification:")
            with conn.cursor() as cur:
                tables = [
                    "institution", "admissions", "graduation_rates",
                    "graduation_rates_pell", "enrollment", "completions", "financial_aid"
                ]
                for table in tables:
                    cur.execute(f"SELECT COUNT(*) FROM {table}")
                    logger.info(f"  {table}: {cur.fetchone()[0]:,} rows")

        except Exception as e:
            tracker.complete_run("failed", str(e))
            raise

    finally:
        conn.close()

    logger.info("All done!")


if __name__ == "__main__":
    main()
