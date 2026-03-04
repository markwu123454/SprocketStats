"""
Database Manager for Scouting Application (JSON-over-stdio version)
====================================================================

This module provides database connectivity, data download/upload functionality,
and calculation processing for FRC scouting data stored in PostgreSQL.

Communication: JSON over stdin/stdout for C# integration
Real-time logging: Emits log events during execution for streaming output

Key Components:
    - Database connection management with SSL
    - Data download from multiple scouting tables
    - Data upload to processed_data table
    - Database schema validation
    - Async operation support via JSON commands
    - Real-time log streaming
"""

# 1. Standard library
import asyncio
import random
import string
import time
import traceback
import types

# 2. Third-party/installed
import jedi

# 3. Local/custom
# noinspection PyUnresolvedReferences
import frc_score_tracker_lib
from calculator import *
from logger import *
from context import ctx
from export import *

FRCScoreTracker = ScoreRegionConfig = None

REPL_GLOBALS = globals()

# Configure stderr to be unbuffered for real-time logging
sys.stderr.reconfigure(line_buffering=True)

# ============================================================================
# INITIALIZATION
# ============================================================================

def _check_dependencies(log):
    """
    Check for required Python packages.

    Args:
        log: Logger instance for output

    Returns:
        list: Missing package names
    """
    missing_packages = []

    try:
        import cv2
    except Exception as e:
        missing_packages.append(f"opencv-python (import failed: {e})")
        log.warn(f"Missing: {Logger.CYAN}opencv-python{Logger.RESET}")

    try:
        import pytesseract
    except ImportError:
        missing_packages.append("pytesseract")
        log.warn(f"Missing: {Logger.CYAN}pytesseract{Logger.RESET}")

    try:
        import PIL
    except ImportError:
        missing_packages.append("Pillow")
        log.warn(f"Missing: {Logger.CYAN}Pillow{Logger.RESET}")

    try:
        import yt_dlp
    except ImportError:
        missing_packages.append("yt-dlp")
        log.warn(f"Missing: {Logger.CYAN}yt-dlp{Logger.RESET}")

    return missing_packages


def python_init():
    """Initialize the Python environment and validate database connectivity."""
    log = Logger()

    has_errored = False
    got_db_key = False
    errors = []
    warnings = []

    log.header("INITIALIZATION")

    # -- Environment --------------------------------------------------------
    log.step("Checking environment...")

    try:
        env_errors = ctx.load_env()
        if env_errors:
            errors.extend(env_errors)
            has_errored = True
            for err in env_errors:
                log.error(err)
        else:
            got_db_key = True
            log.success("Environment loaded")
    except Exception as e:
        errors.append(str(e))
        has_errored = True
        log.error(f"Environment error: {e}")

    # -- Dependencies -------------------------------------------------------
    log.step("Checking dependencies...")

    missing_packages = _check_dependencies(log)

    if missing_packages:
        errors.append(f"Missing Python packages: {', '.join(missing_packages)}")
        has_errored = True
    else:
        log.success("All dependencies found")

    # -- Database -----------------------------------------------------------
    log.step("Checking database...")

    try:
        if got_db_key:
            ok, db_errors = ctx.run_async(ctx.verify_db())
            if not ok:
                errors.extend(db_errors)
                has_errored = True
                for err in db_errors:
                    log.error(err)
            else:
                log.success("Database schema verified")
        else:
            errors.append("Database validation skipped (missing DATABASE_KEY)")
            has_errored = True
            log.warn("Database validation skipped")
    except Exception as e:
        errors.append(f"verify_db failed: {e}")
        has_errored = True
        log.error(f"verify_db failed: {e}")

    # -- Score tracker library ----------------------------------------------
    if not has_errored:
        try:
            import frc_score_tracker_lib  # noqa: F401
            log.success("FRC score tracker loaded")
        except ImportError:
            warnings.append("FRC score tracker library not available")
            log.warn("FRC score tracker library not available")

    # -- Banner & summary --------------------------------------------------
    time.sleep(1)
    log.raw(f"\x1b[2J{Logger.DIM}v26.1.0 pre.1{Logger.RESET}")
    log.banner()
    log.raw("")
    log.raw(f"  {Logger.DIM}Use list_globals() to see available functions{Logger.RESET}")
    log.raw("")

    if has_errored:
        for err in errors:
            log.error(err)
        log.raw(f"\n  {Logger.YELLOW}[!!] Initialization complete with errors{Logger.RESET}\n")
    else:
        log.raw(f"  {Logger.GREEN}[OK] Initialization complete{Logger.RESET}\n")

    return {"errors": errors, "warnings": warnings, "success": not has_errored}


# ============================================================================
# DATA OPERATIONS
# ============================================================================

async def download_data(event_key):
    """Download scouting data from the database."""
    log = Logger()

    log.header("DOWNLOAD DATA")

    try:
        log.step("Connecting to database...")
        conn = await ctx.get_connection()
        log.success("Database connected")

        event_name = event_key or "all events"
        log.step(f"Fetching data from {Logger.CYAN}{event_name}{Logger.RESET}")
        event_filter = f"%{event_key}%" if event_key else None

        # -- Match scouting -------------------------------------------------
        with log.section("Fetching match scouting"):
            # 1) Build filter
            event_filter = f"%{event_key}%" if event_key else None

            # 2) Get total row count (for progress bar)
            total = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM match_scouting
                WHERE status = 'submitted'
                  AND ($1::text IS NULL OR event_key LIKE $1)
                """,
                event_filter,
            )

            bar = ProgressBar(
                logger=log,
                total=total,
                prefix="Match scouting",
            )

            # 3) Stream rows
            match_query = """
                          SELECT event_key, match, match_type, team, alliance, scouter, data
                          FROM match_scouting
                          WHERE status = 'submitted'
                            AND ($1::text IS NULL \
                             OR event_key LIKE $1)
                          ORDER BY match_type, match, alliance, team \
                          """

            match = []

            async with conn.transaction():
                async for r in conn.cursor(match_query, event_filter, prefetch=500):
                    match.append(dict(r))
                    bar.advance(message=f"{bar.current + 1}/{total} rows")

        # -- Pit scouting --------------------------------------------------
        with log.section("Fetching pit scouting"):
            pit_query = """
                        SELECT event_key, team, scouter, data
                        FROM pit_scouting
                        WHERE status = 'submitted' """

            if event_filter:
                pit_query += " AND event_key ILIKE $1"
                rows = await conn.fetch(pit_query, event_filter)
            else:
                pit_query += " ORDER BY team, scouter"
                rows = await conn.fetch(pit_query)

            pit = [dict(r) for r in rows]
            log.stat("Pit entries", len(pit))

        # -- Match schedules -----------------------------------------------
        with log.section("Fetching match schedules"):
            schedule_query = """
                             SELECT key, event_key, match_type, match_number, set_number, scheduled_time, actual_time, red1, red2, red3, blue1, blue2, blue3
                             FROM matches """

            if event_filter:
                schedule_query += " WHERE event_key ILIKE $1"
                rows = await conn.fetch(schedule_query, event_filter)
            else:
                schedule_query += " ORDER BY event_key, match_type, match_number"
                rows = await conn.fetch(schedule_query)

            all_matches = [dict(r) for r in rows]
            log.stat("Schedule entries", len(all_matches))

        # -- Store & return ------------------------------------------------
        ctx.downloaded_data = {
            "match_scouting": match,
            "pit_scouting": pit,
            "all_matches": all_matches,
        }

        total_records = total + len(pit) + len(all_matches)
        await conn.close()

        log.done(f"{Logger.YELLOW}{total_records}{Logger.RESET} total records")
        return {"success": True, "records": total_records}

    except Exception as e:
        log.error(str(e))
        return {"success": False, "error": str(e)}


async def upload_data(event_key):
    """Upload calculation results to the database."""
    log = Logger()

    log.header("UPLOAD DATA")

    result = None
    if ctx.calc_result:
        # Accept both legacy {"result": ...} and direct calculation payloads.
        if isinstance(ctx.calc_result, dict) and "result" in ctx.calc_result:
            result = ctx.calc_result["result"]
        else:
            result = ctx.calc_result

    # Reject empty/invalid payloads and failed calculation responses.
    if isinstance(result, dict) and result.get("success") is False:
        result = None
    elif isinstance(result, dict):
        if not result or ("team" not in result and "match" not in result):
            result = None
    elif isinstance(result, list):
        if len(result) == 0:
            result = None
    else:
        result = None

    if result is None:
        log.error("No calculator output found -- run calculation first")
        return {"success": False, "error": "No calculation results"}

    try:
        log.step("Connecting to database...")
        conn = await ctx.get_connection()
        log.success("Database connected")

        if not event_key:
            log.error("Event key is required for upload")
            return {"success": False, "error": "Event key required"}

        log.step(f"Uploading to {Logger.CYAN}{event_key}{Logger.RESET}...")

        await conn.execute(
            "INSERT INTO processed_data (event_key, data) VALUES ($1, $2)",
            event_key,
            result,
        )

        record_count = len(result) if isinstance(result, (list, dict)) else 1
        log.stat("Records uploaded", record_count)

        await conn.close()

        log.done(
            f"{Logger.YELLOW}{record_count}{Logger.RESET} records uploaded to {Logger.CYAN}{event_key}{Logger.RESET}")
        return {"success": True, "records": record_count}

    except Exception as e:
        log.error(str(e))
        return {"success": False, "error": str(e)}


# ============================================================================
# USER FUNCTIONS
# ============================================================================

def generate_frc_passcode(team_name, team_number, rng=None):
    """
    Generate a temporary passcode for FRC teams by sprinkling
    individual digits throughout shuffled words.

    Output length is forced into the 15–20 character range.
    """
    if rng is None:
        rng = random

    min_len = 12
    max_len = 17

    words = team_name.split()

    cleaned_words = []
    for w in words:
        if len(w) > 7:
            cleaned_words.append(w[:5])
        else:
            cleaned_words.append(w)

    pool = cleaned_words.copy()
    while len(pool) < 3:
        pool.append(rng.choice(cleaned_words))

    rng.shuffle(pool)

    def style_word(word):
        return ''.join(
            c.upper() if rng.random() > 0.5 else c.lower()
            for c in word
        )

    passcode_chars = list(''.join(style_word(w) for w in pool))

    digits = list(str(team_number))
    while rng.random() > 0.6:
        digits.append(rng.choice(digits))

    for d in digits:
        pos = rng.randint(0, len(passcode_chars))
        passcode_chars.insert(pos, d)

    symbols = ['!', '@', '#', '$', '*', '&']
    symbol = rng.choice(symbols)
    pos = rng.randint(0, len(passcode_chars))
    passcode_chars.insert(pos, symbol)

    while len(passcode_chars) < min_len:
        passcode_chars.insert(
            rng.randint(0, len(passcode_chars)),
            rng.choice(string.ascii_letters + string.digits)
        )

    while len(passcode_chars) > max_len:
        del passcode_chars[rng.randrange(len(passcode_chars))]

    return ''.join(passcode_chars)


async def initialize_event(event_key):
    log = Logger()

    log.header(f"INITIALIZING EVENT: {event_key}")

    log.step("Fetching data from TBA...")
    matches_resp = requests.get(
        f"https://www.thebluealliance.com/api/v3/event/{event_key}/matches/simple",
        headers={"X-TBA-Auth-Key": ctx.TBA_API_KEY}
    )
    teams_resp = requests.get(
        f"https://www.thebluealliance.com/api/v3/event/{event_key}/teams",
        headers={"X-TBA-Auth-Key": ctx.TBA_API_KEY}
    )
    if matches_resp.status_code != 200:
        log.error(f"match fetch failed: {matches_resp.status_code}")
        return {"success": False, "error": f"match fetch failed: {matches_resp.status_code}"}
    if teams_resp.status_code != 200:
        log.error(f"team fetch failed: {teams_resp.status_code}")
        return {"success": False, "error": f"team fetch failed: {teams_resp.status_code}"}
    log.success("Event data fetched successfully")

    teams = teams_resp.json()
    matches = matches_resp.json()

    # Fixed seed for deterministic passwords
    rng = random.Random(f"{event_key}-seed-3473")

    # --- Build guest data ---
    data = {}
    for team in teams:
        team_number = parse_team_key(team["team_number"])
        if team_number != 3473:
            data[team_number] = {
                "password": generate_frc_passcode(team["nickname"], team_number, rng=rng),
                "name": team["nickname"],
                "permissions": {
                    "teams": [],
                    "matches": [],
                }
            }

    found_3473 = False

    for match in matches:
        alliances = match["alliances"]
        red_teams = [parse_team_key(t) for t in alliances["red"]["team_keys"]]
        blue_teams = [parse_team_key(t) for t in alliances["blue"]["team_keys"]]
        all_teams = red_teams + blue_teams

        if 3473 not in all_teams:
            continue

        found_3473 = True
        alliance_of_3473 = red_teams if 3473 in red_teams else blue_teams
        partners = [t for t in alliance_of_3473 if t != 3473]
        match_key = match["key"]

        for partner in partners:
            if partner not in data:
                continue
            for team_number in all_teams:
                if team_number not in data[partner]["permissions"]["teams"]:
                    data[partner]["permissions"]["teams"].append(team_number)
            if match_key not in data[partner]["permissions"]["matches"]:
                data[partner]["permissions"]["matches"].append(parse_match_key(match_key))

    if not found_3473:
        log.warn("Team 3473 was not found in any matches for this event")

    # --- Database upload ---
    log.step("Connecting to database...")
    conn = await ctx.get_connection()
    log.success("Database connected")

    try:
        async with conn.transaction():
            # Insert guests
            log.step("Uploading guests...")
            guest_count = 0
            for team_number, info in data.items():
                await conn.execute(
                    """
                    INSERT INTO guests (password, name, permissions)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (password) DO UPDATE
                        SET name = EXCLUDED.name,
                            permissions = EXCLUDED.permissions
                    """,
                    info["password"],
                    info["name"],
                    json.dumps(info["permissions"]),
                )
                guest_count += 1
            log.stat("Guests upserted", guest_count)

            # Insert matches
            log.step("Uploading matches...")
            match_count = 0
            for match in matches:
                alliances = match["alliances"]
                red_teams = [parse_team_key(t) for t in alliances["red"]["team_keys"]]
                blue_teams = [parse_team_key(t) for t in alliances["blue"]["team_keys"]]

                match_key = match["key"]
                comp_level = match.get("comp_level", "qm")
                match_number = match.get("match_number", 0)
                set_number = match.get("set_number", 1)

                # For elimination rounds:
                # sf set 1 → sf match 1, sf set 2 → sf match 2, sf set 3 → sf match 3
                # f match 1 → f match 1, f match 2 → f match 2, f match 3 → f match 3
                if comp_level in ("sf", "qf", "ef"):
                    match_type = comp_level
                    match_number = set_number
                elif comp_level == "f":
                    match_type = comp_level
                else:
                    match_type = comp_level

                scheduled_time = None
                if match.get("time"):
                    from datetime import datetime, timezone
                    scheduled_time = datetime.fromtimestamp(match["time"], tz=timezone.utc)

                actual_time = None
                if match.get("actual_time"):
                    from datetime import datetime, timezone
                    actual_time = datetime.fromtimestamp(match["actual_time"], tz=timezone.utc)

                await conn.execute(
                    """
                    INSERT INTO matches (key, event_key, match_type, match_number, set_number,
                                         scheduled_time, actual_time,
                                         red1, red2, red3, blue1, blue2, blue3)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                    ON CONFLICT (key) DO UPDATE
                        SET scheduled_time = EXCLUDED.scheduled_time,
                            actual_time = EXCLUDED.actual_time,
                            red1 = EXCLUDED.red1, red2 = EXCLUDED.red2, red3 = EXCLUDED.red3,
                            blue1 = EXCLUDED.blue1, blue2 = EXCLUDED.blue2, blue3 = EXCLUDED.blue3
                    """,
                    match_key,
                    event_key,
                    match_type,
                    match_number,
                    set_number,
                    scheduled_time,
                    actual_time,
                    red_teams[0] if len(red_teams) > 0 else None,
                    red_teams[1] if len(red_teams) > 1 else None,
                    red_teams[2] if len(red_teams) > 2 else None,
                    blue_teams[0] if len(blue_teams) > 0 else None,
                    blue_teams[1] if len(blue_teams) > 1 else None,
                    blue_teams[2] if len(blue_teams) > 2 else None,
                )
                match_count += 1
            log.stat("Matches upserted", match_count)

    finally:
        await conn.close()

    log.done(f"{Logger.YELLOW}{guest_count}{Logger.RESET} guests, {Logger.YELLOW}{match_count}{Logger.RESET} matches")
    return {"success": True, "guests": guest_count, "matches": match_count}


# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

def list_globals():
    log = Logger()
    log.raw(f"\n{Logger.CYAN}Global names:{Logger.RESET}")

    types_list = []
    functions_list = []
    vars_list = []

    for name, obj in sorted(globals().items()):
        if name.startswith('_') or isinstance(obj, types.ModuleType):
            continue

        if isinstance(obj, type):  # catches BaseModel subclasses and any class
            types_list.append(name)
        elif callable(obj) and isinstance(obj, (types.FunctionType, types.BuiltinFunctionType)):
            functions_list.append(name)
        else:
            vars_list.append(name)

    if types_list:
        log.raw(f"\n  {Logger.CYAN}Types:{Logger.RESET}")
        for name in types_list:
            log.raw(f"    {Logger.DIM}-{Logger.RESET} {name}")

    if functions_list:
        log.raw(f"\n  {Logger.CYAN}Functions:{Logger.RESET}")
        for name in functions_list:
            log.raw(f"    {Logger.DIM}-{Logger.RESET} {name}")

    if vars_list:
        log.raw(f"\n  {Logger.CYAN}Vars:{Logger.RESET}")
        for name in vars_list:
            log.raw(f"    {Logger.DIM}-{Logger.RESET} {name}")

    log.raw("\nuse inspect_object() to get more information about anything listed.")


def inspect_object(obj, name=None):
    """Inspect and log detailed information about an object."""
    log = Logger()
    import inspect

    # Get a short name representation
    if name:
        obj_name = name
    elif hasattr(obj, '__name__'):
        obj_name = obj.__name__
    else:
        obj_name = f"<{type(obj).__name__} object>"

    obj_type = type(obj).__name__

    log.raw(f"\n{Logger.CYAN}Inspecting: {Logger.RESET}{obj_name} {Logger.DIM}({obj_type}){Logger.RESET}")
    log.raw(f"{Logger.DIM}{Logger.BAR}{Logger.RESET}")

    # Basic info
    log.raw(f"{Logger.YELLOW}Type:{Logger.RESET} {type(obj)}")
    log.raw(f"{Logger.YELLOW}Module:{Logger.RESET} {getattr(obj, '__module__', 'N/A')}")

    # For functions
    if isinstance(obj, types.FunctionType):
        sig = inspect.signature(obj)
        log.raw(f"{Logger.YELLOW}Signature:{Logger.RESET} {obj_name}{sig}")

        doc = inspect.getdoc(obj)
        if doc:
            log.raw(f"{Logger.YELLOW}Docstring:{Logger.RESET}")
            for line in doc.split('\n'):
                log.raw(f"  {Logger.DIM}|{Logger.RESET} {line}")

        # Source file location
        try:
            source_file = inspect.getfile(obj)
            source_lines = inspect.getsourcelines(obj)
            log.raw(f"{Logger.YELLOW}Defined at:{Logger.RESET} {source_file}:{source_lines[1]}")
        except:
            pass

    # For classes
    elif isinstance(obj, type):
        log.raw(f"{Logger.YELLOW}Base classes:{Logger.RESET} {', '.join(c.__name__ for c in obj.__bases__)}")

        doc = inspect.getdoc(obj)
        if doc:
            log.raw(f"{Logger.YELLOW}Docstring:{Logger.RESET}")
            for line in doc.split('\n')[:3]:
                log.raw(f"  {Logger.DIM}|{Logger.RESET} {line}")

        # Methods and attributes
        methods = [m for m in dir(obj) if not m.startswith('_') and callable(getattr(obj, m))]
        if methods:
            log.raw(f"{Logger.YELLOW}Methods:{Logger.RESET}")
            for m in sorted(methods)[:10]:
                log.raw(f"  {Logger.DIM}-{Logger.RESET} {m}")
            if len(methods) > 10:
                log.raw(f"  {Logger.DIM}... and {len(methods) - 10} more{Logger.RESET}")

        attrs = [a for a in dir(obj) if not a.startswith('_') and not callable(getattr(obj, a))]
        if attrs:
            log.raw(f"{Logger.YELLOW}Attributes:{Logger.RESET}")
            for a in sorted(attrs)[:10]:
                log.raw(f"  {Logger.DIM}-{Logger.RESET} {a}")
            if len(attrs) > 10:
                log.raw(f"  {Logger.DIM}... and {len(attrs) - 10} more{Logger.RESET}")

    # For dictionaries
    elif isinstance(obj, dict):
        log.raw(f"{Logger.YELLOW}Length:{Logger.RESET} {len(obj)} items")
        if obj:
            log.raw(f"{Logger.YELLOW}Keys (first 10):{Logger.RESET}")
            for k in list(obj.keys())[:10]:
                v_repr = repr(obj[k])
                if len(v_repr) > 50:
                    v_repr = v_repr[:47] + '...'
                log.raw(f"  {Logger.DIM}-{Logger.RESET} {k}: {v_repr}")
            if len(obj) > 10:
                log.raw(f"  {Logger.DIM}... and {len(obj) - 10} more{Logger.RESET}")

    # For lists/tuples
    elif isinstance(obj, (list, tuple)):
        log.raw(f"{Logger.YELLOW}Length:{Logger.RESET} {len(obj)} items")
        if obj:
            log.raw(f"{Logger.YELLOW}Items (first 10):{Logger.RESET}")
            for i, item in enumerate(obj[:10]):
                item_repr = repr(item)
                if len(item_repr) > 60:
                    item_repr = item_repr[:57] + '...'
                log.raw(f"  {Logger.DIM}[{i}]{Logger.RESET} {item_repr}")
            if len(obj) > 10:
                log.raw(f"  {Logger.DIM}... and {len(obj) - 10} more{Logger.RESET}")

    # For instances
    elif hasattr(obj, '__dict__'):
        log.raw(f"{Logger.YELLOW}Instance of:{Logger.RESET} {obj.__class__.__name__}")

        attrs = {k: v for k, v in obj.__dict__.items() if not k.startswith('_')}
        if attrs:
            log.raw(f"{Logger.YELLOW}Attributes:{Logger.RESET}")
            for k, v in sorted(attrs.items())[:10]:
                v_repr = repr(v)
                if len(v_repr) > 50:
                    v_repr = v_repr[:47] + '...'
                log.raw(f"  {Logger.DIM}-{Logger.RESET} {k}: {v_repr}")
            if len(attrs) > 10:
                log.raw(f"  {Logger.DIM}... and {len(attrs) - 10} more{Logger.RESET}")

    # For simple values
    else:
        val_repr = repr(obj)
        if len(val_repr) > 100:
            val_repr = val_repr[:97] + '...'
        log.raw(f"{Logger.YELLOW}Value:{Logger.RESET} {val_repr}")

    log.raw(f"{Logger.DIM}{Logger.BAR}{Logger.RESET}\n")


def _handle_complete(data, repl_namespace):
    code = data.get("code", "")
    line = data.get("line", 1)
    column = data.get("column", 0)

    try:
        # Pass your live REPL namespace so jedi knows about runtime variables
        script = jedi.Interpreter(code, [repl_namespace])
        completions = script.complete(line, column)

        return {
            "success": True,
            "completions": [
                {
                    "name": c.name,
                    "complete": c.complete,  # the part to insert
                    "type": c.type,  # 'function', 'module', 'instance', etc.
                    "description": c.description
                }
                for c in completions[:20]  # cap it
            ]
        }
    except:
        return {"success": True, "completions": []}  # fail silently

# ============================================================================
# JSON COMMAND INTERFACE
# ============================================================================

def _ok(**kwargs):
    """Helper to create success response."""
    return {"success": True, **kwargs}


def _err(msg):
    """Helper to create error response."""
    return {"success": False, "error": msg}


async def exec_or_eval(code: str):
    log = Logger()
    try:
        REPL_GLOBALS["print"] = log.raw

        try:
            result = eval(code, REPL_GLOBALS, REPL_GLOBALS)
            if asyncio.iscoroutine(result):
                result = await result
        except SyntaxError:
            lines = code.splitlines()
            wrapped = "async def __repl_fn__():\n" + \
                      "\n".join(f"    {line}" for line in lines) + \
                      "\n    import sys as __sys__; return locals()"
            exec(wrapped, REPL_GLOBALS, REPL_GLOBALS)
            fn_locals = await REPL_GLOBALS["__repl_fn__"]()
            # Promote locals back into globals, skipping internal artifacts
            REPL_GLOBALS.update({
                k: v for k, v in fn_locals.items()
                if k != "__sys__"
            })
            result = None

        return _ok(log=str(result) if result is not None else None)
    except Exception:
        return _err(traceback.format_exc())


def handle(req: dict):
    """Handle incoming JSON commands."""

    match req.get("cmd"):
        case "ping":
            return _ok(log="Python ready")

        case "init":
            return python_init()

        case "exec":
            return ctx.run_async(exec_or_eval(req.get("code", "")))

        case "complete":
            return _handle_complete(req, REPL_GLOBALS)

        case "call_async":
            coro_name = req.get("name")
            args = req.get("args", [])
            func = globals().get(coro_name)

            if not func or not asyncio.iscoroutinefunction(func):
                return _err(f"{coro_name} is not async")

            try:
                result = ctx.run_async(func(*args))
                return _ok(result=result)
            except Exception:
                return _err(traceback.format_exc())

        case "download_data":
            result = ctx.run_async(download_data(req.get("event_key")))
            return result

        case "upload_data":
            result = ctx.run_async(upload_data(req.get("event_key")))
            return result

        case "run_calculation":
            ctx.calc_result = run_calculation(req.get("setting", {}))
            if isinstance(ctx.calc_result, dict) and ctx.calc_result.get("success") is False:
                return ctx.calc_result
            return {"success": True}

        case "verify_db":
            ok, errors = ctx.run_async(ctx.verify_db())
            return _ok(valid=ok, errors=errors)

        case "list_globals":
            list_globals()
            return _ok()

        case "get_data":
            match req.get("type"):
                case "downloaded":
                    return _ok(data=ctx.downloaded_data)
                case "calc_result":
                    return _ok(data=ctx.calc_result)
                case other:
                    return _err(f"Unknown data type: {other}")

        case other:
            return _err(f"Unknown command: {other}")


# ============================================================================
# MAIN LOOP (JSON over stdio)
# ============================================================================

def main():
    """Main loop reading JSON commands from stdin."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            req = json.loads(line)
            res = handle(req)
        except Exception:
            res = _err(traceback.format_exc())

        # Emit the final response
        sys.stdout.write(json.dumps(res) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
