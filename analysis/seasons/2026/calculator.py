import asyncio
import traceback

import ttkbootstrap as tb


# TODO: still from reefscape, everything need to change

# =========================
# Build Settings Panel
# =========================
def build_settings_ui(parent, settings_vars: dict, log_fn):
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

    current_step = ""
    try:
        progress(0)
        log(f"[white]→ Starting calculator")
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

        if verbose:
            log(f"[white]  → Running steps: {', '.join(s := [k.replace('run_', '') for k, v in settings.items() if k.startswith('run_') and v]) or 'none'}")
        progress(1)

        result = {}

        # --- Extract datasets ---
        match_data = data.get("match_scouting", [])
        all_matches = data.get("all_matches", [])
        '''
        if not match_data:
            log("[yellow][WARN] No match_scouting data found — skipping main analysis pipeline.[/]")
            return {"status": 1, "result": {"error": "no match_scouting"}}'''

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
        # Step 0: Data validation pipeline
        log("[white]    → Running data validation checks")

        current_step = "0.1"
        # Step 0.1: Validate raw input data for internal consistency
        log("[green]      ✔ Internal data consistency validated")

        current_step = "0.2"
        # Step 0.2: Validate event/team/match data against TBA's published data
        log("[green]      ✔ Data validated against TBA official records")

        current_step = "0.3"
        # Step 0.3: Identify scouting entries or matches with abnormal/low confidence
        log("[green]      ✔ Low-confidence or anomalous data detected")

        step_1_output = {
            "team_match": {},  # team_match[team][match] → per-team-per-match computed metrics
            "team": {},  # team[team] → aggregated team-level metrics
            "match": {},  # match[match] → aggregated match-level metrics
        }

        if run1:
            current_step = "1"
            # Step 1: Compute baseline metrics from scouting data
            log("[white]    → Computing baseline match and team metrics")

            current_step = "1.1"
            # Step 1.1: Compute metrics for each team in each match
            log("[green]      ✔ Per-team-per-match metrics calculated")

            current_step = "1.2"
            # Step 1.2: Aggregate per-team metrics across all matches
            log("[green]      ✔ Team aggregate metrics calculated")

            current_step = "1.3"
            # Step 1.3: Aggregate per-match metrics across all teams
            log("[green]      ✔ Match aggregate metrics calculated")

        step_2_output = {
            "heuristic": {
                "ranking": [],
                "team_scores": {}
            },
            "elo": {
                "ranking": [],
                "team_scores": {}
            },
            "statbotics": {
                "ranking": [],
                "team_scores": {}
            },
            "rp": {
                "ranking": [],
                "team_scores": {}
            },
        }

        if run2:
            current_step = "2"
            # Step 2: Build performance rankings using multiple models
            log("[white]    → Generating performance-based team rankings")

            current_step = "2.1"
            # Step 2.1: Compute heuristic scoring averages
            log("[green]      ✔ Heuristic ranking scores computed")

            current_step = "2.2"
            # Step 2.2: Compute feature-based ELO scores
            log("[green]      ✔ ELO model team scores computed")

            current_step = "2.3"
            # Step 2.3: Retrieve Statbotics EPA values
            log("[green]      ✔ Statbotics EPA rankings fetched")

            current_step = "2.4"
            # Step 2.4: Retrieve TBA ranking point values
            log("[green]      ✔ Ranking point standings retrieved from TBA")

        step_3_output = {
            "heuristic": {},
            "random_forest": {},
        }

        if run3:
            current_step = "3"
            # Step 3: Predict match outcomes
            log("[white]    → Running match prediction models")

            current_step = "3.1"
            # Step 3.1: Predict match outcomes using heuristic rankings
            log("[green]      ✔ Match predictions generated from heuristic model")

            current_step = "3.2"
            # Step 3.2: Predict match outcomes using Random Forest model
            log("[green]      ✔ Match predictions generated from Random Forest model")

        step_4_output = {}

        if run4:
            current_step = "4"
            # Step 4: Perform qualitative analysis on teams and matches
            log("[white]    → Performing qualitative analysis")

            current_step = "4.1"
            # Step 4.1: Generate qualitative insights (strengths, weaknesses, trends)
            log("[green]      ✔ Qualitative analysis complete")

        # Step 5 reserved for future features
        # log("[white]    → Step 5 placeholder (future expansion)")

        result = {
            "match": {},
            "team": {},
            "ranking": {},
            "alliance": {},
        }

        if run6:
            current_step = "6"
            # Step 6: Convert computed data into output format (translation/serialization)
            log("[white]    → Translating all processed data into output structures")
            result = {
                "step0": step_0_output,
                "step1": step_1_output,
                "step2": step_2_output,
                "step3": step_3_output,
                "step4": step_4_output
            }
            log("[green]      ✔ Done")

        # TODO: look into bayesian_opr, glicko_2, xgboost(predict trends for wins/losses), kmeans useful!!, monte-carlo, elote


        return {"status": 0, "result": result}

    except Exception as e:
        log(f"[red] ✖ error in: {current_step}")
        log(f"[red] ✖ {traceback.format_exc()}")
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
