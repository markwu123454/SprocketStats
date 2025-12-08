import asyncio
import json

import pandas as pd

import numpy as np
import ttkbootstrap as tb
from ttkbootstrap.constants import *
import tkinter as tk
from collections import defaultdict
from .helper import extract_team_metrics

# TODO: still from reefscape, everything need to change

# =========================
# Build Settings Panel
# =========================
def build_settings_ui(parent, settings_vars: dict, log_fn):
    log_fn("Building settings panel...")

    # ---- Verbose Logging ----
    tb.Label(parent, text="Verbose Logging:").pack(anchor="w")
    verbose_var = tk.BooleanVar(value=True)
    tb.Checkbutton(
        parent,
        text="Enable detailed step logs",
        variable=verbose_var,
        bootstyle="round-toggle"
    ).pack(anchor="w", pady=3)
    settings_vars["verbose"] = verbose_var

    # ---- Feature Toggles ----
    tb.Label(parent, text="Enabled Features:").pack(anchor="w", pady=(10, 0))

    def add_toggle(name, key, default=True):
        var = tk.BooleanVar(value=default)
        tb.Checkbutton(
            parent,
            text=name,
            variable=var,
            bootstyle="round-toggle"
        ).pack(anchor="w", pady=2)
        settings_vars[key] = var

    add_toggle("Step 1 – Heuristic Scoring", "run_step4", True)
    add_toggle("Step 2 – Habits Analysis", "run_step8", True)
    add_toggle("Step 3 – Filter Incomplete Matches", "run_step45", True)
    add_toggle("Step 4 – Featured ELO", "run_step5", True)
    add_toggle("Step 5 – AI Clustering", "run_step6", True)
    add_toggle("Step 6 – Random Forest Predictions", "run_step7", True)




# =========================
# Core Calculation Routine
# =========================
''''''
''''''
''''''
''''''

async def _calculate_async(data, progress, log, get_settings):
    if not data:
        log("[red][ERROR] No input data provided to calculator.[/]")
        return {"status": 1, "result": {"error": "no data"}}

    try:
        log(json.dumps(extract_team_metrics(data)))

        settings = get_settings()
        verbose = settings.get("verbose", True)

        # Step control flags
        run4 = settings.get("run_step4", True)
        run8 = settings.get("run_step8", True)
        run45 = settings.get("run_step45", True)
        run5 = settings.get("run_step5", True)
        run6 = settings.get("run_step6", True)
        run7 = settings.get("run_step7", True)

        log(f"Running calculation | verbose={verbose}")
        progress(0)

        result = {}

        # --- Extract datasets ---
        match_data = data.get("match_scouting", [])
        all_matches = data.get("all_matches", [])
        if not match_data:
            log("[yellow][WARN] No match_scouting data found — skipping main analysis pipeline.[/]")
            return {"status": 1, "result": {"error": "no match_scouting"}}

        step_0_output = {
            "total": 0,
            "valid_records": 0,
            "invalid_records": 0,
            "warnings": [],
            "errors": [],
            "low_acc": {
                "team": [],
                "scouter": [],
            },
        }
        # Step 0: data validation
        # Step 0.1: valid data internally, check that data make sense with each other
        # Step 0.2: valid data externally, with tba's published match data
        # Step 0.3: (optional) find person or matches with low accuracies

        step_1_output = {
            "team_match": {},  # team_match[team][match] → metrics dict
            "team": {},  # team[team] → aggregate metrics dict
            "match": {},  # match[match] → aggregate metrics dict
        }
        # Step 1: calculate basic info
        # Step 1.1: compute per team per match data
        # Step 1.2: compute per team aggregate data
        # Step 1.3: compute per match aggregate data

        step_2_output = {
            "heuristic": {
                "ranking": [],
                "team_scores": {} # point contribution
            },
            "elo": {
                "ranking": [],
                "team_scores": {} # elo score
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
        # Step 2: get ranking
        # Step 2.1: calculate heuristics point average
        # Step 2.2: calculate elo score
        # Step 2.3: fetch statbotics epa
        # Step 2.4: fetch tba rp ranking

        step_3_output = {
            "heuristic": {},
            "random_forest": {},
        }
        # Step 3: match predictions
        # Step 3.1: match prediction from heuristic ranking
        # Step 3.2: match prediction from random forest

        # Step 4: qualitative analysis
        # Step 4.1: qualitative analysis

        # Step 5: to be added

        result = {
            "match": {},
            "team": {},
            "ranking": {},
            "alliance": {},
        }
        # Step 6: translate data

        # TODO: look into bayesian_opr glicko_2 xgboost kmeans monte-carlo


        return {"status": 0, "result": result}

    except Exception as e:
        log(f"[red][ERROR in calculate_metrics] {e}")
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
