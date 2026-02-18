import json
import math
import random
import statistics
import string

import requests
import statbotics

from logger import *

_sb = statbotics.Statbotics()


def run_calculation(setting, downloaded_data, tba_key):
    """Execute scouting data calculations."""
    log = Logger()

    calc_result = {}

    log.header("CALCULATION")

    try:
        setting = json.loads(setting) if isinstance(setting, str) else setting

        if not setting.get("event_key"):
            log.error("Event key is required")
            return {"success": False, "error": "Event key required"}

        event_key = setting["event_key"]
        stop_on_warning = setting.get("stop_on_warning", False)

        log.step(f"Running calculations for {Logger.CYAN}{event_key}{Logger.RESET}")
        if stop_on_warning:
            log.substep(f"Stop on warning: {Logger.YELLOW}enabled{Logger.RESET}")

        # -- Validate local data -------------------------------------------
        with log.section("Validating downloaded data"):
            if not validate_downloaded_data(event_key, log, downloaded_data, stop_on_warning):
                log.error("Data validation failed")
                return {"success": False, "error": "Data validation failed"}
            log.success("Data validated")

        # -- Statbotics ----------------------------------------------------
        with log.section("Fetching Statbotics data"):
            try:
                sb_data = _sb.get_matches(event=event_key)
                sb_count = len(sb_data) if isinstance(sb_data, (list, dict)) else 0

                if sb_count == 0:
                    log.warn("No Statbotics data returned")
                    if stop_on_warning:
                        return {"success": False, "error": "No Statbotics data"}
                else:
                    log.stat("Statbotics entries", sb_count)
            except UserWarning as e:
                log.warn(f"Statbotics error: {e}")
                if stop_on_warning:
                    return {"success": False, "error": f"Statbotics error: {e}"}
                sb_data = {}

        # -- TBA -----------------------------------------------------------
        with log.section("Fetching TBA data"):
            tba_response = requests.get(
                f"https://www.thebluealliance.com/api/v3/event/{event_key}/matches",
                headers={"X-TBA-Auth-Key": tba_key}
            )

            if tba_response.status_code != 200:
                log.error(f"TBA request failed (status {tba_response.status_code})")
                if stop_on_warning:
                    return {"success": False, "error": "TBA request failed"}
                tba_data = []
            else:
                tba_data = tba_response.json()
                if not tba_data:
                    log.warn("No TBA matches returned")
                    if stop_on_warning:
                        return {"success": False, "error": "No TBA data"}
                else:
                    log.stat("TBA matches", len(tba_data))

        # -- Initialize result structure -----------------------------------
        with log.section("Initializing calculation results"):
            calc_result.clear()
            calc_result["ranking"] = {}
            calc_result["alliance"] = {}
            calc_result["sb"] = sb_data
            calc_result["tba"] = tba_data

            if not initialize_structure(
                    calc_result=calc_result,
                    tba_data=tba_data,
                    sb_data=sb_data,
                    downloaded_data=downloaded_data,
                    event_key=event_key,
                    log=log,
                    stop_on_warning=stop_on_warning
            ):
                log.error("Structure initialization failed")
                return {"success": False, "error": "Structure initialization failed"}

        log.warn("No calculations yet")
        log.done()
        return calc_result

    except Exception as e:
        log.error(str(e))
        return calc_result


def validate_downloaded_data(event_key, log, downloaded_data, stop_on_warning=False):
    """
    Validate that downloaded_data contains necessary information.

    Args:
        event_key: Event key to validate data for
        log: Logger instance for output
        stop_on_warning: Whether to fail on warnings

    Returns:
        bool: True if validation passed
    """

    if not downloaded_data:
        log.error("No data downloaded -- run download_data() first")
        return False

    required_keys = ["match_scouting", "pit_scouting", "all_matches"]
    missing_keys = [k for k in required_keys if k not in downloaded_data]

    if missing_keys:
        log.error(f"Missing data keys: {', '.join(missing_keys)}")
        return False

    match_scouting = [
        m for m in downloaded_data["match_scouting"]
        if m.get("event_key") == event_key
    ]
    pit_scouting = [
        p for p in downloaded_data["pit_scouting"]
        if p.get("event_key") == event_key
    ]
    all_matches = [
        m for m in downloaded_data["all_matches"]
        if m.get("event_key") == event_key
    ]

    log.stat("Match scouting entries", len(match_scouting))
    log.stat("Pit scouting entries", len(pit_scouting))
    log.stat("Match schedules", len(all_matches))

    if len(match_scouting) == 0:
        log.warn("No match scouting data for this event")
        if stop_on_warning:
            return False

    if len(all_matches) == 0:
        log.warn("No match schedules for this event")
        if stop_on_warning:
            return False

    return True


def parse_team_key(team_key):
    """Convert a TBA or Statbotics team key into an integer team number."""
    if isinstance(team_key, int):
        return team_key
    if isinstance(team_key, str):
        if team_key.startswith("frc"):
            return int(team_key[3:])
        if team_key.isdigit():
            return int(team_key)
    raise ValueError(f"Unrecognized team key format: {team_key}")


def determine_most_recent_match(match_scouting, calc_result):
    """
    Determine the most recent match based on submissions.

    Args:
        match_scouting: List of match scouting entries
        calc_result: Calculation result dictionary
        log: Logger instance for output

    Returns:
        str: Most recent match key, or None
    """
    submission_counts = {}

    for entry in match_scouting:
        match_type = entry.get("match_type", "")
        match_num = entry.get("match", 0)
        match_id = f"{match_type}{match_num}"
        submission_counts[match_id] = submission_counts.get(match_id, 0) + 1

    qualifying_matches = []

    for match_id, count in submission_counts.items():
        if count > 3:
            tba_key = None
            for tba_k, canon_k in calc_result.get("match_reverse_index", {}).items():
                if tba_k.endswith(f"_{match_id}"):
                    tba_key = tba_k
                    break

            if tba_key:
                canon_key = calc_result["match_reverse_index"][tba_key]
                qualifying_matches.append((canon_key, count))

    if not qualifying_matches:
        return None

    def match_sort_key(item):
        canon_key = item[0]
        if canon_key.startswith("f"):
            level = 2
        elif canon_key.startswith("sf"):
            level = 1
        else:
            level = 0
        num = int(''.join(filter(str.isdigit, canon_key)))
        return (level, num)

    qualifying_matches.sort(key=match_sort_key, reverse=True)
    return qualifying_matches[0][0]


def initialize_structure(calc_result, tba_data, sb_data, downloaded_data, event_key, log, stop_on_warning=False):
    """
    Initialize empty calculation structures for teams and matches.

    Args:
        calc_result: Dictionary to populate with structure
        tba_data: TBA match data
        sb_data: Statbotics data
        downloaded_data: Downloaded scouting data
        event_key: Event key being processed
        log: Logger instance for output
        stop_on_warning: Whether to fail on warnings

    Returns:
        bool: True if initialization succeeded
    """
    sb_matches = {}
    if isinstance(sb_data, dict):
        sb_matches = sb_data
    elif isinstance(sb_data, list):
        for m in sb_data:
            if "key" in m:
                sb_matches[m["key"]] = m

    calc_result["team"] = {}
    calc_result["match"] = {}
    calc_result["match_index"] = {}
    calc_result["match_reverse_index"] = {}

    log.step("Initializing teams and matches from TBA...")

    tba_match_keys = {m["key"] for m in tba_data if "key" in m}
    grouped = {"qm": [], "sf": [], "f": []}

    for match in tba_data:
        level = match.get("comp_level")
        if level in grouped:
            grouped[level].append(match)

        alliances = match.get("alliances", {})
        for color in ("red", "blue"):
            for raw_team_key in alliances.get(color, {}).get("team_keys", []):
                team_num = parse_team_key(raw_team_key)
                calc_result["team"].setdefault(team_num, {})

    for level in ("qm", "sf", "f"):
        matches = sorted(
            grouped[level],
            key=lambda m: (m.get("set_number", 0), m.get("match_number", 0))
        )

        for idx, match in enumerate(matches, start=1):
            canon_key = f"{level}{idx}"
            tba_key = match["key"]

            calc_result["match"][canon_key] = {}
            calc_result["match_index"][canon_key] = tba_key
            calc_result["match_reverse_index"][tba_key] = canon_key

    log.stat("Matches initialized", len(calc_result["match"]))
    log.stat("Teams initialized", len(calc_result["team"]))

    sb_match_keys = set(sb_matches.keys())
    missing_in_sb = tba_match_keys - sb_match_keys
    extra_in_sb = sb_match_keys - tba_match_keys

    if missing_in_sb:
        log.warn(f"{len(missing_in_sb)} TBA matches missing in Statbotics")
        if stop_on_warning:
            return False

    if extra_in_sb:
        log.warn(f"{len(extra_in_sb)} Statbotics matches not in TBA")
        if stop_on_warning:
            return False

    log.step("Validating against downloaded data...")

    match_scouting = [
        m for m in downloaded_data.get("match_scouting", [])
        if m.get("event_key") == event_key
    ]

    most_recent = determine_most_recent_match(match_scouting, calc_result)
    if most_recent:
        calc_result["most_recent_match"] = most_recent
        log.substep(f"Most recent match identified: {Logger.GREEN}{most_recent}{Logger.RESET}")
    else:
        log.substep(f"No match with >3 submissions found")

    log.success("Structure initialization complete")
    return True


def one_var_stats(data):
    """
    Calculate descriptive statistics for a list of numbers.
    Returns Minitab-style summary statistics.

    Args:
        data: List of numeric values

    Returns:
        dict: Statistical summary including mean, median, std dev, min, max, etc.
    """
    if not data:
        return {
            "n": 0,
            "mean": None,
            "median": None,
            "std_dev": None,
            "min": None,
            "max": None,
            "q1": None,
            "q3": None,
            "iqr": None
        }

    sorted_data = sorted(data)
    n = len(data)

    return {
        "n": n,
        "mean": statistics.mean(data),
        "median": statistics.median(data),
        "std_dev": statistics.stdev(data) if n > 1 else 0,
        "min": min(data),
        "max": max(data),
        "q1": statistics.quantiles(data, n=4)[0] if n >= 4 else None,
        "q3": statistics.quantiles(data, n=4)[2] if n >= 4 else None,
        # Could add: mode, range, variance, skewness, etc.
    }


def prob_sum1_greater_sum2(normals1, normals2):
    """
    Probability that the sum of normals1 is greater than the sum of normals2.

    normals1, normals2: lists of (mean, std_dev) tuples
    Assumes all variables are independent.
    """

    if not normals1 or not normals2:
        raise ValueError("Input lists must not be empty")

    mu1 = 0.0
    var1 = 0.0
    for m, s in normals1:
        if s < 0:
            raise ValueError("Standard deviation must be non-negative")
        mu1 += m
        var1 += s * s

    mu2 = 0.0
    var2 = 0.0
    for m, s in normals2:
        if s < 0:
            raise ValueError("Standard deviation must be non-negative")
        mu2 += m
        var2 += s * s

    total_variance = var1 + var2
    if total_variance <= 0:
        raise ValueError("Resulting variance must be positive")

    z = (mu1 - mu2) / math.sqrt(total_variance)

    # Standard normal CDF via error function
    return 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))


