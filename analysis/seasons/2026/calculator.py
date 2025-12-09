import asyncio
import ttkbootstrap as tb

from .calculators.bayesian_opr import fit_model

# TODO: still from reefscape, everything need to change

# =========================
# Build Settings Panel
# =========================
def build_settings_ui(parent, settings_vars: dict, log_fn):
    log_fn("Building settings panel...")

    # ---- Verbose Logging ----
    tb.Label(parent, text="Verbose Logging:").pack(anchor="w")
    verbose_var = tb.BooleanVar(value=True)
    tb.Checkbutton(
        parent,
        text="Enable detailed step logs",
        variable=verbose_var
    ).pack(anchor="w", pady=3)
    settings_vars["verbose"] = verbose_var

    # ---- Feature Toggles ----
    tb.Label(parent, text="Enabled Features:").pack(anchor="w", pady=(10, 0))

    def add_toggle(name, key, default=True):
        var = tb.BooleanVar(value=default)
        tb.Checkbutton(
            parent,
            text=name,
            variable=var
        ).pack(anchor="w", pady=2)
        settings_vars[key] = var

    add_toggle("Step 1 – compute basic info", "run_step1", True)
    add_toggle("Step 2 – compute team ranking", "run_step2", True)
    add_toggle("Step 3 – compute match prediction", "run_step3", True)
    add_toggle("Step 4 – compute qualitative analysis", "run_step4", True)
    add_toggle("Step 5 – ", "run_step5", True)
    add_toggle("Step 6 – ", "run_step6", True)


# =========================
# Calculation Helper functions
# =========================
''''''
''''''
''''''
''''''

# =========================
# Core Calculation Routine
# =========================
async def _calculate_async(data, progress, log, get_settings):
    if not data:
        log("[red][ERROR] No input data provided to calculator.[/]")
        return {"status": 1, "result": {"error": "no data"}}

    current_step = ""
    try:
        progress(0)
        #log(json.dumps(extract_team_metrics(data)))

        # fetch flags
        settings = get_settings()
        verbose = settings.get("verbose", True)

        run1 = settings.get("run_step1", True)
        run2 = settings.get("run_step2", True) and run1
        run3 = settings.get("run_step3", True) and run2
        run4 = settings.get("run_step4", True) and run3
        run5 = settings.get("run_step5", True) and run4
        run6 = settings.get("run_step6", True) and run5

        log(f"Running calculation | verbose={verbose}")
        log(f"Running step(s): {', '.join(steps) if (steps := [k.replace('run_', '') for k, v in settings.items() if k.startswith('run_') and v]) else 'none'}")
        progress(1)

        result = {}

        # --- Extract datasets ---
        match_data = data.get("match_scouting", [])
        all_matches = data.get("all_matches", [])
        if not match_data:
            log("[yellow][WARN] No match_scouting data found — skipping main analysis pipeline.[/]")
            return {"status": 1, "result": {"error": "no match_scouting"}}

        step_0_output = {
            "total_warnings": 0,
            "valid_records": 0,
            "invalid_records": 0,
            "warnings": [],
            "errors": [],
            "low_acc": {
                "team": [],
                "scouter": [],
            },
        }
        current_step = "0"
        # Step 0: data validation
        current_step = "0.1"
        # Step 0.1: valid data internally, check that data make sense with each other
        current_step = "0.2"
        # Step 0.2: valid data externally, with tba's published match data
        current_step = "0.3"
        # Step 0.3: (optional) find person or matches with low accuracies

        step_1_output = {
            "team_match": {},  # team_match[team][match] → metrics dict
            "team": {},  # team[team] → aggregate metrics dict
            "match": {},  # match[match] → aggregate metrics dict
        }
        if run1:
            current_step = "1"
            # Step 1: calculate basic info
            current_step = "1.1"
            # Step 1.1: compute per team per match data
            current_step = "1.2"
            # Step 1.2: compute per team aggregate data
            current_step = "1.3"
            # Step 1.3: compute per match aggregate data

        step_2_output = {
            "heuristic": {
                "ranking": [],
                "team_scores": {} # point contribution
            },
            "elo": {
                "ranking": [],
                "team_scores": {} # elo score by feature
            },
            "statbotics": {
                "ranking": [],
                "team_scores": {} # EPA
            },
            "rp": {
                "ranking": [],
                "team_scores": {} # ranking point contribution
            },
        }
        if run2:
            current_step = "2"
            # Step 2: get ranking
            current_step = "2.1"
            # Step 2.1: calculate heuristics point average
            current_step = "2.2"
            # Step 2.2: calculate featured elo score
            current_step = "2.3"
            # Step 2.3: fetch statbotics epa
            current_step = "2.4"
            # Step 2.4: fetch tba rp ranking

        step_3_output = {
            "heuristic": {},
            "random_forest": {},
        }
        if run3:
            current_step = "3"
            # Step 3: match predictions
            current_step = "3.1"
            # Step 3.1: match prediction from heuristic ranking
            current_step = "3.2"
            # Step 3.2: match prediction from random forest

        step_4_output = {

        }
        if run4:
            current_step = "4"
            # Step 4: qualitative analysis
            current_step = "4.1"
            # Step 4.1: qualitative analysis

        # Step 5: to be added

        result = {
            "match": {},
            "team": {},
            "ranking": {},
            "alliance": {},
        }
        current_step = "6"
        # Step 6: translate data

        # TODO: look into bayesian_opr, glicko_2, xgboost, kmeans, monte-carlo, elote


        return {"status": 0, "result": result}

    except Exception as e:
        log(f"[red][ERROR during {current_step}] {e}")
        return {"status": 1, "result": {"error": str(e)}}


# =========================
# Public Entry Point
# =========================
def calculate_metrics(data=None, **kw):
    """
    Entry point used by the GUI.
    Uses provided in-memory data (no DB access).
    Returns {"status": int, "result": dict}.
    """
    progress = kw.get("progress", lambda _: None)
    log = kw.get("log", print)
    get_settings = kw.get("settings", lambda: {})
    lock = kw.get("lock_ui", lambda: None)
    unlock = kw.get("unlock_ui", lambda: None)

    lock()
    try:
        result = asyncio.run(_calculate_async(data, progress, log, get_settings))
    except Exception as e:
        log(f"[red][FATAL ERROR] {e}")
        result = {"status": 1, "result": {"error": str(e)}}
    finally:
        unlock()

    return result
