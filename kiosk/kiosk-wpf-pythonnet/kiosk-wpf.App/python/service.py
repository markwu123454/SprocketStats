import sys
import os
import traceback
import time
import ssl
import asyncio

import dotenv
import numpy
import asyncpg
import certifi  

_log = None
DATABASE_KEY = ""
DATABASE_SCHEMA = {
    "match_scouting": {
        "match", "match_type", "team", "alliance", "scouter",
        "status", "data", "last_modified", "event_key"
    },
    "matches": {
        "key", "event_key", "match_type", "match_number",
        "set_number", "scheduled_time", "actual_time",
        "red1", "red2", "red3", "blue1", "blue2", "blue3"
    },
    "matches_tba": {
        "match_key", "event_key", "match_number",
        "winning_alliance", "red_teams", "blue_teams",
        "red_score", "blue_score",
        "red_rp", "blue_rp",
        "red_auto_points", "blue_auto_points",
        "red_teleop_points", "blue_teleop_points",
        "red_endgame_points", "blue_endgame_points",
        "score_breakdown", "videos",
        "red_coopertition_criteria", "blue_coopertition_criteria"
    },
    "pit_scouting": {
        "event_key", "team", "scouter",
        "status", "data", "last_modified"
    },
    "processed_data": {
        "event_key", "time_added", "data"
    }
}

# you can use \x1B[A\x1B[K to delete previous line and write over it

class _CSharpStdout:
    def write(self, text):
        if _log and text.strip():
            _log(text.rstrip())

    def flush(self):
        pass  # required by file-like interface


def register_logger(cb):
    global _log
    _log = cb

    # Redirect stdout and stderr
    sys.stdout = _CSharpStdout()
    sys.stderr = _CSharpStdout()


def log(msg: str):
    if _log:
        _log(msg)


def run_calculation(path: str) -> str:
    print(f"Running calculation on {path}")
    print("This is a normal print()")
    time.sleep(5)
    return f"Processed {path}"


def exec_command(code: str):
    """
    Execute arbitrary Python code using full global and local scope.
    Exceptions are caught and printed with a red ANSI traceback.
    """
    try:
        # Use module globals so state persists across calls
        exec(code, globals(), globals())
    except Exception as e:
        try:
            print(f"\x1b[31m{traceback.format_exc()}\x1b[0m")
        except Exception:
            print(f"\x1b[31mUnhandled error: {e}\x1b[0m")


_set_busy_cb = None


def register_set_busy(cb):
    global _set_busy_cb
    _set_busy_cb = cb


def set_busy(value: bool):
    if _set_busy_cb:
        _set_busy_cb(value)

async def verify_db():
    """
    Validate database connectivity and schema using:
      - global DATABASE_KEY   (DSN / connection string)
      - global DATABASE_SCHEMA (dict[str, set[str]] mapping table -> required columns)

    Returns: (ok: bool, errors: list[str])
    """
    global DATABASE_KEY, DATABASE_SCHEMA

    errors: list[str] = []

    if not DATABASE_KEY:
        return False, ["DATABASE_KEY is not set"]

    if not isinstance(DATABASE_SCHEMA, dict) or not DATABASE_SCHEMA:
        return False, ["DATABASE_SCHEMA is not defined or empty"]

    conn = None
    try:
        ssl_context = ssl.create_default_context(cafile=certifi.where())
        conn = await asyncpg.connect(dsn=DATABASE_KEY, ssl=ssl_context)

        # --- fetch tables ---
        rows = await conn.fetch("""
                                SELECT table_name
                                FROM information_schema.tables
                                WHERE table_schema = 'public';
                                """)
        existing_tables = {r["table_name"] for r in rows}

        # --- table checks ---
        for table in DATABASE_SCHEMA:
            if table not in existing_tables:
                errors.append(f"Missing table: {table}")

        # --- column checks ---
        for table, required_cols in DATABASE_SCHEMA.items():
            if table not in existing_tables:
                continue

            col_rows = await conn.fetch("""
                                        SELECT column_name
                                        FROM information_schema.columns
                                        WHERE table_schema = 'public'
                                          AND table_name = $1;
                                        """, table)

            existing_cols = {r["column_name"] for r in col_rows}
            missing = set(required_cols) - existing_cols
            if missing:
                errors.append(
                    f"{table}: missing columns: {', '.join(sorted(missing))}"
                )

        return len(errors) == 0, errors

    except asyncpg.InvalidPasswordError:
        return False, ["Authentication failed"]
    except asyncpg.InvalidAuthorizationSpecificationError:
        return False, ["Authorization failed"]
    except asyncpg.PostgresError as e:
        return False, [f"Postgres error: {e}"]
    except Exception as e:
        return False, [f"Unexpected error: {e}"]
    finally:
        if conn:
            await conn.close()

def python_init():
    global DATABASE_KEY

    has_Errored = False
    got_db_key = False
    errors = []

    print("Loading... Checking environment")

    try:
        env_path = dotenv.find_dotenv()
        dotenv.load_dotenv(env_path, override=True)
        DATABASE_KEY = os.getenv("DATABASE_KEY")
        if not DATABASE_KEY:
            errors.append("DATABASE_KEY is missing. Run 'DATABASE_KEY=\"...\"' then 'verify_db()' in the console or add DATABASE_KEY to your .env file.")
            has_Errored = True
        else:
            got_db_key = True
    except Exception as e:
        errors.append(str(e))
        has_Errored = True

    print("Loading... Checking database")

    try:
        if got_db_key:
            ok, db_errors = asyncio.run(verify_db())
            if not ok:
                errors.extend(db_errors)
                has_Errored = True
        else:
            errors.append("Database validation skipped due to missing DATABASE_KEY.")
            has_Errored = True
    except Exception as e:
        errors.append(f"verify_db failed: {e}")
        has_Errored = True

    print("Done.")

    time.sleep(1)

    # clear screen
    print("\x1b[J")

    # banner (unchanged)
    print("\x1b[35m $$$$$$\  $$$$$$$\  $$$$$$$\   $$$$$$\   $$$$$$\  $$\   $$\ $$$$$$$$\ $$$$$$$$\   $$$$$$\ $$$$$$$$\  $$$$$$\ $$$$$$$$\  $$$$$$\  \x1b[0m")
    print("\x1b[35m$$  __$$\ $$  __$$\ $$  __$$\ $$  __$$\ $$  __$$\ $$ | $$  |$$  _____|\__$$  __| $$  __$$\\\__$$  __|$$  __$$\\\__$$  __|$$  __$$\ \x1b[0m")
    print("\x1b[35m$$ /  \__|$$ |  $$ |$$ |  $$ |$$ /  $$ |$$ /  \__|$$ |$$  / $$ |         $$ |    $$ /  \__|  $$ |   $$ /  $$ |  $$ |   $$ /  \__|\x1b[0m")
    print("\x1b[35m\$$$$$$\  $$$$$$$  |$$$$$$$  |$$ |  $$ |$$ |      $$$$$  /  $$$$$\       $$ |    \$$$$$$\    $$ |   $$$$$$$$ |  $$ |   \$$$$$$\  \x1b[0m")
    print("\x1b[35m \____$$\ $$  ____/ $$  __$$< $$ |  $$ |$$ |      $$  $$<   $$  __|      $$ |     \____$$\   $$ |   $$  __$$ |  $$ |    \____$$\ \x1b[0m")
    print("\x1b[35m$$\   $$ |$$ |      $$ |  $$ |$$ |  $$ |$$ |  $$\ $$ |\$$\  $$ |         $$ |    $$\   $$ |  $$ |   $$ |  $$ |  $$ |   $$\   $$ |\x1b[0m")
    print("\x1b[35m\$$$$$$  |$$ |      $$ |  $$ | $$$$$$  |\$$$$$$  |$$ | \$$\ $$$$$$$$\    $$ |    \$$$$$$  |  $$ |   $$ |  $$ |  $$ |   \$$$$$$  |\x1b[0m")
    print("\x1b[35m \______/ \__|      \__|  \__| \______/  \______/ \__|  \__|\________|   \__|     \______/   \__|   \__|  \__|  \__|    \______/\x1b[0m")

    if not has_Errored:
        print("\x1b[32mInitialization complete.\x1b[0m")
    else:
        for err in errors:
            print(f"\x1b[31m{err}\x1b[0m")
        print("\x1b[33mInitialization complete with errors.\x1b[0m")

def run_async(function):
    asyncio.run(function())
    print("Done")