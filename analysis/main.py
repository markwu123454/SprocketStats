__version__ = "v25.0"

import importlib
import threading
import asyncio
import dotenv
import ttkbootstrap as tb
from ttkbootstrap.constants import *
import asyncpg, ssl, json, certifi, os

# ================== Database Config ==================
dotenv.load_dotenv()
DB_DSN = os.getenv("DATABASE_URL")

async def get_connection():
    """Create SSL-secured database connection."""
    if not DB_DSN:
        raise RuntimeError("DATABASE_URL not set in environment")
    ssl_context = ssl.create_default_context(cafile=certifi.where())
    conn = await asyncpg.connect(dsn=DB_DSN, ssl=ssl_context)
    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    await conn.set_type_codec("json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    return conn

async def fetch_submitted(conn):
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
root.attributes("-fullscreen", True)

frame = tb.Frame(root, padding=20)
frame.pack(expand=True, fill="both")

# ---- Buttons ----
btn_frame = tb.Frame(frame)
btn_frame.pack(pady=10)

btn_download = tb.Button(btn_frame, text="Download Data", bootstyle="info")
btn_run = tb.Button(btn_frame, text="Run", bootstyle="primary")
btn_upload = tb.Button(btn_frame, text="Upload Data", bootstyle="success")
btn_exit = tb.Button(btn_frame, text="Exit", bootstyle="danger", command=root.destroy)

for b in (btn_download, btn_run, btn_upload, btn_exit):
    b.pack(side="left", padx=5)

# ---- Progress bar ----
progress_bar = tb.Progressbar(frame, orient="horizontal", length=600, mode="determinate", bootstyle="striped-info")
progress_bar.pack(pady=10)

# ---- Log console ----
log_frame = tb.Labelframe(frame, text="Logs", padding=10, bootstyle="info")
log_frame.pack(fill="both", expand=True, pady=5)
log_text = tb.ScrolledText(log_frame, wrap="word", height=14)
log_text.pack(fill="both", expand=True)
log_text.configure(state="disabled", background="#0c0c0c", foreground="#00ff6f", insertbackground="#00ff6f")

# ---- Settings ----
settings_frame = tb.Labelframe(frame, text="Settings", padding=10, bootstyle="secondary")
settings_frame.pack(fill="x", pady=5)
settings_vars = {}

# ---- Data cache ----
downloaded_data = None


# ================== Helper functions ==================
def append_log(msg: str):
    """Safely append text to log."""
    def _append():
        log_text.configure(state="normal")
        log_text.insert("end", msg + "\n")
        log_text.see("end")
        log_text.configure(state="disabled")
    root.after(0, _append)

def update_progress(pct: float):
    def _update():
        progress_bar["value"] = pct
    root.after(0, _update)

def get_settings_snapshot():
    snapshot = {}
    for key, var in settings_vars.items():
        try:
            snapshot[key] = var.get()
        except Exception:
            snapshot[key] = var
    return snapshot


# ================== Lock / Unlock UI ==================
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
    try:
        calc.build_settings_ui(settings_frame, settings_vars, append_log)
        append_log("Settings loaded.")
    except Exception as e:
        append_log(f"[ERROR loading settings] {e}")


# ================== Worker Wrappers ==================
def run_async_task(coro):
    """Run an async function in a background thread."""
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
        append_log("Connecting to database...")
        await asyncio.sleep(0.2)
        update_progress(5)

        conn = await get_connection()
        update_progress(10)
        append_log("Database connected successfully.")

        append_log("Fetching submitted match scouting data...")
        update_progress(12)
        rows = await fetch_submitted(conn)
        downloaded_data = rows
        update_progress(20)

        total = len(rows)
        append_log(f"Fetched {total} rows.")

        for i, _ in enumerate(rows):
            pct = 20 + (i + 1) / max(total, 1) * 80
            update_progress(pct)
            await asyncio.sleep(0.005)

        await conn.close()
        update_progress(100)
        append_log("Download complete.")
    except Exception as e:
        append_log(f"[ERROR] {e}")
        update_progress(0)


def run_download():
    append_log("Starting download...")
    lock_ui()
    run_async_task(download_task())


# ---------------- Upload ----------------
async def upload_task():
    append_log("Simulating upload...")
    for i in range(101):
        update_progress(i)
        await asyncio.sleep(0.02)
        if i % 10 == 0:
            append_log(f"Upload progress: {i}%")
    append_log("Upload complete.")


def run_upload():
    append_log("Starting upload...")
    lock_ui()
    run_async_task(upload_task())


# ---------------- Calculator ----------------
def run_calculator():
    global downloaded_data
    if not downloaded_data:
        append_log("[ERROR] No downloaded data found. Run Download first.")
        return

    append_log("Starting calculator...")
    lock_ui()

    def task():
        try:
            result = calc.calculate_metrics(
                data=downloaded_data,
                progress=update_progress,
                log=append_log,
                settings=get_settings_snapshot,
                lock_ui=lock_ui,
                unlock_ui=unlock_ui,
            )

            if not isinstance(result, dict) or "status" not in result or "result" not in result:
                append_log("[ERROR] Calculator returned unexpected format.")
            else:
                append_log(f"Calculator finished with status {result['status']}")
                append_log(f"Result preview: {json.dumps(result['result'], indent=2)[:800]}")

        except Exception as e:
            append_log(f"[ERROR running calculator] {e}")
        finally:
            root.after(0, unlock_ui)

    threading.Thread(target=task, daemon=True).start()


# ================== Init ==================
load_settings()
btn_download.config(command=run_download)
btn_upload.config(command=run_upload)
btn_run.config(command=run_calculator)
root.bind("<Escape>", lambda e: root.destroy())
root.mainloop()