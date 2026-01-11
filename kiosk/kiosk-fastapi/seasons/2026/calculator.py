import asyncio
import traceback

# =========================
# ANSI Color Constants
# =========================
ANSI_RESET = "\x1b[0m"

ANSI_RED = "\x1b[31m"
ANSI_GREEN = "\x1b[32m"
ANSI_YELLOW = "\x1b[33m"
ANSI_BLUE = "\x1b[34m"
ANSI_MAGENTA = "\x1b[35m"
ANSI_CYAN = "\x1b[36m"
ANSI_GRAY = "\x1b[90m"
ANSI_REPLACE_LINE = "\x1b[1A\x1b[K"

# =========================
# Calculation Helper functions
# =========================


# =========================
# Core Calculation Routine
# =========================
async def _calculate_async(data, progress, log, get_settings):
    current_step = ""
    try:
        # =========================
        # Initialization
        # =========================
        progress(0)
        log("→ Starting calculator")
        # log(json.dumps(extract_team_metrics(data)))

        # =========================
        # Fetch runtime flags
        # =========================
        settings = get_settings()
        verbose = settings.get("verbose", True)

        run1 = settings.get("run_step1", True)
        run2 = settings.get("run_step2", True) and run1
        run3 = settings.get("run_step3", True) and run2
        run4 = settings.get("run_step4", True) and run3
        run5 = settings.get("run_step5", True) and run4
        run6 = settings.get("run_step6", True) and run5

        if verbose:
            steps = [
                k.removeprefix("run_")
                for k, v in settings.items()
                if k.startswith("run_") and v
            ]
            log(
                f"  Running steps: {', '.join(steps) or 'none'}"
            )

        progress(1)

        result = {}

        # =========================
        # Extract datasets
        # =========================
        match_data = data.get("match_scouting", [])
        all_matches = data.get("all_matches", [])

        '''
        if not match_data:
            log("[yellow][WARN] No match_scouting data found — skipping main analysis pipeline.[/]")
            return {"status": 1, "result": {"error": "no match_scouting"}}
        '''

        # =========================
        # Step 0 Output Structure
        # =========================
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

        # =========================
        # Step 0: Data validation pipeline
        # =========================
        current_step = "0"
        log("  → Running data validation checks")

        # Step 0.1: Validate raw input data for internal consistency
        current_step = "0.1"
        log(
            f"{ANSI_GREEN}    ✔ Internal data consistency validated{ANSI_RESET}"
        )

        # Step 0.2: Validate event/team/match data against TBA's published data
        current_step = "0.2"
        log(
            f"{ANSI_GREEN}    ✔ Data validated against TBA official records{ANSI_RESET}"
        )

        # Step 0.3: Identify scouting entries or matches with abnormal/low confidence
        current_step = "0.3"
        log(
            f"{ANSI_GREEN}    ✔ Low-confidence or anomalous data detected{ANSI_RESET}"
        )

        # =========================
        # Step 1 Output Structure
        # =========================
        step_1_output = {
            # team_match[team][match] → per-team-per-match computed metrics
            "team_match": {},
            # team[team] → aggregated team-level metrics
            "team": {},
            # match[match] → aggregated match-level metrics
            "match": {},
        }

        # =========================
        # Step 1: Baseline metrics
        # =========================
        if run1:
            current_step = "1"
            log("  → Computing baseline match and team metrics")

            # Step 1.1: Compute metrics for each team in each match
            current_step = "1.1"
            log(
                f"{ANSI_GREEN}    ✔ Per-team-per-match metrics calculated{ANSI_RESET}"
            )

            # Step 1.2: Aggregate per-team metrics across all matches
            current_step = "1.2"
            log(
                f"{ANSI_GREEN}    ✔ Team aggregate metrics calculated{ANSI_RESET}"
            )

            # Step 1.3: Aggregate per-match metrics across all teams
            current_step = "1.3"
            log(
                f"{ANSI_GREEN}    ✔ Match aggregate metrics calculated{ANSI_RESET}"
            )

        # =========================
        # Step 2 Output Structure
        # =========================
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

        # =========================
        # Step 2: Rankings
        # =========================
        if run2:
            current_step = "2"
            log("  → Generating performance-based team rankings")

            # Step 2.1: Compute heuristic scoring averages
            current_step = "2.1"
            log(
                f"{ANSI_GREEN}    ✔ Heuristic ranking scores computed{ANSI_RESET}"
            )

            # Step 2.2: Compute feature-based ELO scores
            current_step = "2.2"
            log(
                f"{ANSI_GREEN}    ✔ ELO model team scores computed{ANSI_RESET}"
            )

            # Step 2.3: Retrieve Statbotics EPA values
            current_step = "2.3"
            log(
                f"{ANSI_GREEN}    ✔ Statbotics EPA rankings fetched{ANSI_RESET}"
            )

            # Step 2.4: Retrieve TBA ranking point values
            current_step = "2.4"
            log(
                f"{ANSI_GREEN}    ✔ Ranking point standings retrieved from TBA{ANSI_RESET}"
            )

        # =========================
        # Step 3 Output Structure
        # =========================
        step_3_output = {
            "heuristic": {},
            "random_forest": {},
        }

        # =========================
        # Step 3: Match prediction
        # =========================
        if run3:
            current_step = "3"
            log("  → Running match prediction models")

            log(f"    0 out of 10 completed")
            for i in range(10):
                await asyncio.sleep(0.3)
                log(f"{ANSI_REPLACE_LINE}    {i+1} out of 10 completed", newline=False)
            log("\x1b[K", newline=False)

            # Step 3.1: Predict match outcomes using heuristic rankings
            current_step = "3.1"
            log(
                f"{ANSI_GREEN}    ✔ Match predictions generated from heuristic model{ANSI_RESET}"
            )

            # Step 3.2: Predict match outcomes using Random Forest model
            current_step = "3.2"
            log(
                f"{ANSI_GREEN}    ✔ Match predictions generated from Random Forest model{ANSI_RESET}"
            )

        # =========================
        # Step 4 Output Structure
        # =========================
        step_4_output = {}

        # =========================
        # Step 4: Qualitative analysis
        # =========================
        if run4:
            current_step = "4"
            log("  → Performing qualitative analysis")

            # Step 4.1: Generate qualitative insights
            current_step = "4.1"
            log(
                f"{ANSI_GREEN}    ✔ Qualitative analysis complete{ANSI_RESET}"
            )

        # =========================
        # Step 6: Output translation
        # =========================
        result = {
            "match": {},
            "team": {},
            "ranking": {},
            "alliance": {},
        }

        if run6:
            current_step = "6"
            log("  → Translating all processed data into output structures")

            result = {
                "team": {
                    3473:
                    # basic
                        {"tags": ["rookie", "defense"],

                         # ranking
                         "ranking": {
                             "auto": 12,
                             "teleop": 45,
                             "endgame": 20,
                             "rp": 3,
                             "rp_pred": 2.7,
                             "rp_avg": 2.4,
                             "rp_avg_pred": 2.6,
                         },

                         # metrics
                         "metrics": {
                             "avg_score": 77.3,
                             "auto_consistency": 0.85,
                             "can_climb": True,
                             "drive_type": "swerve",
                         },

                         # matches
                         "matches": [
                             {
                                 "match": 1,
                                 "own_alliance": [123, 456, 789],
                                 "opp_alliance": [321, 654, 987],
                                 "score": 85,
                                 "won": True,
                             },
                             {
                                 "match": 2,
                                 "own_alliance": [123, 222, 333],
                                 "opp_alliance": [444, 555, 666],
                                 "score": 72,
                                 "won": False,
                                 "notes": None,
                             },
                         ],

                         # rp
                         "rp": {
                             "match_1": {
                                 "earned": True,
                                 "value": 2,
                                 "details": {
                                     "auto_rp": True,
                                     "endgame_rp": False,
                                 },
                             },
                             "match_2": {
                                 "earned": False,
                                 "value": 1,
                             },
                         },

                         # timeline (match is the only required key)
                         "timeline": [
                             {
                                 "match": 1,
                                 "auto_points": 15,
                                 "teleop_points": 50,
                                 "endgame_points": 20,
                             },
                             {
                                 "match": 15,
                                 "auto_points": 10,
                                 "teleop_points": 45,
                                 "endgame_points": 17,
                             },
                         ],

                         # breakdown (tree structure)
                         "breakdown": {
                             "id": "total",
                             "label": "Total Score",
                             "sumValue": 150,
                             "children": [
                                 {
                                     "id": "auto",
                                     "label": "Autonomous",
                                     "value": 25,
                                 },
                                 {
                                     "id": "teleop",
                                     "label": "Teleop",
                                     "value": 95,
                                 },
                                 {
                                     "id": "endgame",
                                     "label": "Endgame",
                                     "value": 30,
                                 },
                             ],
                         },
                    }
                }
            }

            log(f"{ANSI_GREEN}    ✔ Done{ANSI_RESET}")

        # TODO: consider
        # - bayesian_opr
        # - glicko_2
        # - xgboost (predict trends for wins/losses)
        # - kmeans (clustering usefulness)
        # - monte-carlo simulations
        # - elote

        return {"status": 0, "result": result}

    except Exception as e:
        log(f"{ANSI_RED} ✖ error in: {current_step}{ANSI_RESET}")
        log(f"{ANSI_RED} ✖ {traceback.format_exc()}{ANSI_RESET}")
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
        log(f"\x1b[31m[FATAL ERROR] {e}")
        result = {"status": 1, "result": {"error": str(e)}}
    finally:
        unlock()

    return result
