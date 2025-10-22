__version__ = "v25.0.2"

import importlib, threading, asyncio, dotenv, ttkbootstrap as tb
from ttkbootstrap.constants import *
import asyncpg, ssl, json, certifi, os, re

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


async def fetch_submitted(conn, event_key_filter: str):
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


# ================== UI Setup ==================
root = tb.Window(themename="cosmo")
root.title("Data Processor")
root.state("zoomed")

main_pane = tb.PanedWindow(root, orient="horizontal")
main_pane.pack(fill="both", expand=True, padx=15, pady=15)

# ---- Left Pane (Logs + Progress) ----
left = tb.Frame(main_pane, padding=10)
main_pane.add(left, weight=2)

progress_bar = tb.Progressbar(left, orient="horizontal", length=600, mode="determinate", bootstyle="striped-info")
progress_bar.pack(pady=10, fill="x")

log_frame = tb.Labelframe(left, text="Logs", padding=10, bootstyle="info")
log_frame.pack(fill="both", expand=True)
log_text = tb.ScrolledText(log_frame, wrap="word", height=18)
log_text.pack(fill="both", expand=True)
log_text.configure(state="disabled", background="#0c0c0c", foreground="#00ff6f", insertbackground="#00ff6f")

# ---- Right Pane (Settings + Buttons) ----
right = tb.Frame(main_pane, padding=10)
main_pane.add(right, weight=1)

settings_frame = tb.Labelframe(right, text="Settings", padding=10, bootstyle="secondary")
settings_frame.pack(fill="both", expand=True, pady=5)
settings_vars = {}

btn_frame = tb.Labelframe(right, text="Controls", padding=10, bootstyle="info")
btn_frame.pack(fill="x", pady=10)

btn_download = tb.Button(btn_frame, text="Download", bootstyle="info")
btn_run = tb.Button(btn_frame, text="Run", bootstyle="primary")
btn_upload = tb.Button(btn_frame, text="Upload", bootstyle="success")
btn_exit = tb.Button(btn_frame, text="Exit", bootstyle="danger", command=root.destroy)

for b in (btn_download, btn_run, btn_upload, btn_exit):
    b.pack(fill="x", pady=3)

downloaded_data = None
calc_result = None


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
            m = re.search(r"\[del\s+(\d+)\]", local_msg)
            if m:
                n = int(m.group(1))
                for _ in range(n):
                    self.text.delete("end-2l linestart", "end-1l lineend")
                local_msg = re.sub(r"\[del\s+\d+\]", "", local_msg)

            # --- Color parsing ---
            # Match [red], [green], [blue], [/], etc. — but not random [text]
            valid_tags = "|".join(re.escape(c) for c in self.COLOR_MAP.keys())
            pattern = re.compile(rf"(\[(?:{valid_tags}|/)\])", re.IGNORECASE)

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


# --- initialize log object ---
log = TerminalLog(log_text, root)
append_log = log.write  # backward compatibility


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
calc = importlib.import_module("seasons.2025.calculator")


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
        calc.build_settings_ui(settings_frame, settings_vars, append_log)
        append_log("[green]Settings loaded.[/]")
    except Exception as e:
        append_log(f"[red][ERROR loading settings][/] {e}")


# ================== Worker Wrappers ==================
def run_async_task(coro):
    def thread_target():
        try:
            asyncio.run(coro)
        finally:
            root.after(0, unlock_ui)

    threading.Thread(target=thread_target, daemon=True).start()


# ---------------- Download ----------------
async def download_task():
    global downloaded_data
    try:
        update_progress(0)
        append_log("[green]Connecting to database...[/]")
        await asyncio.sleep(0.2)
        update_progress(5)

        conn = await get_connection()
        update_progress(10)
        append_log("[green]Database connected successfully.[/]")

        event_filter = get_settings_snapshot().get("event_key", "")
        append_log(f"[green]Fetching submitted match data (filter='{event_filter or 'ALL'}')...[/]")
        rows = await fetch_submitted(conn, event_filter)
        downloaded_data = rows
        total = len(rows)
        update_progress(20)
        append_log(f"[green]Fetched {total} rows.[/]")

        for i, _ in enumerate(rows):
            pct = 20 + (i + 1) / max(total, 1) * 80
            update_progress(pct)
            await asyncio.sleep(0.005)

        await conn.close()
        update_progress(100)
        append_log("[green]Download complete.[/]")
    except Exception as e:
        append_log(f"[red][ERROR][/] {e}")
        update_progress(0)


def run_download():
    append_log("[green]Starting download...[/]")
    lock_ui()
    run_async_task(download_task())


# ---------------- Calculator ----------------
def run_calculator():
    global downloaded_data, calc_result
    if not downloaded_data:
        append_log("[red][ERROR][/] No downloaded data found. Run Download first.")
        return

    append_log("[yellow]Starting calculator...[/]")
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
                append_log("[red][ERROR][/] Calculator returned unexpected format.")
            else:
                calc_result = result
                append_log(f"[green]Calculator finished: {result['status']}[/]")
        except Exception as e:
            append_log(f"[red][ERROR running calculator][/] {e}")
        finally:
            root.after(0, unlock_ui)

    threading.Thread(target=task, daemon=True).start()


# ---------------- Upload ----------------
async def upload_task():
    global calc_result
    try:
        if not calc_result or "result" not in calc_result:
            append_log("[red][ERROR][/] No calculator output found. Run Calculator first.")
            return

        event_key = get_settings_snapshot().get("event_key", "").strip()
        if not event_key:
            append_log("[red][ERROR][/] Event key filter is required for upload.")
            return

        update_progress(0)
        append_log(f"[cyan]Connecting to database for upload (event_key='{event_key}')...[/]")
        conn = await get_connection()
        update_progress(10)

        append_log("[yellow]Uploading new processed data version...[/]")
        payload = calc_result["result"]

        await conn.execute("""
                           INSERT INTO processed_data (event_key, data)
                           VALUES ($1, $2);
                           """, event_key, json.dumps(payload))

        await conn.close()
        update_progress(100)
        append_log("[green]Upload complete. New version recorded.[/]")
    except Exception as e:
        append_log(f"[red][ERROR during upload][/] {e}")
        update_progress(0)


def run_upload():
    append_log("[yellow]Starting upload...[/]")
    lock_ui()
    run_async_task(upload_task())

# ================== Environment Validation ==================
def validate_env():
    import re
    append_log("[green]Checking environment configuration...[/]")

    if not os.path.exists("./.env"):
        append_log("[red][ERROR] Missing .env file in current directory.[/]")
        append_log(
            "[yellow]Please create a .env file with the following line:[/]\n"
            "[yellow]DATABASE_URL=postgresql://<username>:<password>@<location>.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require[/]"
        )
        return False

    dotenv.load_dotenv()
    db_url = os.getenv("DATABASE_URL", "")

    pattern = re.compile(
        r"^postgresql:\/\/[^:]+:[^@]+@[^\/]+\.c-\d+\.us-west-2\.aws\.neon\.tech\/neondb\?sslmode=require&channel_binding=require$"
    )

    if not db_url:
        append_log("[red][ERROR] DATABASE_URL not found in .env file.[/]")
        return False
    if not pattern.match(db_url):
        append_log("[red][ERROR] DATABASE_URL format appears invalid.[/]")
        append_log(
            "[yellow]Expected format:[/]\n"
            "[yellow]postgresql://<username>:<password>@<location>.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require[/]"
        )
        return False

    append_log("[green]Environment validated successfully.[/]")
    return True


# Run validation after Tk loads
root.after(100, validate_env)


# ================== Init ==================
load_settings()
btn_download.config(command=run_download)
btn_upload.config(command=run_upload)
btn_run.config(command=run_calculator)
root.bind("<Escape>", lambda e: root.destroy())
root.mainloop()
