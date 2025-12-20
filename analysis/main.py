__version__ = "v26.0.0"

import importlib
import threading
import asyncio
import traceback
import dotenv
import ttkbootstrap as tb
import asyncpg
import ssl
import json
import certifi
import os
import re

calc = importlib.import_module("seasons.2026.calculator")
functions_mod = importlib.import_module("seasons.2026.functions")

PROMPT = ">>> "

# ================== Database Config ==================
dotenv.load_dotenv()
DB_DSN = os.getenv("DATABASE_URL")


async def get_connection():
    if not DB_DSN:
        raise RuntimeError("DATABASE_URL not set in environment")
    ssl_context = ssl.create_default_context(cafile=certifi.where())
    conn = await asyncpg.connect(dsn=DB_DSN, ssl=ssl_context)
    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    await conn.set_type_codec("json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    return conn


async def fetch_submitted_match(conn, event_key_filter: str):
    if event_key_filter:
        rows = await conn.fetch("""
                                SELECT event_key, match, match_type, team, alliance, scouter, data
                                FROM match_scouting
                                WHERE status = 'submitted'
                                  AND event_key ILIKE $1
                                ORDER BY match_type, match, alliance, team
                                """, f"%{event_key_filter}%")
    else:
        rows = await conn.fetch("""
                                SELECT event_key, match, match_type, team, alliance, scouter, data
                                FROM match_scouting
                                WHERE status = 'submitted'
                                ORDER BY match_type, match, alliance, team
                                """)
    return rows


async def fetch_submitted_pit(conn, event_key_filter: str):
    if event_key_filter:
        rows = await conn.fetch("""
                                SELECT event_key, team, scouter, data
                                FROM pit_scouting
                                WHERE status = 'submitted'
                                  AND event_key ILIKE $1
                                ORDER BY team, scouter
                                """, f"%{event_key_filter}%")
    else:
        rows = await conn.fetch("""
                                SELECT event_key, team, scouter, data
                                FROM pit_scouting
                                WHERE status = 'submitted'
                                ORDER BY team, scouter
                                """)
    return rows


async def fetch_all_match(conn, event_key_filter: str):
    if event_key_filter:
        rows = await conn.fetch("""
                                SELECT key,
                                       event_key,
                                       match_type,
                                       match_number,
                                       set_number,
                                       scheduled_time,
                                       actual_time,
                                       red1,
                                       red2,
                                       red3,
                                       blue1,
                                       blue2,
                                       blue3
                                FROM matches
                                WHERE event_key ILIKE $1
                                ORDER BY match_type, match_number
                                """, f"%{event_key_filter}%")
    else:
        rows = await conn.fetch("""
                                SELECT key,
                                       event_key,
                                       match_type,
                                       match_number,
                                       set_number,
                                       scheduled_time,
                                       actual_time,
                                       red1,
                                       red2,
                                       red3,
                                       blue1,
                                       blue2,
                                       blue3
                                FROM matches
                                ORDER BY event_key, match_type, match_number
                                """)
    return rows


# ================== Console functions ==================
console_env = {
    "__builtins__": {
        "print": lambda *a, **kw: append_log(" ".join(map(str, a))),
        "len": len,
        "range": range,
        "sum": sum,
        "min": min,
        "max": max,
        "sorted": sorted,
        "round": round,
        "json": json,
    }
}


def run_command(event=None):
    raw = cmd_var.get()

    if not raw.startswith(PROMPT):
        return

    cmd = raw[len(PROMPT):].strip()
    if not cmd:
        return

    global command_history, history_index
    if not command_history or command_history[-1] != cmd:
        command_history.append(cmd)

    history_index = -1

    cmd_var.set("")
    append_log(f"[white]>>> {cmd}[/]")

    try:
        try:
            result = eval(cmd, console_env, console_env)
            if result is not None:
                append_log(f"[white]{result}[/]")
        except SyntaxError:
            exec(cmd, console_env, console_env)
    except Exception:
        append_log(f"[red]{traceback.format_exc()}[/]")
    finally:
        cmd_var.set(PROMPT)
        cmd_entry.icursor("end")



def navigate_history(direction):
    global history_index, command_history

    if not command_history:
        return

    if history_index == -1:
        history_index = len(command_history)

    history_index += direction
    history_index = max(0, min(history_index, len(command_history)))

    if history_index == len(command_history):
        cmd_var.set(PROMPT)
    else:
        cmd_var.set(PROMPT + command_history[history_index])

    cmd_entry.icursor("end")


def protect_prompt(event):
    # Block Backspace at prompt boundary
    if event.keysym == "BackSpace":
        if cmd_entry.index("insert") <= len(PROMPT):
            return "break"

    # Block Left arrow into prompt
    if event.keysym == "Left":
        if cmd_entry.index("insert") <= len(PROMPT):
            return "break"



# ================== Terminal Log Class ==================
class TerminalLog:
    COLOR_MAP = {
        "red": "#ff4d4d",
        "green": "#00ff6f",
        "yellow": "#ffff66",
        "blue": "#66b3ff",
        "cyan": "#00ffff",
        "magenta": "#ff66ff",
        "white": "#ffffff",
        "gray": "#aaaaaa",
    }

    def __init__(self, text_widget, root):
        self.text = text_widget
        self.root = root
        for name, color in self.COLOR_MAP.items():
            self.text.tag_config(name, foreground=color)

    def write(self, msg: str):
        """Supports [color]...[/], [clear], [del n]."""

        def _write(local_msg=msg):
            self.text.configure(state="normal")

            # --- Clear all ---
            if "[clear]" in local_msg:
                self.text.delete("1.0", "end")
                self.text.configure(state="disabled")
                return

            # --- Delete last n lines ---
            m = re.search(r"\[del\s+(\d+)]", local_msg)
            if m:
                n = int(m.group(1))
                for _ in range(n):
                    self.text.delete("end-2l linestart", "end-1l lineend")
                local_msg = re.sub(r"\[del\s+\d+]", "", local_msg)

            # --- Color parsing ---
            # Match [red], [green], [blue], [/], etc. — but not random [text]
            valid_tags = "|".join(re.escape(c) for c in self.COLOR_MAP.keys())
            pattern = re.compile(rf"(\[(?:{valid_tags}|/)])", re.IGNORECASE)

            parts = pattern.split(local_msg)
            current_tag = None

            for part in parts:
                if not part:
                    continue

                # Tag detection
                if part.startswith("[") and part.endswith("]"):
                    tag = part.strip("[]").lower()
                    if tag == "/":
                        current_tag = None
                    elif tag in self.COLOR_MAP:
                        current_tag = tag
                    continue  # don’t insert the tag itself

                # Normal text — preserve exact spacing
                if current_tag:
                    self.text.insert("end", part, current_tag)
                else:
                    self.text.insert("end", part)

            self.text.insert("end", "\n")
            self.text.see("end")
            self.text.configure(state="disabled")

        self.root.after(0, _write)

    def clear(self):
        self.root.after(0, lambda: self.text.delete("1.0", "end"))


# ================== Helper functions ==================
def update_progress(pct: float):
    root.after(0, lambda: progress_bar.config(value=pct))


def get_settings_snapshot():
    snapshot = {}
    for key, var in settings_vars.items():
        try:
            snapshot[key] = var.get()
        except Exception:
            snapshot[key] = var
    return snapshot


# ================== UI Lock Control ==================
def lock_ui():
    for b in (btn_download, btn_run, btn_upload, btn_exit):
        b.config(state="disabled")
    for child in settings_frame.winfo_children():
        try:
            child.config(state="disabled")
        except Exception:
            pass


def unlock_ui():
    for b in (btn_download, btn_run, btn_upload, btn_exit):
        b.config(state="normal")
    for child in settings_frame.winfo_children():
        try:
            child.config(state="normal")
        except Exception:
            pass


# ================== Load Calculator ==================
def load_settings():
    for widget in settings_frame.winfo_children():
        widget.destroy()
    settings_vars.clear()

    # --- Event Key Filter input ---
    tb.Label(settings_frame, text="Event Key Filter:", anchor="w").pack(fill="x", pady=2)
    event_var = tb.StringVar(value="")
    entry = tb.Entry(settings_frame, textvariable=event_var)
    entry.pack(fill="x", pady=2)
    settings_vars["event_key"] = event_var

    try:
        calc.build_settings_ui(settings_frame, settings_vars)
    except Exception as e:
        append_log(f"[red]✖ {e}")


# ================== Worker Wrappers ==================
def run_async_task(coro):
    def thread_target():
        try:
            asyncio.run(coro)
        finally:
            root.after(0, unlock_ui)

    threading.Thread(target=thread_target, daemon=True).start()


# ---------------- Calculator ----------------
def run_calculator():
    global downloaded_data, calc_result

    append_log("\n[white]=== START CALCULATOR ===\n")
    if not downloaded_data:
        append_log("\n[red]✖ No downloaded data found. Run Download first.")
        return
    lock_ui()

    def task():
        global calc_result
        try:
            result = calc.calculate_metrics(
                data=downloaded_data,
                progress=update_progress,
                log=append_log,  # terminal-aware log
                settings=get_settings_snapshot,
                lock_ui=lock_ui,
                unlock_ui=unlock_ui,
            )
            if not isinstance(result, dict) or "status" not in result:
                append_log("[red]✖ Calculator returned unexpected format.")
            else:
                calc_result = result
                if result['status'] == 0:
                    append_log(f"\n[green]✔ Done[/]\n")
                if result['status'] == 1:
                    append_log(f"[red]✖ Calculator failed[/]")
        except Exception as e:
            append_log(f"[red]✖ {e}")
        finally:
            root.after(0, unlock_ui)

    threading.Thread(target=task, daemon=True).start()


# ---------------- Download ----------------
async def download_task():
    global downloaded_data
    append_log("\n[white]=== START DOWNLOAD ===\n")
    lock_ui()
    try:
        update_progress(0)
        append_log("[white]→ Connecting to database...")
        await asyncio.sleep(0.2)
        update_progress(5)

        conn = await get_connection()
        update_progress(10)
        append_log("[green]  ✔ Database connected[/]\n")

        event_filter = get_settings_snapshot().get("event_key", "") or ""
        append_log(f"[white]→ Fetching data from {event_filter or 'all events'}...")

        # -----------------------------
        # Fetch Submitted Match Data
        # -----------------------------
        append_log("[white]  → Fetching match data...[/]")
        match_rows = await fetch_submitted_match(conn, event_filter)
        match_rows = [dict(r) for r in match_rows]
        append_log(f"{'[green]    ✔ ' if len(match_rows) > 0 else '[yellow]    ⚠ '}{len(match_rows)} match entries[/]")
        update_progress(30)

        # -----------------------------
        # Fetch Submitted Pit Data
        # -----------------------------
        append_log("[white]  → Fetching team data...[/]")
        pit_rows = await fetch_submitted_pit(conn, event_filter)
        pit_rows = [dict(r) for r in pit_rows]
        append_log(f"{'[green]    ✔ ' if len(pit_rows) > 0 else '[yellow]    ⚠ '}{len(pit_rows)} pit entries[/]")
        update_progress(60)

        # -----------------------------
        # Fetch All Matches
        # -----------------------------
        append_log("[white]  → Fetching matches schedules...[/]")
        all_match_rows = await fetch_all_match(conn, event_filter)
        all_match_rows = [dict(r) for r in all_match_rows]
        append_log(f"{'[green]    ✔ ' if len(all_match_rows) > 0 else '[yellow]    ⚠ '}{len(all_match_rows)} schedule entries[/]")
        update_progress(90)

        # -----------------------------
        # Combine and Finish
        # -----------------------------
        downloaded_data = {
            "match_scouting": match_rows,
            "pit_scouting": pit_rows,
            "all_matches": all_match_rows,
        }

        await conn.close()
        update_progress(100)
        append_log("\n[green]✔ Download complete.[/]\n")
    except Exception as e:
        append_log(f"[red]  ✖ {e}")
        update_progress(0)


def run_download():
    run_async_task(download_task())


# ---------------- Upload ----------------
async def upload_task():
    global calc_result
    append_log("\n[white]=== START UPLOAD ===\n")
    lock_ui()
    try:
        update_progress(0)
        append_log(f"[white]→ Connecting to database...[/]")
        conn = await get_connection()
        append_log("[green]  ✔ Database connected[/]\n")
        update_progress(10)

        append_log("[white]→ Uploading new processed data...[/]")

        if not calc_result or "result" not in calc_result:
            append_log("[red]  ✖ No calculator output found. Run Calculator first.")
            return

        event_key = get_settings_snapshot().get("event_key", "").strip()
        if not event_key:
            append_log("[red]  ✖ Event key filter is required for upload.")
            return

        payload = calc_result["result"]

        await conn.execute("""
                           INSERT INTO processed_data (event_key, data)
                           VALUES ($1, $2);
                           """, event_key, json.dumps(payload))

        await conn.close()
        update_progress(100)
        append_log("[green]  ✔ Data uploaded[/]")
        append_log("\n[green]✔ Upload complete.[/]\n")
    except Exception as e:
        append_log(f"[red]  ✖ {e}")
        update_progress(0)


def run_upload():
    run_async_task(upload_task())


# ================== Environment Validation ==================
def validate_env():
    """Runs synchronously in Tk's event loop and updates UI immediately."""

    update_progress(10)
    append_log("\n[white]=== ENVIRONMENT CHECK ===\n")
    append_log("[white]→ Checking .env")
    root.update_idletasks()

    # --- Check .env file ---
    if not os.path.exists("./.env"):
        append_log("[red]  ✖ Missing .env file in current directory.[/]")
        append_log(
            "[yellow]  Please create a .env file with the following line:[/]\n"
            "[yellow]  DATABASE_URL=postgresql://<username>:<password>@<location>.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require[/]"
        )
        return

    append_log("[green]  ✔ .env found[/]")
    root.update_idletasks()

    dotenv.load_dotenv()
    db_url = os.getenv("DATABASE_URL", "")

    pattern = re.compile(
        r"^postgresql://[^:]+:[^@]+@[^/]+\.c-\d+\.us-west-2\.aws\.neon\.tech/neondb\?sslmode=require&channel_binding=require$"
    )

    if not db_url:
        append_log("[red]  ✖ DATABASE_URL not found in .env file.[/]")
        return

    if not pattern.match(db_url):
        append_log("[red]  ✖ DATABASE_URL format appears invalid.[/]")
        append_log(
            "[yellow]  ⚠ Expected format:[/]\n"
            "[yellow]  postgresql://<username>:<password>@<location>.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require[/]"
        )
        return

    update_progress(30)
    append_log("[green]  ✔ DATABASE_URL found[/]")
    append_log("[white]→ Connecting to database...[/]")
    root.update_idletasks()

    REQUIRED_TABLES = {
        "match_scouting": {
            "match", "match_type", "team", "alliance", "scouter", "status",
            "data", "last_modified", "event_key"
        },
        "matches": {
            "key", "event_key", "match_type", "match_number", "set_number",
            "scheduled_time", "actual_time",
            "red1", "red2", "red3", "blue1", "blue2", "blue3"
        },
        "matches_tba": {
            "match_key", "event_key", "match_number", "winning_alliance", "red_teams",
            "blue_teams", "red_score", "blue_score",
            "red_rp", "blue_rp", "red_auto_points", "blue_auto_points", "red_teleop_points", "blue_teleop_points",
            "red_endgame_points", "blue_endgame_points", "score_breakdown", "videos", "red_coopertition_criteria", "blue_coopertition_criteria"
        },
        "pit_scouting": {
            "event_key", "team", "scouter", "status", "data", "last_modified"
        },
        "processed_data": {
            "event_key", "time_added", "data"
        }
    }

    # -----------------------------
    # Background thread DB tester
    # -----------------------------
    def run_db_test_async(callback):
        def worker():
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)

                async def _test():
                    # Connection attempt
                    conn = await get_connection()
                    root.after(0, lambda: update_progress(40))

                    # Fetch tables
                    root.after(0, lambda: append_log("[green]  ✔ Database connected[/]"))
                    root.after(0, lambda: append_log("[white]  → Checking tables...[/]"))
                    rows = await conn.fetch("""
                        SELECT table_name
                        FROM information_schema.tables
                        WHERE table_schema='public';
                    """)
                    existing_tables = {r["table_name"] for r in rows}

                    missing_tables = set(REQUIRED_TABLES) - existing_tables
                    table_errors = []

                    if missing_tables:
                        for t in missing_tables:
                            table_errors.append((t, "MISSING_TABLE"))
                        await conn.close()
                        return table_errors

                    root.after(0, lambda: update_progress(60))

                    # Check columns
                    for idx, (table, required_cols) in enumerate(REQUIRED_TABLES.items(), start=1):

                        col_rows = await conn.fetch("""
                            SELECT column_name
                            FROM information_schema.columns
                            WHERE table_schema='public'
                            AND table_name=$1;
                        """, table)

                        existing_cols = {r["column_name"] for r in col_rows}
                        missing_cols = required_cols - existing_cols

                        if missing_cols:
                            table_errors.append((table, missing_cols))

                        # gradual progress update
                        progress_val = 60 + int((idx / len(REQUIRED_TABLES)) * 20)
                        root.after(0, lambda t=table: append_log(f"[green]    ✔ {t} checked[/]"))
                        root.after(0, lambda p=progress_val: update_progress(p))

                    await conn.close()
                    return table_errors

                result = loop.run_until_complete(_test())
                loop.close()
                root.after(0, callback, result)

            except Exception:
                root.after(0, callback, None)

        threading.Thread(target=worker, daemon=True).start()

    # ---------------------------------
    # Result handler
    # ---------------------------------
    def on_db_test_result(result):
        if result is None:
            append_log("[red]  ✖ Connection failed[/]")
            root.update_idletasks()
            return

        if not result:
            update_progress(100)
            append_log("\n[green]✔ Environment OK[/]\n")
            return

        append_log("[red]  ✖ Database structure issues detected:[/]")
        for table, issue in result:
            if issue == "MISSING_TABLE":
                append_log(f"[red]    - Missing table: {table}[/]")
            else:
                append_log(f"[red]    - {table}: Missing columns: {', '.join(issue)}[/]")

    run_db_test_async(on_db_test_result)


downloaded_data = None
calc_result = None

command_history = []
history_index = -1


# ================== UI Setup ==================
def print_welcome():
    append_log(f"[white]{__version__}")
    append_log("""[magenta] $$$$$$\  $$$$$$$\  $$$$$$$\   $$$$$$\   $$$$$$\  $$\   $$\ $$$$$$$$\ $$$$$$$$\  $$$$$$\ $$$$$$$$\  $$$$$$\ $$$$$$$$\  $$$$$$\  
$$  __$$\ $$  __$$\ $$  __$$\ $$  __$$\ $$  __$$\ $$ | $$  |$$  _____|\__$$  __|$$  __$$\\\__$$  __|$$  __$$\\\__$$  __|$$  __$$\ 
$$ /  \__|$$ |  $$ |$$ |  $$ |$$ /  $$ |$$ /  \__|$$ |$$  / $$ |         $$ |   $$ /  \__|  $$ |   $$ /  $$ |  $$ |   $$ /  \__|
\$$$$$$\  $$$$$$$  |$$$$$$$  |$$ |  $$ |$$ |      $$$$$  /  $$$$$\       $$ |   \$$$$$$\    $$ |   $$$$$$$$ |  $$ |   \$$$$$$\  
 \____$$\ $$  ____/ $$  __$$< $$ |  $$ |$$ |      $$  $$<   $$  __|      $$ |    \____$$\   $$ |   $$  __$$ |  $$ |    \____$$\ 
$$\   $$ |$$ |      $$ |  $$ |$$ |  $$ |$$ |  $$\ $$ |\$$\  $$ |         $$ |   $$\   $$ |  $$ |   $$ |  $$ |  $$ |   $$\   $$ |
\$$$$$$  |$$ |      $$ |  $$ | $$$$$$  |\$$$$$$  |$$ | \$$\ $$$$$$$$\    $$ |   \$$$$$$  |  $$ |   $$ |  $$ |  $$ |   \$$$$$$  |
 \______/ \__|      \__|  \__| \______/  \______/ \__|  \__|\________|   \__|    \______/   \__|   \__|  \__|  \__|    \______/ 
 """)
    append_log("[white]Welcome to the sprocketstats analytics engine!")
    append_log("[white]Use help() to see available methods and variables\n")


root = tb.Window(themename="cosmo")
root.title("Data Processor")
root.state("zoomed")

main_pane = tb.PanedWindow(root, orient="horizontal")
main_pane.pack(fill="both", expand=True, padx=15, pady=15)

# ---- Left Pane (Logs + Progress) ----
left = tb.Frame(main_pane, padding=10)
main_pane.add(left, weight=2)
# noinspection PyArgumentList
progress_bar = tb.Progressbar(left, orient="horizontal", length=600, mode="determinate", bootstyle="striped-info")
progress_bar.pack(pady=10, fill="x")
# noinspection PyArgumentList
log_frame = tb.Labelframe(left, text="Logs", padding=10, bootstyle="info")
log_frame.pack(fill="both", expand=True)
log_text = tb.ScrolledText(log_frame, wrap="word", height=18)
log_text.pack(fill="both", expand=True)
log_text.configure(state="disabled", background="#0c0c0c", foreground="#00ff6f", insertbackground="#00ff6f",
                   font=("Courier New", 11))

# ---- Python Command Entry ----
cmd_frame = tb.Frame(log_frame)
cmd_frame.pack(fill="x", pady=(5, 0))

cmd_var = tb.StringVar(value=PROMPT)
# noinspection PyArgumentList
cmd_entry = tb.Entry(cmd_frame, textvariable=cmd_var, bootstyle="dark")
cmd_entry.pack(fill="x")
cmd_entry.bind("<Up>", lambda e: navigate_history(-1))
cmd_entry.bind("<Down>", lambda e: navigate_history(1))
cmd_entry.bind("<Return>", run_command)
cmd_entry.bind("<KeyPress>", protect_prompt)
cmd_entry.icursor("end")

# ---- Right Pane (Settings + Buttons) ----
right = tb.Frame(main_pane, padding=10)
main_pane.add(right, weight=1)
# noinspection PyArgumentList
settings_frame = tb.Labelframe(right, text="Settings", padding=10, bootstyle="secondary")
settings_frame.pack(fill="both", expand=True, pady=5)
settings_vars = {}
# noinspection PyArgumentList
btn_frame = tb.Labelframe(right, text="Controls", padding=10, bootstyle="info")
btn_frame.pack(fill="x", pady=10)
# noinspection PyArgumentList
btn_download = tb.Button(btn_frame, text="Download", bootstyle="info")
# noinspection PyArgumentList
btn_run = tb.Button(btn_frame, text="Run", bootstyle="primary")
# noinspection PyArgumentList
btn_upload = tb.Button(btn_frame, text="Upload", bootstyle="success")
# noinspection PyArgumentList
btn_exit = tb.Button(btn_frame, text="Exit", bootstyle="danger", command=root.destroy)

for b in (btn_download, btn_run, btn_upload, btn_exit):
    b.pack(fill="x", pady=3)

# Initialize log object
log = TerminalLog(log_text, root)
append_log = log.write  # backward compatibility

console_env.update({
    "downloaded_data": None,
    "calc_result": None,
    "DB_LINK": DB_DSN,
    "get_settings_snapshot": get_settings_snapshot,
    "append_log": append_log,
    "update_progress": update_progress,
    "download_data": run_download,
    "run_calculator": run_calculator,
    "upload_data": run_upload,
})

functions_mod.append_log = append_log
functions_mod.update_progress = update_progress

for name in dir(functions_mod):
    if not name.startswith("_"):
        obj = getattr(functions_mod, name)
        if callable(obj):
            console_env[name] = obj

def help_console():
    vars_ = []
    funcs = []

    for name, obj in console_env.items():
        if name.startswith("_"):
            continue
        if callable(obj):
            funcs.append(name)
        else:
            vars_.append(name)

    append_log("[cyan]Available variables:[/]")
    for v in sorted(vars_):
        append_log(f"  {v}")

    append_log("[cyan]Available functions:[/]")
    for f in sorted(funcs):
        append_log(f"  {f}")

console_env["help"] = help_console

# Run validation after Tk loads
root.after(500, print_welcome)
root.after(1000, validate_env)

# ================== Init ==================
load_settings()
btn_download.config(command=run_download)
btn_upload.config(command=run_upload)
btn_run.config(command=run_calculator)
root.bind("<Escape>", lambda e: root.destroy())
root.mainloop()
