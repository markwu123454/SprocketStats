__version__ = "v25.0.1"

import importlib, threading, asyncio, dotenv, ttkbootstrap as tb
from ttkbootstrap.constants import *
import asyncpg, ssl, json, certifi, os

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
            WHERE status='submitted' AND event_key ILIKE $1
            ORDER BY match_type, match, alliance, team
        """, f"%{event_key_filter}%")
    else:
        rows = await conn.fetch("""
            SELECT event_key, match, match_type, team, alliance, scouter, data
            FROM match_scouting
            WHERE status='submitted'
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
calc_result = None  # <-- new global result


# ================== Helper functions ==================
def append_log(msg: str):
    def _append():
        log_text.configure(state="normal")
        log_text.insert("end", msg + "\n")
        log_text.see("end")
        log_text.configure(state="disabled")
    root.after(0, _append)

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
        append_log("Settings loaded.")
    except Exception as e:
        append_log(f"[ERROR loading settings] {e}")


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
        append_log("Connecting to database...")
        await asyncio.sleep(0.2)
        update_progress(5)

        conn = await get_connection()
        update_progress(10)
        append_log("Database connected successfully.")

        event_filter = get_settings_snapshot().get("event_key", "")
        append_log(f"Fetching submitted match data (filter='{event_filter or 'ALL'}')...")
        rows = await fetch_submitted(conn, event_filter)
        downloaded_data = rows
        total = len(rows)
        update_progress(20)
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


# ---------------- Calculator ----------------
def run_calculator():
    global downloaded_data, calc_result
    if not downloaded_data:
        append_log("[ERROR] No downloaded data found. Run Download first.")
        return

    append_log("Starting calculator...")
    lock_ui()

    def task():
        global calc_result
        try:
            result = calc.calculate_metrics(
                data=downloaded_data,
                progress=update_progress,
                log=append_log,
                settings=get_settings_snapshot,
                lock_ui=lock_ui,
                unlock_ui=unlock_ui,
            )
            if not isinstance(result, dict) or "status" not in result:
                append_log("[ERROR] Calculator returned unexpected format.")
            else:
                calc_result = result
                append_log(f"Calculator finished: {result['status']}")
        except Exception as e:
            append_log(f"[ERROR running calculator] {e}")
        finally:
            root.after(0, unlock_ui)

    threading.Thread(target=task, daemon=True).start()


# ---------------- Upload ----------------
async def upload_task():
    global calc_result
    try:
        if not calc_result or "result" not in calc_result:
            append_log("[ERROR] No calculator output found. Run Calculator first.")
            return

        event_key = get_settings_snapshot().get("event_key", "").strip()
        if not event_key:
            append_log("[ERROR] Event key filter is required for upload.")
            return

        update_progress(0)
        append_log(f"Connecting to database for upload (event_key='{event_key}')...")
        conn = await get_connection()
        update_progress(10)

        append_log("Uploading new processed data version...")
        payload = calc_result["result"]

        await conn.execute("""
            INSERT INTO processed_data (event_key, data)
            VALUES ($1, $2);
        """, event_key, json.dumps(payload))

        await conn.close()
        update_progress(100)
        append_log("Upload complete. New version recorded.")
    except Exception as e:
        append_log(f"[ERROR during upload] {e}")
        update_progress(0)



def run_upload():
    append_log("Starting upload...")
    lock_ui()
    run_async_task(upload_task())


# ================== Init ==================
load_settings()
btn_download.config(command=run_download)
btn_upload.config(command=run_upload)
btn_run.config(command=run_calculator)
root.bind("<Escape>", lambda e: root.destroy())
root.mainloop()
