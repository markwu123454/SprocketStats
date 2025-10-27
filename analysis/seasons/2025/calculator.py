import asyncio
import json

import pandas as pd

import numpy as np
import ttkbootstrap as tb
from ttkbootstrap.constants import *
import tkinter as tk
from collections import defaultdict
from .calculators.Bayesian_Elo_Calculator import compute_feature_elos
from .calculators.KMeans_Clustering import compute_ai_ratings
from .calculators.Random_Forest_Regressor import predict_all_playable_matches
from .helper import extract_team_metrics


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

    add_toggle("Step 4 – Heuristic Scoring", "run_step4", True)
    add_toggle("Step 8 – Habits Analysis", "run_step8", True)
    add_toggle("Step 4.5 – Filter Incomplete Matches", "run_step45", True)
    add_toggle("Step 5 – Featured ELO", "run_step5", True)
    add_toggle("Step 6 – AI Clustering", "run_step6", True)
    add_toggle("Step 7 – Random Forest Predictions", "run_step7", True)

    # ---- Simulation Mode ----
    tb.Label(parent, text="Simulation Mode:").pack(anchor="w", pady=(10, 0))
    sim_var = tk.BooleanVar(value=False)
    tb.Checkbutton(
        parent,
        text="Enable simulation mode (no heavy compute)",
        variable=sim_var,
        bootstyle="round-toggle"
    ).pack(anchor="w", pady=3)
    settings_vars["simulation"] = sim_var



# =========================
# Core Calculation Routine
# =========================
# ================== Step 4: Heuristic Scoring ==================
def predict_team_scores(data: dict) -> dict:
    """Estimate per-team scores for auto, teleop, and endgame phases."""

    def count_branches(branches):
        lvls = {"l2": 0, "l3": 0, "l4": 0}
        for node in branches.values():
            for lvl, val in node.items():
                if val:
                    lvls[lvl] += 1
        return lvls

    def phase_scores(phase: str, d: dict, w: dict):
        branches = count_branches(d.get("branchPlacement", {}))
        scores = {
            "l1": d.get("l1", 0) * w["l1"],
            "l2": branches["l2"] * w["l2"],
            "l3": branches["l3"] * w["l3"],
            "l4": branches["l4"] * w["l4"],
            "barge": d.get("barge", 0) * w["barge"],
            "processor": d.get("processor", 0) * w["processor"],
        }
        return scores

    auto = data.get("auto", {})
    tele = data.get("teleop", {})
    post = data.get("postmatch", {})

    # weights reflect official 2025 Reefscape values
    auto_scores = phase_scores("auto", auto, {"l1": 3, "l2": 4, "l3": 6, "l4": 7, "barge": 4, "processor": 2})
    tele_scores = phase_scores("teleop", tele, {"l1": 2, "l2": 3, "l3": 4, "l4": 5, "barge": 4, "processor": 2})

    auto_total = sum(auto_scores.values()) + (3 if auto.get("moved") else 0)
    tele_total = sum(tele_scores.values())
    endgame = int(post.get("climbSpeed", 0) * 12) if post.get("climbSuccess", False) else 0

    return {
        "auto": auto_scores | {"total": auto_total},
        "teleop": tele_scores | {"total": tele_total},
        "endgame": {"climb": endgame, "total": endgame},
        "predicted_total": auto_total + tele_total + endgame,
    }

async def step4_predict_scores(rows, log, verbose):
    """Iterate over each submitted entry and print predicted scores."""
    log("STEP 4: Predicting per-team heuristic scores...")

    for r in rows:
        data = r["data"]
        team = r["team"]
        match_key = f"{r['match_type']} {r['match']}"
        preds = predict_team_scores(data)

        if verbose:
            log(f"{match_key} | Team {team} | Predicted total: {preds['predicted_total']}")
            log(f"   Auto:   {preds['auto']}")
            log(f"   Teleop: {preds['teleop']}")
            log(f"   End:    {preds['endgame']}\n")
    if not verbose:
        log(f"Predicted heuristic scores for {len(rows)} entries.")


# ================== Step 8: Scoring Habits ==================
def step8_habits(submitted_rows, log, verbose):
    """Derive habits from all matches using auto+teleop branchPlacement."""
    habits = {}

    for r in submitted_rows:
        team = str(r["team"])
        data = r["data"]
        auto_branches = data.get("auto", {}).get("branchPlacement", {})
        tele_branches = data.get("teleop", {}).get("branchPlacement", {})

        all_branches = {**auto_branches, **tele_branches}
        if not all_branches:
            continue

        team_habit = habits.setdefault(team, {
            "position_counts": defaultdict(int),
            "level_counts": defaultdict(int)
        })

        for pos_id, levels in all_branches.items():
            if not isinstance(levels, dict):
                continue
            for lvl, filled in levels.items():
                if filled:
                    team_habit["position_counts"][pos_id] += 1
                    team_habit["level_counts"][lvl] += 1

    result = {}
    for team, stats in habits.items():
        ranked_positions = sorted(stats["position_counts"].items(), key=lambda x: x[1], reverse=True)
        total_levels = sum(stats["level_counts"].values()) or 1
        level_ratios = {lvl: round(cnt / total_levels, 3) for lvl, cnt in stats["level_counts"].items()}
        result[team] = {"position_preference": ranked_positions, "accuracy_by_level": level_ratios}

    if verbose:
        log("=== Step 8: Scoring Habits Summary (branch-based) ===")
        for team, res in list(result.items())[:15]:
            top_positions = ", ".join(f"{p}({c})" for p, c in res["position_preference"][:3])
            log(f"Team {team}: top positions → {top_positions}")
            log(f"             level usage → {res['accuracy_by_level']}")
    else:
        log(f"Computed scoring habits for {len(result)} teams.")

    return result


# ================== Step 4.5: Filter incomplete matches ==================
def filter_incomplete_matches(submitted_rows, log, verbose):
    grouped = defaultdict(lambda: {"red": set(), "blue": set()})
    for r in submitted_rows:
        key = (r["match_type"], r["match"])
        grouped[key][r["alliance"]].add(str(r["team"]))

    valid_matches = {key for key, sides in grouped.items()
                     if len(sides["red"]) == 3 and len(sides["blue"]) == 3}

    filtered = [r for r in submitted_rows if (r["match_type"], r["match"]) in valid_matches]

    msg = (f"Kept {len(filtered)} of {len(submitted_rows)} total entries "
           f"({len(valid_matches)} fully scouted matches).")
    log(msg if verbose else f"{len(valid_matches)} full matches retained.")
    return filtered


# ================== Step 5: Featured Elo ==================
async def step5_featured_elo(submitted_rows, log, verbose):
    per_match_data = defaultdict(lambda: defaultdict(lambda: {"red": {}, "blue": {}}))
    per_team_data = defaultdict(lambda: {"match": []})
    team_match_records = []

    for r in submitted_rows:
        data = r["data"]
        team = str(r["team"])
        match_type = r["match_type"]
        match_num = r["match"]
        alliance = r["alliance"]

        preds = predict_team_scores(data)
        entry = {
            "score_breakdown": {
                "auto": preds["auto"],
                "teleop": preds["teleop"],
                "climb": preds["endgame"]["climb"],
                "total": preds["predicted_total"],
            },
            "score_actions": {
                "auto": preds["auto"],
                "teleop": preds["teleop"],
                "climb": preds["endgame"]["climb"],
            },
        }
        per_match_data[match_type][match_num][alliance][team] = entry
        per_team_data[team]["match"].append((match_type, match_num))
        team_match_records.append(entry)

    feature_axes = {
        "auto": lambda d: d["score_breakdown"]["auto"]["total"],
        "teleop_coral": lambda d: (
            d["score_breakdown"]["teleop"]["l2"]
            + d["score_breakdown"]["teleop"]["l3"]
            + d["score_breakdown"]["teleop"]["l4"]
        ),
        "teleop_algae": lambda d: (
            d["score_breakdown"]["teleop"]["barge"]
            + d["score_breakdown"]["teleop"]["processor"]
        ),
        "climb": lambda d: d["score_breakdown"]["climb"],
    }

    per_team_data = compute_feature_elos(team_match_records, per_match_data, per_team_data, feature_axes)

    if verbose:
        for team, data in per_team_data.items():
            if "elo_featured" in data:
                elo = data["elo_featured"]
                log(f"Team {team}: " + str({k: round(v, 2) for k, v in elo.items() if v is not None}))
    log("Featured ELO computation complete.")
    return per_team_data, per_match_data


# ================== Step 6: K-Means AI Ratings ==================
async def step6_ai_ratings(per_match_data, log, verbose):
    def teleop_base_fields(_, __, ___, data):
        teleop = data["score_actions"]["teleop"]
        return {
            "l1": teleop.get("l1", 0),
            "l2": teleop.get("l2", 0),
            "l3": teleop.get("l3", 0),
            "l4": teleop.get("l4", 0),
            "processor": teleop.get("processor", 0),
            "barge": teleop.get("barge", 0),
            "driver_skill": data.get("teleop_scoring_location", {}).get("l3", {}).get("accuracy", 0),
            "robot_speed": data.get("teleop_scoring_location", {}).get("barge", {}).get("accuracy", 0),
        }

    def extract_auto_fields(_, __, ___, data):
        auto = data.get("score_actions", {}).get("auto", {})
        return {
            "auton_l1": auto.get("l1", 0),
            "auton_l2": auto.get("l2", 0),
            "auton_l3": auto.get("l3", 0),
            "auton_l4": auto.get("l4", 0),
            "auton_processor": auto.get("processor", 0),
            "auton_barge": auto.get("barge", 0),
        }

    def extract_endgame_fields(_, __, ___, data):
        climb = data.get("score_actions", {}).get("climb", 0)
        return {"climb": climb if isinstance(climb, (int, float)) else 0}

    def add_efficiency_fields(df: pd.DataFrame) -> pd.DataFrame:
        df["coral_total"] = df[["l1", "l2", "l3", "l4"]].sum(axis=1)
        df["coral_efficiency"] = df["coral_total"] / 135
        df["algae_total"] = df["processor"] + df["barge"]
        df["algae_efficiency"] = df["algae_total"] / 9
        return df

    category_calculators = [
        {"name": "auto", "fn": lambda df: (
            df["auton_l1"] * 3 + df["auton_l2"] * 4 + df["auton_l3"] * 6 +
            df["auton_l4"] * 7 + df["auton_processor"] * 2 + df["auton_barge"] * 4)},
        {"name": "teleop_coral", "fn": lambda df: (
            df["l1"] * 2 + df["l2"] * 3 + df["l3"] * 4 + df["l4"] * 5)},
        {"name": "teleop_algae", "fn": lambda df: (
            df["processor"] * 2 + df["barge"] * 4)},
        {"name": "climb", "fn": lambda df: df["climb"]},
    ]

    ai_result = compute_ai_ratings(
        per_match_data,
        field_extractors=[teleop_base_fields, extract_auto_fields, extract_endgame_fields],
        derived_feature_functions=[add_efficiency_fields],
        category_calculators=category_calculators,
        n_clusters=5
    )

    if verbose:
        log("Cluster summary (averaged category scores):")
        for c, v in ai_result["cluster_summary"].items():
            log(f"Cluster {c}: {v}")
        log("Sample team ratings:")
        for team, stats in list(ai_result["team_stats"].items())[:10]:
            log(f"Team {team}: {stats}")
    else:
        log(f"AI clustering complete with {len(ai_result['cluster_summary'])} clusters.")

    return ai_result


# ================== Step 7: Random Forest ==================
async def step7_random_forest(per_match_data, log, verbose):
    match_order = {"qm": 0, "sf": 1, "f": 2}
    unified_matches = {}
    for mtype, matches in per_match_data.items():
        for mnum, data in matches.items():
            unified_matches[match_order.get(mtype, 99) * 1000 + int(mnum)] = data

    combined_data = {"qm": unified_matches}
    total_matches = len(unified_matches)
    log(f"Collected {total_matches} total matches for Random Forest training.")

    aspect_extractors = {
        "coral": lambda d: d["score_breakdown"]["teleop"].get("coral", 0),
        "algae": lambda d: d["score_breakdown"]["teleop"].get("algae", 0),
        "climb": lambda d: d["score_breakdown"].get("climb", 0),
        "auto": lambda d: d["score_breakdown"]["auto"].get("total", 0),
    }

    def team_features_fn(team_id: str, match_type: str, match_num: int):
        alliance_data = combined_data["qm"].get(match_num, {})
        for alliance in ["red", "blue"]:
            if team_id in alliance_data.get(alliance, {}):
                team_data = alliance_data[alliance][team_id]
                break
        else:
            raise KeyError(f"Team {team_id} not found in match {match_num}")

        sa = team_data["score_actions"]
        tsl = team_data.get("teleop_scoring_location", {})
        auto, tele = sa.get("auto", {}), sa.get("teleop", {})

        total_coral_cycles = auto.get("coral_cycle", 0) + tele.get("coral_cycle", 0)
        total_algae_cycles = auto.get("algae_cycle", 0) + tele.get("algae_cycle", 0)
        move_flag = auto.get("move", 0)

        total_attempts = sum(
            tsl.get(loc, {}).get("total_attempt", 0)
            for loc in ["l1", "l2", "l3", "l4", "barge"]
        )
        avg_accuracy = (
            np.mean([
                tsl.get(loc, {}).get("accuracy", 0.0)
                for loc in ["l1", "l2", "l3", "l4", "barge"]
                if tsl.get(loc, {}).get("total_attempt", 0) > 0
            ]) if total_attempts > 0 else 0.0
        )

        return [total_coral_cycles, total_algae_cycles, move_flag, total_attempts, avg_accuracy]

    results = predict_all_playable_matches(
        raw_match_data=combined_data,
        team_features_fn=team_features_fn,
        aspect_extractors=aspect_extractors,
        match_type="qm"
    )

    predicted_count = 0
    for i, match in enumerate(results, start=1):
        match_num = match["match_num"]
        predicted = match.get("predicted", {})
        for alliance in ["red", "blue"]:
            for team, pred in predicted.get(alliance, {}).items():
                injected = False
                for mtype, matches in per_match_data.items():
                    if match_num in matches:
                        matches[match_num][alliance][team]["ai_prediction"] = pred
                        injected = True
                        break
                if not injected:
                    per_match_data["qm"].setdefault(match_num, {"red": {}, "blue": {}})
                    per_match_data["qm"][match_num][alliance][team] = {
                        "score_breakdown": {},
                        "ai_prediction": pred,
                    }
        if verbose:
            log(f"Cycle {i}/{len(results)} → match {match_num} predicted")
        predicted_count += 1

    skipped = total_matches - predicted_count
    log(f"Random Forest predicted {predicted_count} matches; skipped {skipped}.")
    return per_match_data



async def _calculate_async(data, progress, log, get_settings):
    if not data:
        log("[ERROR] No input data provided to calculator.")
        return {"status": 1, "result": {"error": "no data"}}

    try:
        log(json.dumps(extract_team_metrics(data)))

        settings = get_settings()
        verbose = settings.get("verbose", True)
        simulation = settings.get("simulation", False)

        # Step control flags
        run4 = settings.get("run_step4", True)
        run8 = settings.get("run_step8", True)
        run45 = settings.get("run_step45", True)
        run5 = settings.get("run_step5", True)
        run6 = settings.get("run_step6", True)
        run7 = settings.get("run_step7", True)

        log(f"Running calculation | verbose={verbose} simulation={simulation}")
        progress(0)

        habits = {}
        per_team_data = {}
        per_match_data = {}
        ai_result = {}

        # STEP 4
        if run4:
            log("STEP 4: Heuristic scoring predictions...")
            await step4_predict_scores(data, log, verbose)
            progress(20)
        else:
            log("STEP 4: Skipped.")

        # STEP 8
        if run8:
            log("STEP 8: Analyzing team habits (branch placement)...")
            habits = step8_habits(data, log, verbose)
            progress(35)
        else:
            log("STEP 8: Skipped.")

        # STEP 4.5
        if run45:
            log("STEP 4.5: Filtering incomplete matches...")
            submitted_rows = filter_incomplete_matches(data, log, verbose)
            progress(45)
        else:
            log("STEP 4.5: Skipped.")
            submitted_rows = data

        # STEP 5
        if run5:
            log("STEP 5: Computing featured ELOs...")
            per_team_data, per_match_data = await step5_featured_elo(submitted_rows, log, verbose)
            progress(65)
        else:
            log("STEP 5: Skipped.")

        # STEP 6
        if run6:
            log("STEP 6: Computing AI groupings...")
            ai_result = await step6_ai_ratings(per_match_data or {}, log, verbose)
            progress(80)
        else:
            log("STEP 6: Skipped.")

        # STEP 7
        if run7:
            log("STEP 7: Predicting match outcomes with Random Forest...")
            per_match_data = await step7_random_forest(per_match_data or {}, log, verbose)
            progress(100)
        else:
            log("STEP 7: Skipped.")
            progress(100)

        log("All selected analysis steps complete.")

        # --- Convert DataFrames to JSON-compatible dicts ---
        def safe_convert(obj):
            if isinstance(obj, pd.DataFrame):
                return obj.to_dict(orient="records")
            if isinstance(obj, dict):
                return {k: safe_convert(v) for k, v in obj.items()}
            if isinstance(obj, list):
                return [safe_convert(x) for x in obj]
            return obj

        result_obj = {
            "summary": {
                "teams": len(per_team_data or {}),
                "matches": len(per_match_data or {}),
                "clusters": len(ai_result.get("cluster_summary", {})) if ai_result else 0,
                "habits": len(habits or {}),
                "steps_enabled": {
                    "step4": run4,
                    "step8": run8,
                    "step45": run45,
                    "step5": run5,
                    "step6": run6,
                    "step7": run7,
                },
            },
            "per_team_data": safe_convert(per_team_data),
            "per_match_data": safe_convert(per_match_data),
            "ai_result": safe_convert(ai_result),
            "habits": safe_convert(habits),
        }

        return {"status": 0, "result": result_obj}

    except Exception as e:
        log(f"[ERROR in calculate_metrics] {e}")
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
        log(f"[FATAL ERROR] {e}")
        result = {"status": 1, "result": {"error": str(e)}}
    finally:
        unlock()

    return result
