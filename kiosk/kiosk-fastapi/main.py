__version__ = "v26.0.0"

import asyncio
import importlib
import inspect
import json
import os
import re
import threading
import traceback
from contextlib import asynccontextmanager
from pprint import pformat
from typing import Callable
import logging

import dotenv
import asyncpg
import ssl
import certifi
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

import runnable_functions as fn

calc = importlib.import_module("seasons.2026.calculator")

# =======================
# Constants
# =======================

ANSI_RED = "\x1b[31m"
ANSI_GREEN = "\x1b[32m"
ANSI_YELLOW = "\x1b[33m"
ANSI_PURPLE = "\x1b[35m"
ANSI_RESET = "\x1b[0m"
ANSI_REPLACE_LINE = "\x1b[1A\x1b[K"

# =======================
# Global state (single client kiosk)
# =======================
downloaded_data = None
calc_result = None
settings = {
    "event_key": "",
    "verbose": True,
}

active_ws: WebSocket | None = None
busy = False

python_globals = {
    "__builtins__": {
        "len": len,
        "range": range,
        "sum": sum,
        "min": min,
        "max": max,
        "print": lambda *a: log(" ".join(map(str, a))),
        "__import__": __import__,
    },
}

InputListener = Callable[[str], bool]

input_listeners: list[InputListener] = []

logger = logging.getLogger(__name__)

log_queue: asyncio.Queue[str] = asyncio.Queue()

main_event_loop = None

# =======================
# Database Config
# =======================
DB_DSN = ""

async def get_connection():
    if not DB_DSN:
        raise RuntimeError("DATABASE_URL not set in environment")
    ssl_context = ssl.create_default_context(cafile=certifi.where())
    conn = await asyncpg.connect(dsn=DB_DSN, ssl=ssl_context)
    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    await conn.set_type_codec("json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    return conn

# =======================
# App + event loop
# =======================
event_loop: asyncio.AbstractEventLoop | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global event_loop

    # Startup
    event_loop = asyncio.get_running_loop()

    yield  # app is running

    # Shutdown (nothing)


app = FastAPI(lifespan=lifespan)


def run_coro(coro):
    if not event_loop or event_loop.is_closed():
        return
    try:
        asyncio.run_coroutine_threadsafe(coro, event_loop)
    except RuntimeError:
        # loop shutting down
        pass


# =======================
# Worker helpers
# =======================
def run_in_thread(fn):
    def wrapper():
        try:
            fn()
        finally:
            set_busy(False)

    threading.Thread(target=wrapper, daemon=True).start()


def run_async(coro):
    async def wrapper():
        try:
            await coro
        finally:
            set_busy(False)

    run_coro(wrapper())


# =======================
# Commands
# =======================
async def cmd_download():
    global downloaded_data

    set_busy(True)
    log(f"\n=== START DOWNLOAD ===\n")

    try:
        log("→ Connecting to database...")
        conn = await get_connection()
        log(f"{ANSI_GREEN}  ✔ Database connected{ANSI_RESET}")

        event_key = settings.get("event_key", "") or ""
        log(f"  → Fetching data from {event_key or 'all events'}...")

        event_filter = f"%{event_key}%" if event_key else None

        # ── Match scouting ─────────────────────────────────────────────
        log("    → Fetching match data...")
        match_query = """
            SELECT event_key, match, match_type, team, alliance, scouter, data
            FROM match_scouting
            WHERE status = 'submitted'
        """
        if event_filter:
            match_query += " AND event_key ILIKE $1"
            rows = await conn.fetch(match_query, event_filter)
        else:
            rows = await conn.fetch(match_query + """
                ORDER BY match_type, match, alliance, team
            """)

        match = [dict(r) for r in rows]

        robot_entries = len(match)
        match_count = len({
            (r["event_key"], r["match_type"], r["match"])
            for r in match
        })

        log(
            f"{ANSI_GREEN if robot_entries else ANSI_YELLOW}"
            f"      {'✔' if robot_entries else '⚠'} "
            f"{robot_entries} robot entries "
            f"from {match_count} matches"
            f"{ANSI_RESET}"
        )

        # ── Pit scouting ───────────────────────────────────────────────
        log("    → Fetching team data...")
        pit_query = """
            SELECT event_key, team, scouter, data
            FROM pit_scouting
            WHERE status = 'submitted'
        """
        if event_filter:
            pit_query += " AND event_key ILIKE $1"
            rows = await conn.fetch(pit_query, event_filter)
        else:
            rows = await conn.fetch(pit_query + " ORDER BY team, scouter")

        pit = [dict(r) for r in rows]

        log(
            f"{ANSI_GREEN if pit else ANSI_YELLOW}"
            f"      {'✔' if pit else '⚠'} {len(pit)} pit entries{ANSI_RESET}"
        )

        # ── Match schedule ─────────────────────────────────────────────
        log("    → Fetching match schedules...")
        schedule_query = """
            SELECT key, event_key, match_type, match_number, set_number,
                   scheduled_time, actual_time,
                   red1, red2, red3, blue1, blue2, blue3
            FROM matches
        """
        if event_filter:
            schedule_query += " WHERE event_key ILIKE $1"
            rows = await conn.fetch(schedule_query, event_filter)
        else:
            rows = await conn.fetch(schedule_query + """
                ORDER BY event_key, match_type, match_number
            """)

        all_matches = [dict(r) for r in rows]

        log(
            f"{ANSI_GREEN if all_matches else ANSI_YELLOW}"
            f"      {'✔' if all_matches else '⚠'} {len(all_matches)} schedule entries{ANSI_RESET}"
        )

        downloaded_data = {
            "match_scouting": match,
            "pit_scouting": pit,
            "all_matches": all_matches,
        }

        await conn.close()
        log(f"\n{ANSI_GREEN}✔ Done{ANSI_RESET}\n")

    except Exception as e:
        log(f"{ANSI_RED}✖ {e}{ANSI_RESET}")
    finally:
        set_busy(False)


def cmd_run_calculator():
    global calc_result

    if not downloaded_data:
        log(f"{ANSI_RED}✖ No downloaded data found. Run Download first.{ANSI_RESET}")
        return

    set_busy(True)
    log(f"\n=== START CALCULATOR ===\n")

    def task():
        global calc_result
        try:
            result = calc.calculate_metrics(
                data=downloaded_data,
                log=log,
                settings=lambda: settings.copy(),
                lock_ui=lambda: set_busy(True),
                unlock_ui=lambda: set_busy(False),
            )

            if not isinstance(result, dict) or "status" not in result:
                log(f"{ANSI_RED}✖ Calculator returned unexpected format.{ANSI_RESET}")
                return

            calc_result = result

            if result["status"] == 0:
                log(f"\n{ANSI_GREEN}✔ Done{ANSI_RESET}\n")
            elif result["status"] == 1:
                log(f"{ANSI_RED}✖ Calculator failed{ANSI_RESET}")

        except Exception as e:
            log(f"{ANSI_RED}✖ {e}{ANSI_RESET}")
        finally:
            set_busy(False)

    run_in_thread(task)


async def cmd_upload():
    set_busy(True)
    log(f"\n=== START UPLOAD ===\n")

    if not calc_result or "result" not in calc_result:
        log(f"{ANSI_RED}✖ No calculator output found. Run Calculator first.{ANSI_RESET}")
        set_busy(False)
        return

    try:
        log("→ Connecting to database...")
        conn = await get_connection()
        log(f"{ANSI_GREEN}  ✔ Database connected{ANSI_RESET}")

        event_key = settings.get("event_key", "").strip()
        if not event_key:
            log(f"{ANSI_RED}  ✖ Event key filter is required for upload.{ANSI_RESET}")
            return

        if not await confirm(
                "  This upload will overwrite all previously processed data, make sure the data is approved before continuing."
        ):
            log("\x1b[33m⚠ Upload cancelled.\x1b[0m")
            return
        log("  → Uploading")

        await conn.execute(
            "INSERT INTO processed_data (event_key, data) VALUES ($1, $2)",
            event_key,
            json.dumps(calc_result["result"]),
        )
        log(f"    {ANSI_GREEN}✔ Upload Success{ANSI_RESET}\n")
        await conn.close()
        log(f"{ANSI_GREEN}✔ Done{ANSI_RESET}\n")

    except Exception as e:
        log(f"{ANSI_RED}✖ {e}{ANSI_RESET}")
    finally:
        set_busy(False)


COMMANDS = {
    "download": lambda: run_async(cmd_download()),
    "run": cmd_run_calculator,
    "upload": lambda: run_async(cmd_upload()),
}


def validate_env():
    """
    Runs environment validation and reports status via WebSocket.
    """
    global DB_DSN

    set_busy(True)
    log("\n=== ENVIRONMENT CHECK ===\n")
    log("→ Checking .env")

    # --- Check .env file ---
    if not os.path.exists("./.env"):
        log(f"{ANSI_RED}  ✖ Missing .env file in current directory.\x1b[0m")
        log(
            f"{ANSI_RED}  Please create a .env file with DATABASE_URL environment variable.\x1b[0m"
        )
        set_busy(False)
        return

    log(f"{ANSI_GREEN}  ✔ .env found\x1b[0m")

    dotenv.load_dotenv()
    DB_DSN = os.getenv("DATABASE_URL", "")

    pattern = re.compile(
        r"^postgresql://[^:]+:[^@]+@[^/]+\.c-\d+\.us-west-2\.aws\.neon\.tech/"
        r"neondb\?sslmode=require&channel_binding=require$"
    )

    if not DB_DSN:
        log(f"{ANSI_RED}  ✖ DATABASE_URL not found in .env\x1b[0m")
        set_busy(False)
        return

    if not pattern.match(DB_DSN):
        log(f"{ANSI_RED}  ✖ DATABASE_URL format appears invalid\x1b[0m")
        log(
            f"{ANSI_RED}  Expected:\n"
            "  postgresql://<username>:<password>@"
            "<location>.c-2.us-west-2.aws.neon.tech/neondb"
            "?sslmode=require&channel_binding=require\x1b[0m"
        )
        set_busy(False)
        return

    log(f"{ANSI_GREEN}  ✔ DATABASE_URL found\x1b[0m")
    log("  → Connecting to database...")

    required_tables = {
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

    # -----------------------------
    # Background DB test
    # -----------------------------
    def worker():
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

            async def test_db():
                try:
                    conn = await get_connection()
                except asyncpg.InvalidPasswordError:
                    log(f"{ANSI_RED}    ✖ Database authentication failed (invalid password)\x1b[0m")
                    return True
                except asyncpg.InvalidAuthorizationSpecificationError:
                    log(f"{ANSI_RED}    ✖ Database authorization failed\x1b[0m")
                    return True
                except asyncpg.PostgresError as e:
                    log(f"{ANSI_RED}    ✖ Database connection failed: {e}\x1b[0m")
                    return True
                except Exception as e:
                    log(f"{ANSI_RED}    ✖ Unexpected DB error: {e}\x1b[0m")
                    return True

                log(f"{ANSI_GREEN}    ✔ Database connected\x1b[0m")

                rows = await conn.fetch("""
                                        SELECT table_name
                                        FROM information_schema.tables
                                        WHERE table_schema = 'public';
                                        """)
                existing_tables = {r["table_name"] for r in rows}

                log("    → Checking tables...\x1b[0m")

                had_errors = False

                # ---- Table existence check ----
                for table in required_tables:
                    if table not in existing_tables:
                        log(f"{ANSI_RED}      ✖ Missing table: {table}\x1b[0m")
                        had_errors = True

                # ---- Column checks (only for tables that exist) ----
                for idx, (table, required_cols) in enumerate(required_tables.items(), start=1):
                    if table not in existing_tables:
                        continue

                    col_rows = await conn.fetch("""
                                                SELECT column_name
                                                FROM information_schema.columns
                                                WHERE table_schema = 'public'
                                                  AND table_name = $1;
                                                """, table)

                    existing_cols = {r["column_name"] for r in col_rows}
                    missing_cols = required_cols - existing_cols

                    if missing_cols:
                        log(
                            f"{ANSI_RED}      ✖ {table}: Missing columns: \x1b[0m"
                            f"{', '.join(sorted(missing_cols))}"
                        )
                        had_errors = True
                    else:
                        log(f"{ANSI_GREEN}      ✔ {table} checked\x1b[0m")

                await conn.close()
                return had_errors

            had_errors = loop.run_until_complete(test_db())
            loop.close()

            # ---- Final report ----
            def report():
                if not had_errors:
                    log(f"{ANSI_GREEN}\n✔ Environment OK\n\x1b[0m")
                else:
                    log(f"{ANSI_RED}\n✖ Environment check failed\n\x1b[0m")

                set_busy(False)

            run_coro(asyncio.to_thread(report))

        except Exception:
            log(traceback.format_exc())
            set_busy(False)

    threading.Thread(target=worker, daemon=True).start()


# =======================
# Python console (dangerous by design)
# =======================
def run_python(code: str):
    refresh_python_globals()
    log(f">>> {code}")

    try:
        compiled = compile(code, "<console>", "eval")
        result = eval(compiled, python_globals)
        if result is not None:
            log(str(result))
    except SyntaxError:
        try:
            compiled = compile(code, "<console>", "exec")
            exec(compiled, python_globals)
        except Exception:
            log(f"{ANSI_RED}{traceback.format_exc()}{ANSI_RESET}")
    except Exception:
        log(f"{ANSI_RED}{traceback.format_exc()}{ANSI_RESET}")


def route_console_input(text: str):
    # Traverse in LIFO order
    for listener in reversed(input_listeners):
        try:
            if listener(text):
                return  # consumed
        except Exception as e:
            log(f"{ANSI_RED}Listener error: {e}{ANSI_RESET}")
            return

    # Fallthrough → normal Python execution
    run_python(text)


def push_input_listener(fn: InputListener):
    input_listeners.append(fn)


def pop_input_listener(fn: InputListener | None = None):
    if not input_listeners:
        return
    if fn:
        input_listeners.remove(fn)
    else:
        input_listeners.pop()


def python_help():
    """
    Print help for all available symbols in the Python console, including shallow type for variables and doc string for functions
    """

    scope = python_globals

    def format_doc(obj):
        doc = getattr(obj, "__doc__", None)
        if not doc:
            return "    (no documentation)"
        lines = [l.rstrip() for l in doc.strip().splitlines()]
        return "\n".join("    " + l for l in lines)

    def format_signature(func):
        try:
            code = func.__code__
            args = code.co_varnames[:code.co_argcount]
            return f"({', '.join(args)})"
        except Exception:
            return "()"

    for name in sorted(scope):
        if name.startswith("_"):
            continue

        obj = scope[name]

        if callable(obj):
            sig = format_signature(obj)
            log(f"\n{name}{sig}")
            log("  type: function")
            log(format_doc(obj))
        else:
            log(f"\n{name}")
            log(f"  type: {type(obj).__name__}")


python_globals["help"] = python_help


def inject_module_functions(module, target_globals, *, prefix=None):
    """
    Inject public functions defined in `module` into target_globals.
    """
    for name, obj in vars(module).items():
        if name.startswith("_"):
            continue

        if inspect.isfunction(obj) and obj.__module__ == module.__name__:
            exposed_name = f"{prefix}{name}" if prefix else name
            target_globals[exposed_name] = obj


def refresh_python_globals():
    def send_ws_sync(msg: dict):
        """Send a message through websocket."""
        run_coro(ws_send(msg))

    python_globals.update({
        "downloaded_data": downloaded_data,
        "calc_result": calc_result,
        "settings": settings,
        "log": log,
        "pretty_log": pretty_log,
        "validate_env": validate_env,
        "inject_ws": handle_ws_message,
        "send_ws": send_ws_sync
    })

    fn.log = log
    fn.settings = settings
    fn.downloaded_data = downloaded_data
    fn.calc_result = calc_result
    fn.get_connection = get_connection
    fn.print = log # overriding builtins

    inject_module_functions(fn, python_globals)


# === Templates ===

def confirm(prompt: str) -> asyncio.Future:
    loop = event_loop
    fut: asyncio.Future[bool] = loop.create_future()

    log(f"{prompt} (y/n): ")

    def listener(text: str):
        t = text.strip().lower()

        log(f"\r{prompt} (y/n): {t}", newline=False)

        if t == "y":
            pop_input_listener(listener)
            fut.set_result(True)
            return True

        if t == "n":
            pop_input_listener(listener)
            fut.set_result(False)
            return True

        log("Please type 'y' or 'n'")
        return True

    push_input_listener(listener)
    return fut

# =======================
# WebSocket only endpoint
# =======================
@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    global active_ws, main_event_loop

    await ws.accept()
    active_ws = ws
    main_event_loop = asyncio.get_running_loop()

    # START THE LOG SENDER
    sender_task = asyncio.create_task(log_sender(ws))

    set_busy(True)
    log("\x1b[35m $$$$$$\  $$$$$$$\  $$$$$$$\   $$$$$$\   $$$$$$\  $$\   $$\ $$$$$$$$\ $$$$$$$$\  $$$$$$\ $$$$$$$$\  $$$$$$\ $$$$$$$$\  $$$$$$\  \x1b[0m")
    log("\x1b[35m$$  __$$\ $$  __$$\ $$  __$$\ $$  __$$\ $$  __$$\ $$ | $$  |$$  _____|\__$$  __|$$  __$$\\\__$$  __|$$  __$$\\\__$$  __|$$  __$$\ \x1b[0m")
    log("\x1b[35m$$ /  \__|$$ |  $$ |$$ |  $$ |$$ /  $$ |$$ /  \__|$$ |$$  / $$ |         $$ |   $$ /  \__|  $$ |   $$ /  $$ |  $$ |   $$ /  \__|\x1b[0m")
    log("\x1b[35m\$$$$$$\  $$$$$$$  |$$$$$$$  |$$ |  $$ |$$ |      $$$$$  /  $$$$$\       $$ |   \$$$$$$\    $$ |   $$$$$$$$ |  $$ |   \$$$$$$\  \x1b[0m")
    log("\x1b[35m \____$$\ $$  ____/ $$  __$$< $$ |  $$ |$$ |      $$  $$<   $$  __|      $$ |    \____$$\   $$ |   $$  __$$ |  $$ |    \____$$\ \x1b[0m")
    log("\x1b[35m$$\   $$ |$$ |      $$ |  $$ |$$ |  $$ |$$ |  $$\ $$ |\$$\  $$ |         $$ |   $$\   $$ |  $$ |   $$ |  $$ |  $$ |   $$\   $$ |\x1b[0m")
    log("\x1b[35m\$$$$$$  |$$ |      $$ |  $$ | $$$$$$  |\$$$$$$  |$$ | \$$\ $$$$$$$$\    $$ |   \$$$$$$  |  $$ |   $$ |  $$ |  $$ |   \$$$$$$  |\x1b[0m")
    log("\x1b[35m \______/ \__|      \__|  \__| \______/  \______/ \__|  \__|\________|   \__|    \______/   \__|   \__|  \__|  \__|    \______/\x1b[0m")
    log("Welcome to the Sprocketstats analytics engine!")
    log("Use help() to see available methods and variables\n")

    validate_env()

    try:
        while True:
            msg = await ws.receive_json()
            handle_ws_message(msg)

    except WebSocketDisconnect:
        sender_task.cancel()
        active_ws = None


# =======================
# WS helpers
# =======================
def handle_ws_message(msg: dict):
    """
    Process websocket messages
    """
    t = msg.get("type")

    if t == "command":
        name = msg.get("name")
        if name in COMMANDS:
            COMMANDS[name]()
        else:
            log(f"Unknown command: {name}")

    elif t == "set_settings":
        settings.update(msg.get("payload", {}))

    elif t == "python":
        route_console_input(msg.get("code", ""))

    else:
        log(f"Unknown WS packet type: {t}")


async def ws_send(msg: dict):
    global active_ws
    if not active_ws:
        return
    try:
        await active_ws.send_json(msg)
    except Exception:
        active_ws = None

async def log_sender(ws: WebSocket):
    while True:
        msg = await log_queue.get()
        await ws.send_json({"type": "log", "text": msg})


def log(msg: str, newline: bool = True):
    """
    Sends message to console
    """
    logger.info(msg)
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(log_queue.put(f"\n{msg}" if newline else msg))
    except RuntimeError:
        asyncio.run_coroutine_threadsafe(
            log_queue.put(f"\n{msg}" if newline else msg),
            main_event_loop
        )


def pretty_log(
    obj,
    *,
    prefix: str | None = None,
    width: int = 120,
    depth: int | None = None,
    compact: bool = False,
    sort_dicts: bool = True,
):
    """
    Pretty-format an object and send it to the websocket log.
    """
    formatted = pformat(
        obj,
        width=width,
        depth=depth,
        compact=compact,
        sort_dicts=sort_dicts,
    )

    if prefix:
        formatted = f"{prefix}\n{formatted}"

    log(formatted)


def set_busy(val: bool):
    global busy
    busy = val
    run_coro(ws_send({"type": "state", "busy": val}))
