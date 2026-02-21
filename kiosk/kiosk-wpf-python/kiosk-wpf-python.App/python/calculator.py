import json
import math
import statistics
from datetime import datetime

import requests
import statbotics
from typing import Any, Literal, Optional
from pydantic import BaseModel

from logger import *

_sb = statbotics.Statbotics()


# --- Reusable types ---

TowerLevel = Literal["Level1", "Level2", "Level3", "None"]
CompLevel = Literal["qm", "ef", "qf", "sf", "f"]
WinningAlliance = Literal["red", "blue", ""]

# ===========================================================================
# Statbotics types (season-agnostic)
# ===========================================================================

class StatboticsAllianceData(BaseModel):
    team_keys: list[int]
    surrogate_team_keys: list[int]
    dq_team_keys: list[int]

class StatboticsAlliances(BaseModel):
    red: StatboticsAllianceData
    blue: StatboticsAllianceData

class StatboticsPred(BaseModel):
    winner: Optional[Literal["red", "blue"]]
    red_win_prob: float
    red_score: float
    blue_score: float
    # RP predictions (named generically since they vary by season)
    red_rp_1: float
    blue_rp_1: float
    red_rp_2: float
    blue_rp_2: float
    red_rp_3: Optional[float] = None
    blue_rp_3: Optional[float] = None
    # Allow any extra season-specific prediction fields
    model_config = {"extra": "allow"}

class StatboticsResult(BaseModel):
    winner: Optional[Literal["red", "blue"]]
    red_score: int
    blue_score: int
    red_no_foul: int
    blue_no_foul: int
    red_auto_points: int
    blue_auto_points: int
    red_teleop_points: int
    blue_teleop_points: int
    red_endgame_points: int
    blue_endgame_points: int
    red_tiebreaker_points: int
    blue_tiebreaker_points: int
    # RP results (named generically)
    red_rp_1: bool
    blue_rp_1: bool
    red_rp_2: bool
    blue_rp_2: bool
    red_rp_3: Optional[bool] = None
    blue_rp_3: Optional[bool] = None
    # Allow any extra season-specific result fields
    model_config = {"extra": "allow"}

class StatboticsMatch(BaseModel):
    key: str
    year: int
    event: str
    week: int
    elim: bool
    comp_level: CompLevel
    set_number: int
    match_number: int
    match_name: str
    time: Optional[int]
    predicted_time: Optional[int]
    status: Literal["Completed", "Upcoming", "Ongoing"]
    video: Optional[str]
    alliances: StatboticsAlliances
    pred: Optional[StatboticsPred]
    result: Optional[StatboticsResult]

# ===========================================================================
# Downloaded (local scouting) data types
# ===========================================================================

# --- Match scouting actions ---

MatchPhase = Literal["prestart", "auto", "between", "teleop", "post"]
SubPhaseName = Literal["auto", "transition", "shift_1", "shift_2", "shift_3", "shift_4", "endgame"]
ClimbLevel = Literal["L1", "L2", "L3"]
ClimbPos = Literal["Center", "Left", "Right", "Left Side", "Right Side"]

class StartingAction(BaseModel):
    type: Literal["starting"]
    x: float
    y: float

class ScoreAction(BaseModel):
    type: Literal["score"]
    x: float
    y: float
    score: int
    timestamp: int
    phase: MatchPhase
    subPhase: Optional[SubPhaseName]

class PassAction(BaseModel):
    type: Literal["passing"]
    timestamp: int
    phase: MatchPhase
    subPhase: Optional[SubPhaseName]

class ClimbAction(BaseModel):
    type: Literal["climb"]
    timestamp: int
    level: ClimbLevel
    success: bool
    phase: MatchPhase
    subPhase: Optional[SubPhaseName]

class DefenseAction(BaseModel):
    type: Literal["defense"]
    timestamp: int
    phase: MatchPhase
    subPhase: Optional[SubPhaseName]

class TraversalAction(BaseModel):
    type: Literal["traversal"]
    timestamp: int
    phase: MatchPhase
    subPhase: Optional[SubPhaseName]

class IdleAction(BaseModel):
    type: Literal["idle"]
    timestamp: int
    phase: MatchPhase
    subPhase: Optional[SubPhaseName]

class IntakeAction(BaseModel):
    type: Literal["intake"]
    timestamp: int
    phase: MatchPhase
    subPhase: Optional[SubPhaseName]

class ShootingAction(BaseModel):
    type: Literal["shooting"]
    timestamp: int
    phase: MatchPhase
    subPhase: Optional[SubPhaseName]

from typing import Annotated, Union
from pydantic import Field

ScoutingAction = Annotated[
    Union[
        StartingAction,
        ScoreAction,
        ClimbAction,
        PassAction,
        DefenseAction,
        TraversalAction,
        IdleAction,
        IntakeAction,
        ShootingAction,
    ],
    Field(discriminator="type")
]

# --- Match scouting postmatch ---

class ScoutingFaults(BaseModel):
    disconnected: bool
    nonfunctional: bool
    unbalanced: bool
    jammed: bool
    disabled: bool
    broken: bool
    penalties: bool
    other: bool

class ScoutingIntakePos(BaseModel):
    neutral: bool
    depot: bool
    outpost: bool
    opponent: bool

class ScoutingPostmatch(BaseModel):
    skill: float           # 0-1
    defenseSkill: float    # 0-1
    speed: float
    role: Literal["Shooter", "Intake", "Defense", "Generalist", "Useless"]
    traversalLocation: Literal["Trench", "Bump", "No Preference"]
    teleopClimbPos: Optional[ClimbPos]
    autoClimbPos: Optional[ClimbPos]
    intakePos: ScoutingIntakePos
    faults: Any # ScoutingFaults
    notes: str

# --- Match scouting entry data ---

class ScoutingEntryData(BaseModel):
    key: str
    status: str
    actions: list[ScoutingAction]
    postmatch: ScoutingPostmatch
    manualTeam: bool
    startPosition: Optional[dict[str, float]] = None

# --- Match scouting entry ---

class MatchScoutingEntry(BaseModel):
    event_key: str
    match: int
    match_type: str
    team: str
    alliance: Literal["red", "blue"]
    scouter: str
    data: ScoutingEntryData

# --- Pit scouting entry ---

class PitScoutingEntry(BaseModel):
    event_key: str
    team: str
    scouter: str
    data: dict[str, Any]  # free-form pit scouting fields

# --- Match schedule entry ---

class ScheduledMatch(BaseModel):
    key: str
    event_key: str
    match_type: str
    match_number: int
    set_number: int
    scheduled_time: Optional[datetime]
    actual_time: Optional[datetime]
    red1: int
    red2: int
    red3: int
    blue1: int
    blue2: int
    blue3: int

# --- Top-level downloaded data ---

class DownloadedData(BaseModel):
    match_scouting: list[MatchScoutingEntry]
    pit_scouting: list[PitScoutingEntry]
    all_matches: list[ScheduledMatch]

# --- Score Breakdown ---

class HubScore(BaseModel):
    autoCount: int
    autoPoints: int
    endgameCount: int
    endgamePoints: int
    shift1Count: int
    shift1Points: int
    shift2Count: int
    shift2Points: int
    shift3Count: int
    shift3Points: int
    shift4Count: int
    shift4Points: int
    teleopCount: int
    teleopPoints: int
    totalCount: int
    totalPoints: int
    transitionCount: int
    transitionPoints: int

class AllianceScoreBreakdown2026(BaseModel):
    adjustPoints: int
    autoTowerPoints: int
    autoTowerRobot1: TowerLevel
    autoTowerRobot2: TowerLevel
    autoTowerRobot3: TowerLevel
    endGameTowerPoints: int
    endGameTowerRobot1: TowerLevel
    endGameTowerRobot2: TowerLevel
    endGameTowerRobot3: TowerLevel
    energizedAchieved: bool
    foulPoints: int
    g206Penalty: bool
    hubScore: HubScore
    majorFoulCount: int
    minorFoulCount: int
    rp: int
    superchargedAchieved: bool
    totalAutoPoints: int
    totalPoints: int
    totalTeleopPoints: int
    totalTowerPoints: int
    traversalAchieved: bool

class MatchScoreBreakdown2026(BaseModel):
    blue: AllianceScoreBreakdown2026
    red: AllianceScoreBreakdown2026

# --- Alliance ---

class MatchAlliance(BaseModel):
    score: int
    team_keys: list[str]
    surrogate_team_keys: list[str]
    dq_team_keys: list[str]

class MatchAlliances(BaseModel):
    red: MatchAlliance
    blue: MatchAlliance

# --- Video ---

class MatchVideo(BaseModel):
    type: Literal["youtube", "tba"]
    key: str

# --- Full Match ---

class Match(BaseModel):
    key: str
    comp_level: CompLevel
    set_number: int
    match_number: int
    alliances: MatchAlliances
    winning_alliance: WinningAlliance
    event_key: str
    time: Optional[int]
    actual_time: Optional[int]
    predicted_time: Optional[int]
    post_result_time: Optional[int]
    score_breakdown: Optional[MatchScoreBreakdown2026]
    videos: list[MatchVideo]


def run_calculation(setting, downloaded_data: DownloadedData, tba_key: str):
    """Execute scouting data calculations."""
    log = Logger()

    calc_result = {}

    log.header("CALCULATION")

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
            sb_data: list[StatboticsMatch] = [StatboticsMatch(**m) for m in _sb.get_matches(event=event_key)]
            sb_count = len(sb_data) if isinstance(sb_data, (list, dict)) else 0

            if sb_count == 0:
                log.warn("No Statbotics data returned")
                if stop_on_warning:
                    return {"success": False, "error": "No Statbotics data"}
            else:
                log.stat("Statbotics entries", sb_count)
        except UserWarning as e:
            log.error(f"Statbotics error: {e}")
            if stop_on_warning:
                return {"success": False, "error": f"Statbotics error: {e}"}
            sb_data: list[StatboticsMatch] = []

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
            tba_data: list[Match] = []
        else:
            tba_data: list[Match] = [Match(**m) for m in tba_response.json()]
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

    with log.section("Processing match scouting entries:"):
        processed_match_entries = {}
        for entry in downloaded_data["match_scouting"]:
            log.substep(entry)
            processed_match_entries[(entry["match_type"] + str(entry["match"]), int(entry["team"]))] = {
                "fuel": {
                    "total": 0,
                    "auto": 0,
                    "transition": 0,
                    "phase_1": 0,
                    "phase_2": 0,
                    "endgame": 0,
                },
                "climb": {
                    "auto": {
                        "duration": 0,
                        "attempt": False,
                        "success": False,
                    },
                    "endgame": {
                        "duration": 0,
                        "level": 3,
                        "attempt": False,
                        "success": False,
                    }
                },
                "actions": {

                },
                "metadata": {
                    "auto_win_rate": 0

                }
            }
        log.substep(processed_match_entries)

    log.done()
    return processed_match_entries



def validate_downloaded_data(event_key, log, downloaded_data, stop_on_warning=False):
    """
    Validate that downloaded_data contains necessary information.

    Args:
        event_key: Event key to validate data for
        log: Logger instance for output
        downloaded_data: downloaded ddata
        stop_on_warning: Whether to fail on warnings

    Returns:
        bool: True if validation passed=
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


def parse_match_key(match_key):
    # Remove the event prefix (everything up to and including the first underscore)
    suffix = match_key.split("_", 1)[1]  # e.g. "qm35", "sf6m1", "f2"

    # Qualification match: qm35 -> qm35 (no change needed)
    # Semifinal: sf6m1 -> sf6
    # Final: f2 -> f2

    if suffix.startswith("sf"):
        # Strip the match number (m1, m2, etc.) from semifinals
        return suffix.split("m")[0]  # sf6m1 -> sf6

    return suffix  # qm35, f2 as-is


def encode_match_entry(code: str, number: int) -> str:
    """Convert ('qm1', 4414) -> 'qm|1|4414'"""
    # Split letters and digits in the code part
    letters = ''.join(c for c in code if c.isalpha())
    digits = ''.join(c for c in code if c.isdigit())
    return f"{letters}|{digits}|{number}"

def decode_match_entry(s: str) -> tuple[str, int]:
    """Convert 'qm|1|4414' -> ('qm1', 4414)"""
    parts = s.split('|')
    return parts[0] + parts[1], int(parts[2])


def determine_most_recent_match(match_scouting, calc_result):
    """
    Determine the most recent match based on submissions.

    Args:
        match_scouting: List of match scouting entries
        calc_result: Calculation result dictionary

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