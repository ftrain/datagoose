"""
Transform raw IPEDS data for any year into normalized schema.

Generic transformer that handles whatever tables are available.
"""

import argparse
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
                ("transform", self.data_year, f'{{"stage": "normalized", "year": {self.data_year}}}')
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
            self.conn.rollback()
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


def table_exists(conn, table_name: str) -> bool:
    """Check if a table exists."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_name = %s
            )
        """, (table_name,))
        return cur.fetchone()[0]


def run_schema(conn):
    """Create schema tables if they don't exist."""
    logger.info("Ensuring schema exists...")
    with open(SCHEMA_FILE) as f:
        sql = f.read()
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()
    logger.info("  Done")


def load_institutions(conn, tracker: ETLTracker, year: int):
    """Transform HD{year} into institution table."""
    source_table = f"hd{year}"
    if not table_exists(conn, source_table):
        logger.info(f"Skipping institutions - {source_table} not found")
        return 0

    logger.info("Loading institutions...")

    with tracker.log_table("institution", source_table) as tlog:
        sql = f"""
        INSERT INTO institution (unitid, name, city, state, zip, latitude, longitude,
                                 sector, control, level, hbcu, tribal)
        SELECT
            unitid,
            instnm,
            city,
            stabbr,
            zip,
            NULLIF(latitude::text, '.')::double precision,
            NULLIF(longitud::text, '.')::double precision,
            sector::integer,
            control::integer,
            iclevel::integer,
            CASE WHEN hbcu = 1 THEN true ELSE false END,
            CASE WHEN tribal = 1 THEN true ELSE false END
        FROM {source_table}
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


def load_admissions(conn, tracker: ETLTracker, year: int):
    """Transform ADM{year} into admissions table."""
    source_table = f"adm{year}"
    if not table_exists(conn, source_table):
        logger.info(f"Skipping admissions - {source_table} not found")
        return 0

    logger.info(f"Loading admissions for {year}...")

    with tracker.log_table("admissions", source_table) as tlog:
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
        FROM {source_table}
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


def load_graduation_rates(conn, tracker: ETLTracker, year: int):
    """Transform GR{year} into graduation_rates table."""
    source_table = f"gr{year}"
    if not table_exists(conn, source_table):
        logger.info(f"Skipping graduation rates - {source_table} not found")
        return 0

    logger.info(f"Loading graduation rates for {year}...")

    with tracker.log_table("graduation_rates", source_table) as tlog:
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
            FROM {source_table} WHERE grtype = 8
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
            FROM {source_table} WHERE grtype = 12
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
            FROM {source_table} WHERE grtype = 16
        ),
        unpivoted AS (
            SELECT c.unitid, 'APTS' as race, 'total' as gender, c.total::int as cohort_size, comp.total::int as completers_150pct, t.total::int as transfer_out
            FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, 'APTS', 'men', c.men::int, comp.men::int, t.men::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, 'APTS', 'women', c.women::int, comp.women::int, t.women::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, 'AIAN', 'total', c.aian_t::int, comp.aian_t::int, t.aian_t::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, 'AIAN', 'men', c.aian_m::int, comp.aian_m::int, t.aian_m::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, 'AIAN', 'women', c.aian_w::int, comp.aian_w::int, t.aian_w::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, 'ASIA', 'total', c.asia_t::int, comp.asia_t::int, t.asia_t::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, 'ASIA', 'men', c.asia_m::int, comp.asia_m::int, t.asia_m::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, 'ASIA', 'women', c.asia_w::int, comp.asia_w::int, t.asia_w::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, 'BKAA', 'total', c.bkaa_t::int, comp.bkaa_t::int, t.bkaa_t::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, 'BKAA', 'men', c.bkaa_m::int, comp.bkaa_m::int, t.bkaa_m::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, 'BKAA', 'women', c.bkaa_w::int, comp.bkaa_w::int, t.bkaa_w::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, 'HISP', 'total', c.hisp_t::int, comp.hisp_t::int, t.hisp_t::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, 'HISP', 'men', c.hisp_m::int, comp.hisp_m::int, t.hisp_m::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, 'HISP', 'women', c.hisp_w::int, comp.hisp_w::int, t.hisp_w::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, 'NHPI', 'total', c.nhpi_t::int, comp.nhpi_t::int, t.nhpi_t::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, 'NHPI', 'men', c.nhpi_m::int, comp.nhpi_m::int, t.nhpi_m::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, 'NHPI', 'women', c.nhpi_w::int, comp.nhpi_w::int, t.nhpi_w::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, 'WHIT', 'total', c.whit_t::int, comp.whit_t::int, t.whit_t::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, 'WHIT', 'men', c.whit_m::int, comp.whit_m::int, t.whit_m::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, 'WHIT', 'women', c.whit_w::int, comp.whit_w::int, t.whit_w::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, '2MOR', 'total', c.tmor_t::int, comp.tmor_t::int, t.tmor_t::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, '2MOR', 'men', c.tmor_m::int, comp.tmor_m::int, t.tmor_m::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, '2MOR', 'women', c.tmor_w::int, comp.tmor_w::int, t.tmor_w::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, 'UNKN', 'total', c.unkn_t::int, comp.unkn_t::int, t.unkn_t::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, 'UNKN', 'men', c.unkn_m::int, comp.unkn_m::int, t.unkn_m::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, 'UNKN', 'women', c.unkn_w::int, comp.unkn_w::int, t.unkn_w::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, 'NRAL', 'total', c.nral_t::int, comp.nral_t::int, t.nral_t::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, 'NRAL', 'men', c.nral_m::int, comp.nral_m::int, t.nral_m::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
            UNION ALL SELECT c.unitid, 'NRAL', 'women', c.nral_w::int, comp.nral_w::int, t.nral_w::int FROM cohorts c LEFT JOIN completers comp ON c.unitid = comp.unitid LEFT JOIN transfers t ON c.unitid = t.unitid
        )
        INSERT INTO graduation_rates (unitid, year, cohort_type, race, gender, cohort_size, completers_150pct, transfer_out)
        SELECT unitid, {year}, 'bachelor', race, gender, cohort_size, completers_150pct, transfer_out
        FROM unpivoted WHERE unitid IN (SELECT unitid FROM institution)
        ON CONFLICT (unitid, year, cohort_type, race, gender) DO UPDATE SET
            cohort_size = EXCLUDED.cohort_size, completers_150pct = EXCLUDED.completers_150pct, transfer_out = EXCLUDED.transfer_out
        """
        with conn.cursor() as cur:
            cur.execute(sql)
            count = cur.rowcount
        conn.commit()
        tlog.complete(count)

    logger.info(f"  Loaded {count} graduation rate records")
    return count


def load_graduation_rates_pell(conn, tracker: ETLTracker, year: int):
    """Transform GR{year}_PELL_SSL into graduation_rates_pell table."""
    source_table = f"gr_pell_ssl{year}"
    if not table_exists(conn, source_table):
        logger.info(f"Skipping Pell graduation rates - {source_table} not found")
        return 0

    logger.info(f"Loading Pell graduation rates for {year}...")

    with tracker.log_table("graduation_rates_pell", source_table) as tlog:
        sql = f"""
        INSERT INTO graduation_rates_pell (unitid, year, cohort_type, pell_status, cohort_size, completers_150pct)
        SELECT unitid, {year}, 'bachelor',
            CASE psgrtype WHEN 1 THEN 'total' WHEN 2 THEN 'pell' WHEN 3 THEN 'non_pell_loan' WHEN 4 THEN 'neither' END,
            pgadjct::int, pgcmbac::int
        FROM {source_table}
        WHERE unitid IN (SELECT unitid FROM institution) AND psgrtype IN (1, 2, 3, 4)
        ON CONFLICT (unitid, year, cohort_type, pell_status) DO UPDATE SET
            cohort_size = EXCLUDED.cohort_size, completers_150pct = EXCLUDED.completers_150pct
        """
        with conn.cursor() as cur:
            cur.execute(sql)
            count = cur.rowcount
        conn.commit()
        tlog.complete(count)

    logger.info(f"  Loaded {count} Pell graduation rate records")
    return count


def load_enrollment(conn, tracker: ETLTracker, year: int):
    """Transform EF{year}A into enrollment table."""
    source_table = f"efa{year}"
    if not table_exists(conn, source_table):
        logger.info(f"Skipping enrollment - {source_table} not found")
        return 0

    logger.info(f"Loading enrollment for {year}...")

    with tracker.log_table("enrollment", source_table) as tlog:
        sql = f"""
        WITH base AS (
            SELECT unitid,
                CASE efalevel WHEN 1 THEN 'all' WHEN 2 THEN 'undergraduate' WHEN 4 THEN 'graduate' END as level,
                eftotlt, eftotlm, eftotlw, efaiant, efaianm, efaianw, efasiat, efasiam, efasiaw,
                efbkaat, efbkaam, efbkaaw, efhispt, efhispm, efhispw, efnhpit, efnhpim, efnhpiw,
                efwhitt, efwhitm, efwhitw, ef2mort, ef2morm, ef2morw, efunknt, efunknm, efunknw,
                efnralt, efnralm, efnralw
            FROM {source_table} WHERE efalevel IN (1, 2, 4) AND unitid IN (SELECT unitid FROM institution)
        ),
        unpivoted AS (
            SELECT unitid, level, 'APTS' as race, 'total' as gender, eftotlt::int as full_time FROM base
            UNION ALL SELECT unitid, level, 'APTS', 'men', eftotlm::int FROM base
            UNION ALL SELECT unitid, level, 'APTS', 'women', eftotlw::int FROM base
            UNION ALL SELECT unitid, level, 'AIAN', 'total', efaiant::int FROM base
            UNION ALL SELECT unitid, level, 'AIAN', 'men', efaianm::int FROM base
            UNION ALL SELECT unitid, level, 'AIAN', 'women', efaianw::int FROM base
            UNION ALL SELECT unitid, level, 'ASIA', 'total', efasiat::int FROM base
            UNION ALL SELECT unitid, level, 'ASIA', 'men', efasiam::int FROM base
            UNION ALL SELECT unitid, level, 'ASIA', 'women', efasiaw::int FROM base
            UNION ALL SELECT unitid, level, 'BKAA', 'total', efbkaat::int FROM base
            UNION ALL SELECT unitid, level, 'BKAA', 'men', efbkaam::int FROM base
            UNION ALL SELECT unitid, level, 'BKAA', 'women', efbkaaw::int FROM base
            UNION ALL SELECT unitid, level, 'HISP', 'total', efhispt::int FROM base
            UNION ALL SELECT unitid, level, 'HISP', 'men', efhispm::int FROM base
            UNION ALL SELECT unitid, level, 'HISP', 'women', efhispw::int FROM base
            UNION ALL SELECT unitid, level, 'NHPI', 'total', efnhpit::int FROM base
            UNION ALL SELECT unitid, level, 'NHPI', 'men', efnhpim::int FROM base
            UNION ALL SELECT unitid, level, 'NHPI', 'women', efnhpiw::int FROM base
            UNION ALL SELECT unitid, level, 'WHIT', 'total', efwhitt::int FROM base
            UNION ALL SELECT unitid, level, 'WHIT', 'men', efwhitm::int FROM base
            UNION ALL SELECT unitid, level, 'WHIT', 'women', efwhitw::int FROM base
            UNION ALL SELECT unitid, level, '2MOR', 'total', ef2mort::int FROM base
            UNION ALL SELECT unitid, level, '2MOR', 'men', ef2morm::int FROM base
            UNION ALL SELECT unitid, level, '2MOR', 'women', ef2morw::int FROM base
            UNION ALL SELECT unitid, level, 'UNKN', 'total', efunknt::int FROM base
            UNION ALL SELECT unitid, level, 'UNKN', 'men', efunknm::int FROM base
            UNION ALL SELECT unitid, level, 'UNKN', 'women', efunknw::int FROM base
            UNION ALL SELECT unitid, level, 'NRAL', 'total', efnralt::int FROM base
            UNION ALL SELECT unitid, level, 'NRAL', 'men', efnralm::int FROM base
            UNION ALL SELECT unitid, level, 'NRAL', 'women', efnralw::int FROM base
        )
        INSERT INTO enrollment (unitid, year, level, race, gender, full_time, part_time)
        SELECT unitid, {year}, level, race, gender, full_time, 0 FROM unpivoted WHERE level IS NOT NULL
        ON CONFLICT (unitid, year, level, race, gender) DO UPDATE SET full_time = EXCLUDED.full_time, part_time = EXCLUDED.part_time
        """
        with conn.cursor() as cur:
            cur.execute(sql)
            count = cur.rowcount
        conn.commit()
        tlog.complete(count)

    logger.info(f"  Loaded {count} enrollment records")
    return count


def load_completions(conn, tracker: ETLTracker, year: int):
    """Transform C{year}_A into completions table."""
    source_table = f"c_a{year}"
    if not table_exists(conn, source_table):
        logger.info(f"Skipping completions - {source_table} not found")
        return 0

    logger.info(f"Loading completions for {year}...")

    with tracker.log_table("completions", source_table) as tlog:
        sql = f"""
        WITH base AS (
            SELECT unitid, cipcode, awlevel,
                ctotalt, ctotalm, ctotalw, caiant, caianm, caianw, casiat, casiam, casiaw,
                cbkaat, cbkaam, cbkaaw, chispt, chispm, chispw, cnhpit, cnhpim, cnhpiw,
                cwhitt, cwhitm, cwhitw, c2mort, c2morm, c2morw, cunknt, cunknm, cunknw,
                cnralt, cnralm, cnralw
            FROM {source_table} WHERE unitid IN (SELECT unitid FROM institution) AND majornum = 1
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
        SELECT unitid, {year}, cipcode, awlevel::int, race, gender, count FROM unpivoted
        ON CONFLICT (unitid, year, cip_code, award_level, race, gender) DO UPDATE SET count = EXCLUDED.count
        """
        with conn.cursor() as cur:
            cur.execute(sql)
            count = cur.rowcount
        conn.commit()
        tlog.complete(count)

    logger.info(f"  Loaded {count} completion records")
    return count


def load_financial_aid(conn, tracker: ETLTracker, year: int):
    """Transform SFA{year} into financial_aid table."""
    # Check both naming conventions: sfa{year} (from load_year.py) or sfa{yy-1}{yy}
    source_table = f"sfa{year}"
    if not table_exists(conn, source_table):
        # Try academic year format: 2023 -> sfa2223
        sfa_year = f"{(year-1) % 100:02d}{year % 100:02d}"
        source_table = f"sfa{sfa_year}"
    if not table_exists(conn, source_table):
        logger.info(f"Skipping financial aid - {source_table} not found")
        return 0

    logger.info(f"Loading financial aid for {year}...")

    with tracker.log_table("financial_aid", source_table) as tlog:
        # IPEDS uses different columns for public vs private institutions:
        # - npis4XX = Net Price In-State (for public institutions)
        # - npt4XX = Net Price Total (for private institutions)
        # - npist2 = Overall net price for public (Title IV grant recipients)
        # - npgrn2 = Overall net price for private (Title IV grant recipients)
        # Use COALESCE to pick the appropriate value based on institution type
        sql = f"""
        INSERT INTO financial_aid (unitid, year, undergrad_enrolled, pell_recipients,
                                   avg_net_price, avg_net_price_0_30k, avg_net_price_30_48k,
                                   avg_net_price_48_75k, avg_net_price_75_110k, avg_net_price_110k_plus)
        SELECT unitid, {year}, scugrad::int, uagrntp::int,
               COALESCE(npist2, npgrn2)::int,
               COALESCE(npis412, npt412)::int,
               COALESCE(npis422, npt422)::int,
               COALESCE(npis432, npt432)::int,
               COALESCE(npis442, npt442)::int,
               COALESCE(npis452, npt452)::int
        FROM {source_table} WHERE unitid IN (SELECT unitid FROM institution)
        ON CONFLICT (unitid, year) DO UPDATE SET
            undergrad_enrolled = EXCLUDED.undergrad_enrolled, pell_recipients = EXCLUDED.pell_recipients,
            avg_net_price = EXCLUDED.avg_net_price, avg_net_price_0_30k = EXCLUDED.avg_net_price_0_30k,
            avg_net_price_30_48k = EXCLUDED.avg_net_price_30_48k, avg_net_price_48_75k = EXCLUDED.avg_net_price_48_75k,
            avg_net_price_75_110k = EXCLUDED.avg_net_price_75_110k, avg_net_price_110k_plus = EXCLUDED.avg_net_price_110k_plus
        """
        with conn.cursor() as cur:
            cur.execute(sql)
            count = cur.rowcount
        conn.commit()
        tlog.complete(count)

    logger.info(f"  Loaded {count} financial aid records")
    return count


def transform_year(year: int):
    """Transform all available IPEDS tables for a given year."""
    logger.info(f"Transforming IPEDS data for {year}...")
    conn = psycopg2.connect(CONN_STRING)

    try:
        run_schema(conn)

        tracker = ETLTracker(conn, year)
        tracker.start_run()

        try:
            load_institutions(conn, tracker, year)
            load_admissions(conn, tracker, year)
            load_graduation_rates(conn, tracker, year)
            load_graduation_rates_pell(conn, tracker, year)
            load_enrollment(conn, tracker, year)
            load_completions(conn, tracker, year)
            load_financial_aid(conn, tracker, year)

            tracker.complete_run("completed")

            # Verification
            logger.info("Verification:")
            with conn.cursor() as cur:
                for table in ["institution", "admissions", "graduation_rates", "graduation_rates_pell", "enrollment", "completions", "financial_aid"]:
                    if table == "institution":
                        cur.execute(f"SELECT COUNT(*) FROM {table}")
                    else:
                        cur.execute(f"SELECT COUNT(*) FROM {table} WHERE year = %s", (year,))
                    logger.info(f"  {table}: {cur.fetchone()[0]:,} rows")

        except Exception as e:
            tracker.complete_run("failed", str(e))
            raise

    finally:
        conn.close()

    logger.info("Done!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Transform IPEDS data for a given year")
    parser.add_argument("year", type=int, help="Year to transform (e.g., 2023)")
    args = parser.parse_args()

    transform_year(args.year)
