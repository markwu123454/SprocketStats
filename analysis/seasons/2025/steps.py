import asyncio
import asyncpg
import json
import os
import ssl
import certifi
import pandas as pd
import numpy as np
from collections import defaultdict
from calculators.Bayesian_Elo_Calculator import compute_feature_elos
from calculators.KMeans_Clustering import compute_ai_ratings
from calculators.Random_Forest_Regressor import predict_all_playable_matches

DB_DSN = "postgresql://neondb_owner:npg_zABmb94iDJdn@ep-jolly-darkness-af8t104l-pooler.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# ================== Setup ==================
async def get_connection():
    """Create SSL-secured database connection."""
    if not DB_DSN:
        raise RuntimeError("DATABASE_URL not set in environment")
    ssl_context = ssl.create_default_context(cafile=certifi.where())
    conn = await asyncpg.connect(dsn=DB_DSN, ssl=ssl_context)
    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    await conn.set_type_codec("json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    return conn


# ================== Step 1: Fetch submitted scouting ==================
async def fetch_submitted(conn):
    rows = await conn.fetch("""
        SELECT event_key, match, match_type, team, alliance, scouter, data
        FROM match_scouting
        WHERE status = 'submitted'
        ORDER BY match_type, match, alliance, team
    """)
    return rows


def summarize_submitted(rows):
    grouped = defaultdict(list)
    for r in rows:
        key = f"{r['match_type']} {r['match']}"
        grouped[key].append((r['alliance'], r['team'], r['scouter']))
    print(f"Retrieved {len(rows)} submitted entries across {len(grouped)} matches.\n")
    for match_key, entries in grouped.items():
        print(f"• {match_key}:")
        red = [f"{t} ({s or 'none'})" for a, t, s in entries if a == "red"]
        blue = [f"{t} ({s or 'none'})" for a, t, s in entries if a == "blue"]
        print(f"   Red:  {', '.join(red) if red else '—'}")
        print(f"   Blue: {', '.join(blue) if blue else '—'}\n")
    return grouped



# ================== Step 2: Fetch scheduled matches ==================
async def fetch_all_matches(conn):
    rows = await conn.fetch("""
        SELECT event_key, match_type, match_number, red1, red2, red3, blue1, blue2, blue3
        FROM matches
        WHERE event_key = (SELECT current_event FROM metadata LIMIT 1)
        ORDER BY match_type, match_number
    """)
    return rows


# ================== Step 3: Unscouted matches ==================
def find_unscouted(matches, submitted_summary):
    missing = []
    for m in matches:
        key = f"{m['match_type']} {m['match_number']}"
        red_teams = [str(m['red1']), str(m['red2']), str(m['red3'])]
        blue_teams = [str(m['blue1']), str(m['blue2']), str(m['blue3'])]
        submitted_teams = {str(t) for a, t, _ in submitted_summary.get(key, [])}
        unscouted = [t for t in red_teams + blue_teams if t not in submitted_teams]
        if unscouted:
            missing.append((key, unscouted))

    print("===== Unscouted Matches =====")
    if not missing:
        print("All matches have been fully scouted!\n")
    else:
        for key, teams in missing:
            print(f"{key}: Missing {', '.join(teams)}")
    print()


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


async def step4_predict_scores(rows):
    """Iterate over each submitted entry and print predicted scores."""
    print("STEP 4: Predicting per-team heuristic scores...\n")
    for r in rows:
        data = r["data"]
        team = r["team"]
        match_key = f"{r['match_type']} {r['match']}"
        preds = predict_team_scores(data)
        print(f"{match_key} | Team {team} | Predicted total: {preds['predicted_total']}")
        print(f"   Auto:   {preds['auto']}")
        print(f"   Teleop: {preds['teleop']}")
        print(f"   End:    {preds['endgame']}\n")



# ================== Step 4.5: Filter incomplete matches ==================
def filter_incomplete_matches(submitted_rows):
    """
    Remove matches that are missing any of their 6 scouted teams (3 red + 3 blue).
    """

    # --- Group by match key and alliance ---
    grouped = defaultdict(lambda: {"red": set(), "blue": set()})
    for r in submitted_rows:
        key = (r["match_type"], r["match"])
        grouped[key][r["alliance"]].add(str(r["team"]))

    # --- Identify complete matches (3 red + 3 blue) ---
    valid_matches = {
        key
        for key, sides in grouped.items()
        if len(sides["red"]) == 3 and len(sides["blue"]) == 3
    }

    filtered = [r for r in submitted_rows if (r["match_type"], r["match"]) in valid_matches]

    print(f"Kept {len(filtered)} of {len(submitted_rows)} total entries "
          f"({len(valid_matches)} fully scouted matches).\n")

    return filtered


# ================== Step 5: Featured Elo ==================
async def step5_featured_elo(submitted_rows):
    """
    Build minimal per_match_data and per_team_data from heuristic results,
    then compute feature-based Elo scores using Coulom-style feature rating.
    """

    # --- Build data containers ---
    per_match_data = defaultdict(lambda: defaultdict(lambda: {"red": {}, "blue": {}}))
    per_team_data = defaultdict(lambda: {"match": []})
    team_match_records = []

    # --- Populate data ---
    for r in submitted_rows:
        data = r["data"]
        team = str(r["team"])
        match_type = r["match_type"]
        match_num = r["match"]
        alliance = r["alliance"]

        # Compute heuristic per-team scores for compatibility
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

    # --- Define feature axes ---
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

    # --- Compute featured Elo ---
    per_team_data = compute_feature_elos(team_match_records, per_match_data, per_team_data, feature_axes)

    # --- Print summary ---
    for team, data in per_team_data.items():
        if "elo_featured" not in data:
            continue
        elo = data["elo_featured"]
        print(f"Team {team}: ", {k: round(v, 2) for k, v in elo.items() if v is not None})

    print("\nFeatured ELO computation complete.\n")
    return per_team_data, per_match_data


# ================== Step 6: K-Means AI Ratings ==================
async def step6_ai_ratings(per_match_data):
    """
    Compute AI-based K-Means team ratings using heuristic fields.
    Produces cluster assignments, per-category averages, and summary statistics.
    """

    # --- 1. Define field extractors (raw features per match/team) ---
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

    field_extractors = [teleop_base_fields, extract_auto_fields, extract_endgame_fields]

    # --- 2. Derived feature functions ---
    def add_efficiency_fields(df: pd.DataFrame) -> pd.DataFrame:
        df["coral_total"] = df[["l1", "l2", "l3", "l4"]].sum(axis=1)
        df["coral_efficiency"] = df["coral_total"] / 135
        df["algae_total"] = df["processor"] + df["barge"]
        df["algae_efficiency"] = df["algae_total"] / 9
        return df

    derived_feature_functions = [add_efficiency_fields]

    # --- 3. Category calculators (weighted aggregate metrics) ---
    category_calculators = [
        {
            "name": "auto",
            "fn": lambda df: (
                df["auton_l1"] * 3 + df["auton_l2"] * 4 + df["auton_l3"] * 6 +
                df["auton_l4"] * 7 + df["auton_processor"] * 2 + df["auton_barge"] * 4
            )
        },
        {
            "name": "teleop_coral",
            "fn": lambda df: (
                df["l1"] * 2 + df["l2"] * 3 + df["l3"] * 4 + df["l4"] * 5
            )
        },
        {
            "name": "teleop_algae",
            "fn": lambda df: (
                df["processor"] * 2 + df["barge"] * 4
            )
        },
        {
            "name": "climb",
            "fn": lambda df: df["climb"]
        }
    ]

    # --- 4. Compute AI ratings ---
    ai_result = compute_ai_ratings(
        per_match_data,
        field_extractors=field_extractors,
        derived_feature_functions=derived_feature_functions,
        category_calculators=category_calculators,
        n_clusters=5
    )

    # --- 5. Display summary ---
    print("Cluster summary (averaged category scores):\n")
    for c, v in ai_result["cluster_summary"].items():
        print(f"Cluster {c}: {v}")
    print()

    print("Sample team ratings:")
    for team, stats in list(ai_result["team_stats"].items())[:10]:
        print(f"Team {team}: {stats}")

    print("\nK-Means AI rating computation complete.\n")
    return ai_result


async def step7_random_forest(per_match_data):
    """
    Runs Random Forest regressors across ALL matches (qm, sf, f combined).
    Treats them as one chronological sequence for learning consistency.
    """

    # --- 1. Merge all match types into one unified chronological set ---
    unified_matches = {}
    match_order = {"qm": 0, "sf": 1, "f": 2}

    for mtype, matches in per_match_data.items():
        for mnum, data in matches.items():
            order_offset = match_order.get(mtype, 99) * 1000
            unified_matches[order_offset + int(mnum)] = data

    combined_data = {"qm": unified_matches}
    total_matches = len(unified_matches)
    print(f"Collected {total_matches} total matches (qm+sf+f unified).\n")

    # --- 2. Define extractors and feature builders ---
    aspect_extractors = {
        "coral": lambda d: d["score_breakdown"]["teleop"].get("coral", 0),
        "algae": lambda d: d["score_breakdown"]["teleop"].get("algae", 0),
        "climb": lambda d: d["score_breakdown"].get("climb", 0),
        "auto": lambda d: d["score_breakdown"]["auto"].get("total", 0),
    }

    def team_features_fn(team_id: str, match_type: str, match_num: int):
        try:
            alliance_data = combined_data["qm"][match_num]
        except KeyError:
            raise KeyError(f"Missing match {match_num}")

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
            ])
            if total_attempts > 0 else 0.0
        )

        return [total_coral_cycles, total_algae_cycles, move_flag, total_attempts, avg_accuracy]

    # --- 3. Run Random Forest training/prediction ---
    print("Building match history and running Random Forest regressors...\n")

    results = predict_all_playable_matches(
        raw_match_data=combined_data,
        team_features_fn=team_features_fn,
        aspect_extractors=aspect_extractors,
        match_type="qm"
    )

    # --- 4. Inject results and print progress ---
    print("\nInjecting predictions into original match data...")
    predicted_count = 0
    for i, match in enumerate(results, start=1):
        match_num = match["match_num"]
        predicted = match.get("predicted", {})
        for alliance in ["red", "blue"]:
            for team, pred in predicted.get(alliance, {}).items():
                injected = False
                # inject into existing match if it exists
                for mtype, matches in per_match_data.items():
                    if match_num in matches:
                        matches[match_num][alliance][team]["ai_prediction"] = pred
                        injected = True
                        break
                # create a new future match entry if it doesn't exist yet
                if not injected:
                    per_match_data["qm"][match_num] = per_match_data["qm"].get(match_num, {"red": {}, "blue": {}})
                    per_match_data["qm"][match_num][alliance][team] = {
                        "score_breakdown": {},
                        "ai_prediction": pred,
                    }
        print(f"  ✓ Cycle {i}/{len(results)} complete → match {match_num} predicted")

        predicted_count += 1
        print(f"  ✓ Cycle {i}/{len(results)} complete → match {match_num} predicted")

    print("\n--- Random Forest Summary ---")
    if not results:
        print("No matches were eligible for Random Forest prediction (no training history).")
    else:
        skipped_matches = total_matches - predicted_count
        print(f"Predicted {predicted_count} matches successfully.")
        print(f"Skipped {skipped_matches} matches (due to insufficient prior data).")

    print("Random Forest predictions complete.\n")
    return per_match_data


# ================== Step 8: Scoring Habits ==================
def step8_habits(submitted_rows):
    """
    Derive habits from all matches using auto+teleop branchPlacement.
    - position_preference: most commonly used reef nodes (A–L)
    - accuracy_by_level: share of total placements at each level (L2–L4)
    """

    habits = {}

    for r in submitted_rows:
        team = str(r["team"])
        data = r["data"]
        auto_branches = data.get("auto", {}).get("branchPlacement", {})
        tele_branches = data.get("teleop", {}).get("branchPlacement", {})

        # Merge both phases
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
        ranked_positions = sorted(
            stats["position_counts"].items(), key=lambda x: x[1], reverse=True
        )
        total_levels = sum(stats["level_counts"].values()) or 1
        level_ratios = {
            lvl: round(cnt / total_levels, 3)
            for lvl, cnt in stats["level_counts"].items()
        }
        result[team] = {
            "position_preference": ranked_positions,
            "accuracy_by_level": level_ratios  # actually level usage ratio
        }

    # Display concise summary
    print("=== Step 8: Scoring Habits Summary (branch-based) ===\n")
    for team, res in list(result.items())[:15]:
        top_positions = ", ".join(f"{p}({c})" for p, c in res["position_preference"][:3])
        print(f"Team {team}:  top positions → {top_positions}")
        print(f"             level usage → {res['accuracy_by_level']}\n")

    return result




# ================== Step 9: Collect and Search Results ==================
def build_search_index(per_match_data, per_team_data, ai_result, habits):
    """Build searchable summaries combining heuristic, ELO, AI, RF, and Habits data."""
    index = {"teams": {}, "matches": {}}

    # --- Team summary ---
    for team, tdata in per_team_data.items():
        entry = {
            "elo": tdata.get("elo_featured", {}),
            "matches": [f"{mtype} {mnum}" for mtype, mnum in tdata.get("match", [])],
            "ai_cluster": None,
            "ai_features": {},
            "habits": habits.get(team, None),   # <-- NEW
        }

        # --- allow integer keys in ai_result ---
        team_key = team if team in ai_result.get("team_stats", {}) else int(team) if team.isdigit() and int(team) in ai_result.get("team_stats", {}) else None
        if team_key is not None:
            entry["ai_cluster"] = ai_result["team_stats"][team_key].get("cluster")
            entry["ai_features"] = ai_result["team_stats"][team_key]

        index["teams"][team] = entry

    # --- Match summary ---
    for mtype, matches in per_match_data.items():
        for mnum, mdata in matches.items():
            match_key = f"{mtype} {mnum}"
            entry = {"red": {}, "blue": {}}
            for color in ["red", "blue"]:
                for team, tdata in mdata.get(color, {}).items():
                    heur = tdata.get("score_breakdown", {})
                    ai_pred = tdata.get("ai_prediction", {})
                    entry[color][team] = {
                        "heuristic": heur,
                        "ai_prediction": ai_pred,
                        "total_predicted": ai_pred.get("predicted_total")
                        if isinstance(ai_pred, dict)
                        else ai_pred,
                    }
            index["matches"][match_key] = entry

    return index


def search(index):
    """Deep-dump search: per-aspect heuristic, actual, and AI comparison."""
    print("\n================= SEARCH MODE =================")
    print("Type a team number (e.g. 4201) or match key (e.g. qm 12). Type 'exit' to quit.\n")

    def flatten_heuristics(heur):
        """Flatten nested heuristic dicts into aspect:value pairs."""
        flat = {}
        for phase, vals in heur.items():
            if isinstance(vals, dict):
                for k, v in vals.items():
                    if k != "total":
                        flat[f"{phase}_{k}"] = v
        return flat

    def flatten_ai(ai):
        """Flatten AI prediction dicts similarly."""
        if not isinstance(ai, dict):
            return {}
        return {k: v for k, v in ai.items() if isinstance(v, (int, float))}

    # ========== TEAM SEARCH ==========
    while True:
        q = input("Search> ").strip().lower()
        if q in {"exit", "quit"}:
            break

        if q in index["teams"]:
            team = q
            info = index["teams"][team]
            print(f"\n================= TEAM {team} =================")
            print(f"Matches: {', '.join(info['matches']) or '—'}")

            # --- ELO ---
            print("\n--- FEATURED ELO ---")
            if info.get("elo"):
                for k, v in info["elo"].items():
                    print(f"  {k:15s}: {round(v, 3)}")
            else:
                print("  (none)")

            # --- AI Cluster ---
            print("\n--- AI CLUSTER ---")
            if info["ai_cluster"] is not None:
                print(f"  Cluster: {info['ai_cluster']}")
            else:
                print("  (no AI data)")

            # --- HABITS ---
            print("\n--- HABITS ---")
            hab = info.get("habits")
            if hab:
                top_positions = hab["position_preference"][:5]
                print("  Top positions by attempts:")
                for pos, count in top_positions:
                    print(f"    {pos:>3s}: {count}")
                print("\n  Accuracy by level:")
                for lvl, acc in hab["accuracy_by_level"].items():
                    print(f"    {lvl.upper()}: {acc if acc is not None else '—'}")
            else:
                print("  (no habit data)")

            # --- MATCH-BY-MATCH ASPECT DUMP ---
            print("\n--- PER-MATCH ASPECT SUMMARY ---")
            for match_key in info["matches"]:
                if match_key not in index["matches"]:
                    continue
                match_info = index["matches"][match_key]
                color = "red" if team in match_info["red"] else "blue" if team in match_info["blue"] else None
                if not color:
                    continue
                team_data = match_info[color][team]
                heur = flatten_heuristics(team_data.get("heuristic", {}))
                ai = flatten_ai(team_data.get("ai_prediction", {}))
                actual = flatten_heuristics(team_data.get("heuristic", {}))  # placeholder if you later add real actuals

                all_keys = sorted(set(heur) | set(actual) | set(ai))
                print(f"\n[{match_key.upper()}] ({color.upper()} alliance)")
                for k in all_keys:
                    hv = heur.get(k, 0)
                    av = actual.get(k, 0)
                    iv = ai.get(k, 0)
                    print(f"  {k:20s}  heuristic={hv:<5}  actual={av:<5}  ai_pred={iv:<5}")

                    # Show predicted total score summary
                    if "predicted_total" in ai:
                        print(f"    → Predicted total score: {round(ai['predicted_total'], 2)}")

            print("\n=====================================================\n")



        # ========== MATCH SEARCH ==========
        elif q in index["matches"]:
            m = q
            info = index["matches"][m]
            print(f"\n================= MATCH {m.upper()} =================")
            for color in ["red", "blue"]:
                print(f"\n{color.upper()} alliance:")
                for team, s in info[color].items():
                    heur = flatten_heuristics(s.get("heuristic", {}))
                    ai = flatten_ai(s.get("ai_prediction", {}))
                    actual = flatten_heuristics(s.get("heuristic", {}))  # replace if real scores available

                    all_keys = sorted(set(heur) | set(actual) | set(ai))
                    print(f"\nTeam {team}:")
                    for k in all_keys:
                        hv = heur.get(k, 0)
                        av = actual.get(k, 0)
                        iv = ai.get(k, 0)
                        print(f"  {k:20s}  heuristic={hv:<5}  actual={av:<5}  ai_pred={iv:<5}")
                print()
            print("=====================================================\n")

        else:
            print("Not found.\n")




# ================== Main ==================
async def main():
    # TODO: change data type to be not per season but per season and be grouped by game features(heat map, placing matrix, etc)
    # TODO: integrate qualitative data with algorithms
    conn = await get_connection()
    try:
        print("STEP 1: Fetching submitted match scouting data...\n")
        submitted_rows = await fetch_submitted(conn)
        submitted_summary = summarize_submitted(submitted_rows)

        print("STEP 2: Fetching scheduled matches...\n")
        all_matches = await fetch_all_matches(conn)
        print(f"Retrieved {len(all_matches)} matches from schedule.\n")

        print("STEP 3: Checking for unscouted matches...\n")
        find_unscouted(all_matches, submitted_summary)
        # TODO: add toggle for cleaning strictness

        print("STEP 4: Heuristic scoring predictions...\n")
        await step4_predict_scores(submitted_rows)

        print("STEP 8: Analyzing team habits (branch placement)...\n")
        habits = step8_habits(submitted_rows)
        # TODO: which cage they climbed at, where ground pickup(heatmap), where coral ground intake

        print("STEP 4.5: Filtering incomplete matches...\n")
        submitted_rows = filter_incomplete_matches(submitted_rows)
        # TODO: make visual report on what is filtered out in messed up date

        print("STEP 5: Computing featured ELOs...\n")
        per_team_data, per_match_data = await step5_featured_elo(submitted_rows)
        # TODO: calculate with different sets of feature combinations and uses
        # TODO: add qualitative features in elo

        print("STEP 6: Computing AI groupings...\n")
        ai_result = await step6_ai_ratings(per_match_data)
        # TODO: use variace/stdev to see how good the clustering is
        # TODO: pass variance on performance as a param

        print("STEP 7: Predicting match outcomes with Random Forest...\n")
        per_match_data = await step7_random_forest(per_match_data)
        # TODO: predict alliance selection and produce picklist



        print("STEP 9: Building searchable index...\n")
        index = build_search_index(per_match_data, per_team_data, ai_result, habits)
        search(index)


    finally:
        await conn.close()



if __name__ == "__main__":
    asyncio.run(main())
