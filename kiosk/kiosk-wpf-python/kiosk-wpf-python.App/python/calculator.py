import json
import math
import statistics
from datetime import datetime

import requests
import statbotics
from typing import Annotated, Any, Literal, Optional, Union
from pydantic import BaseModel, Field, ValidationError, field_validator

from logger import *
from context import ctx

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
    red_rp_1: float
    blue_rp_1: float
    red_rp_2: float
    blue_rp_2: float
    red_rp_3: Optional[float] = None
    blue_rp_3: Optional[float] = None
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
    red_rp_1: bool
    blue_rp_1: bool
    red_rp_2: bool
    blue_rp_2: bool
    red_rp_3: Optional[bool] = None
    blue_rp_3: Optional[bool] = None
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

MatchPhase = Literal["prestart", "auto", "between", "teleop", "post"]
SubPhaseName = Literal["auto", "transition", "shift_1", "shift_2", "shift_3", "shift_4", "endgame"]
ClimbLevel = Literal["L1", "L2", "L3"]
ClimbPos = Literal["Center", "Left", "Right", "Left Side", "Right Side"]

_CLIMB_POS_MAP = {
    "No Climb": None,
    "Front Center": "Center",
    "Front Left": "Left",
    "Front Right": "Right",
    "Side Left": "Left Side",
    "Side Right": "Right Side",
}

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


class ClimbAction(BaseModel):
    type: Literal["climb"]
    timestamp: int
    level: ClimbLevel
    success: bool
    phase: MatchPhase
    subPhase: Optional[SubPhaseName]


class TraversalAction(BaseModel):
    type: Literal["traversal", "passing", "idle", "defense"]
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


ScoutingAction = Annotated[
    Union[
        StartingAction,
        ScoreAction,
        ClimbAction,
        TraversalAction,
        IntakeAction,
        ShootingAction,
    ],
    Field(discriminator="type")
]


class ScoutingFaults(BaseModel):
    jam: bool
    other: bool
    brownout: bool
    disabled: bool
    failed_auto: bool
    immobilized: bool
    disconnected: bool
    erratic_driving: bool
    structural_failure: bool


class ScoutingIntakePos(BaseModel):
    neutral: bool
    depot: bool
    outpost: bool
    opponent: bool


class StartPosition(BaseModel):
    x: float
    y: float


class ScoutingPostmatch(BaseModel):
    skill: float
    defenseSkill: float
    speed: float
    role: Literal["Shooter", "Intake", "Defense", "Generalist", "Useless"]
    traversalLocation: Literal["Trench", "Bump", "No Preference"]
    teleopClimbPos: Optional[ClimbPos]
    autoClimbPos: Optional[ClimbPos]
    intakePos: ScoutingIntakePos
    faults: ScoutingFaults
    notes: str

    @field_validator("teleopClimbPos", "autoClimbPos", mode="before")
    @classmethod
    def normalize_climb_pos(cls, v):
        if v in _CLIMB_POS_MAP:
            return _CLIMB_POS_MAP[v]
        return v


class ScoutingEntryData(BaseModel):
    key: str
    status: str
    actions: list[ScoutingAction]
    postmatch: ScoutingPostmatch
    manualTeam: bool
    startPosition: Optional[StartPosition] = None


class MatchScoutingEntry(BaseModel):
    event_key: str
    match: int
    match_type: str
    team: str
    alliance: Literal["red", "blue"]
    scouter: str
    data: ScoutingEntryData


class PitScoutingEntry(BaseModel):
    event_key: str
    team: str
    scouter: str
    data: dict[str, Any]


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


class DownloadedData(BaseModel):
    match_scouting: list[MatchScoutingEntry]
    pit_scouting: list[PitScoutingEntry]
    all_matches: list[ScheduledMatch]


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


class MatchAlliance(BaseModel):
    score: int
    team_keys: list[str]
    surrogate_team_keys: list[str]
    dq_team_keys: list[str]


class MatchAlliances(BaseModel):
    red: MatchAlliance
    blue: MatchAlliance


class MatchVideo(BaseModel):
    type: Literal["youtube", "tba"]
    key: str


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


# ===========================================================================
# All action types that carry a timestamp (used for time-in-state calc)
# ===========================================================================

_TIMED_ACTION_TYPES = (
    ScoreAction, ClimbAction,
    TraversalAction, IntakeAction, ShootingAction,
)

# Canonical state labels used in the time-percentage output
_STATE_LABELS = [
    "traversal", "intake",
    "shooting", "score", "climb",
]


def compute_time_percentages(actions: list[ScoutingAction]) -> dict[str, float]:
    """
    Compute the percentage of match time the robot spent in each state.

    The robot is considered to be "in" the state of an action from its
    timestamp until the next timestamped action begins.  The last action's
    state is held until the end of the action sequence (i.e. we cannot
    attribute any duration to it since there is no following timestamp),
    so its contribution is zero.

    Returns a dict mapping each state label to a percentage (0-100).
    All recognised states are always present in the output.
    """
    # Map legacy action types to traversal for backwards compatibility
    _TYPE_MAP = {"passing": "traversal", "idle": "traversal", "defense": "traversal"}

    # Collect only timestamped actions in order
    timed: list[tuple[int, str]] = []
    for action in actions:
        if isinstance(action, _TIMED_ACTION_TYPES):
            mapped_type = _TYPE_MAP.get(action.type, action.type)
            timed.append((action.timestamp, mapped_type))

    # Sort by timestamp (should already be sorted, but be safe)
    timed.sort(key=lambda t: t[0])

    durations: dict[str, int] = {s: 0 for s in _STATE_LABELS}

    for i in range(len(timed) - 1):
        ts_current, state = timed[i]
        ts_next = timed[i + 1][0]
        dt = ts_next - ts_current
        if dt > 0 and state in durations:
            durations[state] += dt

    total_time = sum(durations.values())

    if total_time <= 0:
        return {s: 0.0 for s in _STATE_LABELS}

    return {
        state: round((dur / total_time) * 100, 2)
        for state, dur in durations.items()
    }


def run_calculation(setting):
    """Execute scouting data calculations."""
    log = Logger()

    calc_result = {}

    log.header("CALCULATION")

    setting = json.loads(setting) if isinstance(setting, str) else setting

    downloaded_data = DownloadedData(**ctx.downloaded_data)

    if not setting.get("event_key"):
        log.error("Event key is required")
        return {"success": False, "error": "Event key required"}

    event_key = setting["event_key"]
    stop_on_warning = setting.get("stop_on_warning", False)

    log.step(f"Running calculations for {Logger.CYAN}{event_key}{Logger.RESET}")
    if stop_on_warning:
        log.substep(f"Stop on warning: {Logger.YELLOW}enabled{Logger.RESET}")

    # -- Statbotics ----------------------------------------------------
    with log.section("Fetching Statbotics data"):
        try:
            sb_data: list[StatboticsMatch] = [StatboticsMatch(**m) for m in _sb.get_matches(event=event_key)]

            if not sb_data:
                log.warn("No Statbotics data returned")
                if stop_on_warning:
                    return {"success": False, "error": "No Statbotics data"}
            else:
                log.stat("Statbotics entries", len(sb_data))
        except UserWarning as e:
            log.error(f"Statbotics error: {e}")
            log.error(f"Statbotics data will not be included in this run.")
            if stop_on_warning:
                return {"success": False, "error": f"Statbotics error: {e}"}
            sb_data: list[StatboticsMatch] = []

    # -- TBA -----------------------------------------------------------
    with log.section("Fetching TBA data"):
        tba_response = requests.get(
            f"https://www.thebluealliance.com/api/v3/event/{event_key}/matches",
            headers={"X-TBA-Auth-Key": ctx.TBA_API_KEY}
        )

        if tba_response.status_code != 200:
            log.error(f"TBA request failed (status {tba_response.status_code})")
            if stop_on_warning:
                return {"success": False, "error": "TBA request failed"}
            tba_data: list[Match] = []
        else:
            try:
                tba_data: list[Match] = [Match(**m) for m in tba_response.json()]
                if not tba_data:
                    log.warn("No TBA matches returned")
                    if stop_on_warning:
                        return {"success": False, "error": "No TBA data"}
                else:
                    log.stat("TBA matches", len(tba_data))
            except ValidationError as e:
                log.error(f"TBA type check failed: {e.error_count()} errors.")
                return {"success": False, "error": "Type check failed"}
            except Exception as e:
                log.error(f"TBA type check failed: {e}")

    # -- Initialize result structure -----------------------------------
    with log.section("Initializing calculation results"):
        calc_result.clear()
        calc_result["ranking"] = {}
        calc_result["alliance"] = {}
        calc_result["sb"] = [m.model_dump() for m in sb_data]
        calc_result["tba"] = [m.model_dump() for m in tba_data]

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

    # -- Tally ranking points from TBA quals matches --------------------
    with log.section("Tallying ranking points from TBA"):
        rp_tally: dict[int, int] = {}

        quals_matches = [m for m in tba_data if m.comp_level == "qm"]
        played_quals = [m for m in quals_matches if m.score_breakdown is not None]

        for match in played_quals:
            for color in ("red", "blue"):
                alliance: MatchAlliance = getattr(match.alliances, color)
                breakdown: AllianceScoreBreakdown2026 = getattr(match.score_breakdown, color)

                for raw_team_key in alliance.team_keys:
                    team_num = parse_team_key(raw_team_key)
                    rp_tally[team_num] = rp_tally.get(team_num, 0) + breakdown.rp

        calc_result["ranking"]["rp"] = rp_tally
        log.stat("Teams with RP data", len(rp_tally))
        log.stat("Quals matches tallied", len(played_quals))

    # -- Process match scouting entries --------------------------------
    with log.section("Processing match scouting entries:"):
        processed_match_entries = {}
        for entry in downloaded_data.match_scouting:
            if entry.event_key != event_key:
                continue
            key = encode_match_entry(
                entry.match_type + str(entry.match),
                int(entry.team)
            )
            processed_match_entries[key] = process_match_entry(entry.data)
        log.substep(processed_match_entries)

    # -- Build per-team fuel output ------------------------------------
    with log.section("Building per-team fuel summary"):
        PHASES = ["auto", "transition", "phase_1", "phase_2", "endgame"]

        # Accumulate per-phase scored fuel lists for 1-var stats
        # { team_str: { phase: [scored_fuel, ...] } }
        phase_fuel_lists: dict[str, dict[str, list[float]]] = {}

        # Accumulate per-state time percentage lists for 1-var stats
        # { team_str: { state: [pct, ...] } }
        state_time_lists: dict[str, dict[str, list[float]]] = {}

        # { team_str: { canon_match_key: { phase: { "fuel": int } } } }
        team_fuel_output: dict[str, dict] = {}

        for encoded_key, processed in processed_match_entries.items():
            match_code, team_num = decode_match_entry(encoded_key)
            # match_code is like "qm1", "sf6", "f1", "f2", "f3"
            # For qm/sf: matches parse_match_key(tba_key) directly.
            # For finals: scouting uses match_number (f1=game1, f2=game2, f3=game3),
            #   but parse_match_key collapses all finals TBA keys to "f1" (one series).
            #   So we match on the TBA match object's match_number field instead.
            team_str = str(team_num)

            is_finals = match_code.startswith("f") and not match_code.startswith("sf")

            canon_match_key = None
            for canon, tba_key in calc_result["match_index"].items():
                if is_finals:
                    # For finals, match_code digit is the game number (match_number in TBA)
                    game_num = int(''.join(c for c in match_code if c.isdigit()))
                    tba_match_obj = next((m for m in tba_data if m.key == tba_key), None)
                    if tba_match_obj and tba_match_obj.comp_level == "f" and tba_match_obj.match_number == game_num:
                        canon_match_key = canon
                        break
                else:
                    if parse_match_key(tba_key) == match_code:
                        canon_match_key = canon
                        break

            if not canon_match_key:
                log.warn(f"Could not resolve canon key for match code '{match_code}' (team {team_num})")
                continue

            fuel_data = processed.get("fuel", {})
            time_pcts = processed.get("time_percentages", {})

            team_fuel_output.setdefault(team_str, {})
            # Per-match fuel breakdown by phase + time percentages
            team_fuel_output[team_str][canon_match_key] = {
                phase: {"fuel": fuel_data.get(phase, {}).get("scored", 0)}
                for phase in PHASES
            }
            team_fuel_output[team_str][canon_match_key]["time_percentages"] = time_pcts

            # Accumulate phase fuel values for 1-var stats
            phase_fuel_lists.setdefault(team_str, {ph: [] for ph in PHASES})
            for phase in PHASES:
                scored = fuel_data.get(phase, {}).get("scored", 0)
                phase_fuel_lists[team_str][phase].append(float(scored))

            # Accumulate time percentage values for 1-var stats
            state_time_lists.setdefault(team_str, {s: [] for s in _STATE_LABELS})
            for state in _STATE_LABELS:
                state_time_lists[team_str][state].append(float(time_pcts.get(state, 0.0)))

        # Attach aggregated per-phase 1-var stats under the "phase" key for each team
        for team_str in team_fuel_output:
            team_fuel_output[team_str]["phase"] = {
                phase: {
                    "fuel": one_var_stats(phase_fuel_lists.get(team_str, {}).get(phase, []))
                }
                for phase in PHASES
            }

            # Attach aggregated time-percentage 1-var stats
            team_fuel_output[team_str]["time_percentages"] = {
                state: one_var_stats(state_time_lists.get(team_str, {}).get(state, []))
                for state in _STATE_LABELS
            }

        calc_result["team_fuel"] = team_fuel_output
        log.stat("Teams with fuel data", len(team_fuel_output))

    # -- Print per-team match fuel summary -----------------------------
    with log.section("Per-team match fuel summary"):
        def _match_sort_key(k):
            if k.startswith("qm"):
                level = 0
            elif k.startswith("sf"):
                level = 1
            else:
                level = 2
            num = int(''.join(c for c in k if c.isdigit()) or "0")
            return level, num

        for team_str, team_data in sorted(team_fuel_output.items(), key=lambda x: int(x[0])):
            match_keys = sorted(
                [k for k in team_data if k not in ("phase", "time_percentages")],
                key=_match_sort_key,
            )
            log.step(f"Team {Logger.CYAN}{team_str}{Logger.RESET}  ({len(match_keys)} matches)")
            for match_key in match_keys:
                phase_parts = []
                for phase in PHASES:
                    fuel_val = team_data[match_key][phase]["fuel"]
                    color = Logger.GREEN if fuel_val > 0 else Logger.RESET
                    phase_parts.append(f"{phase}={color}{fuel_val}{Logger.RESET}")
                log.substep(f"{match_key:>6}  |  " + "  ".join(phase_parts))

                # Print time-in-state percentages for this match
                tp = team_data[match_key].get("time_percentages", {})
                if any(v > 0 for v in tp.values()):
                    state_parts = []
                    for state in _STATE_LABELS:
                        pct = tp.get(state, 0.0)
                        color = Logger.GREEN if pct >= 10 else Logger.RESET
                        state_parts.append(f"{state}={color}{pct:.1f}%{Logger.RESET}")
                    log.substep(f"{'':>6}  |  time: " + "  ".join(state_parts))

    # -- Extract shot coordinates per team --------------------------------
    with log.section("Extracting shot coordinates per team"):
        team_shots: dict[int, list[dict]] = {}

        for entry in downloaded_data.match_scouting:
            if entry.event_key != event_key:
                continue
            team_num = int(entry.team)
            actions = entry.data.actions

            # Track last known position and pair ShootingAction → ScoreAction
            last_x, last_y = 0.5, 0.5  # default center
            shooting_origin = None

            for action in actions:
                if isinstance(action, StartingAction):
                    last_x, last_y = action.x, action.y
                elif isinstance(action, ShootingAction):
                    shooting_origin = (last_x, last_y)
                elif isinstance(action, ScoreAction):
                    origin = shooting_origin if shooting_origin else (last_x, last_y)
                    team_shots.setdefault(team_num, []).append({
                        "x1": origin[0],
                        "y1": origin[1],
                        "x2": action.x,
                        "y2": action.y,
                        "fuelShot": 1,
                        "fuelScored": action.score,
                    })
                    last_x, last_y = action.x, action.y
                    shooting_origin = None

        # Attach shots and fuel to per-team output
        for team_num in calc_result["team"]:
            calc_result["team"][team_num]["shots"] = team_shots.get(team_num, [])
            team_str = str(team_num)
            if team_str in team_fuel_output:
                calc_result["team"][team_num]["fuel"] = team_fuel_output[team_str]

        log.stat("Teams with shot data", len(team_shots))

    log.done()
    return calc_result


def parse_team_key(team_key: str | int) -> int:
    """Convert a TBA or Statbotics team key into an integer team number."""
    if isinstance(team_key, int):
        return team_key
    if isinstance(team_key, str):
        if team_key.startswith("frc"):
            return int(team_key[3:])
        if team_key.isdigit():
            return int(team_key)
    raise ValueError(f"Unrecognized team key format: {team_key}")


def parse_match_key(match_key: str) -> str:
    # Remove the event prefix (everything up to and including the first underscore)
    suffix = match_key.split("_", 1)[1]  # e.g. "qm35", "sf6m1", "f1m2"

    if suffix.startswith("sf") or suffix.startswith("f"):
        # Strip the per-match index (m1, m2, etc.) from elim matches
        # sf6m1 -> sf6,  f1m2 -> f1
        return suffix.split("m")[0]

    return suffix  # qm35 as-is


def encode_match_entry(code: str, number: int) -> str:
    """Convert ('qm1', 4414) -> 'qm|1|4414'"""
    letters = ''.join(c for c in code if c.isalpha())
    digits = ''.join(c for c in code if c.isdigit())
    return f"{letters}|{digits}|{number}"


def decode_match_entry(s: str) -> tuple[str, int]:
    """Convert 'qm|1|4414' -> ('qm1', 4414)"""
    parts = s.split('|')
    return parts[0] + parts[1], int(parts[2])


def determine_most_recent_match(
    match_scouting: list[MatchScoutingEntry],
    calc_result: dict,
) -> Optional[str]:
    """
    Determine the most recent match based on submissions.
    """
    submission_counts: dict[str, int] = {}

    for entry in match_scouting:
        match_id = f"{entry.match_type}{entry.match}"
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
        return level, num

    qualifying_matches.sort(key=match_sort_key, reverse=True)
    return qualifying_matches[0][0]


def initialize_structure(
    calc_result: dict,
    tba_data: list[Match],
    sb_data: list[StatboticsMatch],
    downloaded_data: DownloadedData,
    event_key: str,
    log: Logger,
    stop_on_warning: bool = False,
) -> bool:
    """
    Initialize empty calculation structures for teams and matches.
    """
    sb_matches: dict[str, StatboticsMatch] = {m.key: m for m in sb_data}

    calc_result["team"] = {}
    calc_result["match"] = {}
    calc_result["match_index"] = {}
    calc_result["match_reverse_index"] = {}

    log.step("Initializing teams and matches from TBA...")

    tba_match_keys = {m.key for m in tba_data}
    grouped: dict[str, list[Match]] = {"qm": [], "sf": [], "f": []}

    for match in tba_data:
        if match.comp_level in grouped:
            grouped[match.comp_level].append(match)

        for color in ("red", "blue"):
            alliance: MatchAlliance = getattr(match.alliances, color)
            for raw_team_key in alliance.team_keys:
                team_num = parse_team_key(raw_team_key)
                calc_result["team"].setdefault(team_num, {})

    for level in ("qm", "sf", "f"):
        matches = sorted(
            grouped[level],
            key=lambda m: (m.set_number, m.match_number)
        )

        for idx, match in enumerate(matches, start=1):
            canon_key = f"{level}{idx}"

            calc_result["match"][canon_key] = {}
            calc_result["match_index"][canon_key] = match.key
            calc_result["match_reverse_index"][match.key] = canon_key

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

    match_scouting = [m for m in downloaded_data.match_scouting if m.event_key == event_key]

    most_recent = determine_most_recent_match(match_scouting, calc_result)
    if most_recent:
        calc_result["most_recent_match"] = most_recent
        log.substep(f"Most recent match identified: {Logger.GREEN}{most_recent}{Logger.RESET}")
    else:
        log.substep(f"No match with >3 submissions found")

    log.success("Structure initialization complete")
    return True


def process_match_entry(data: ScoutingEntryData) -> dict:
    """
    Process a single match scouting entry's data into aggregated stats.
    """
    actions = data.actions

    subphase_to_bucket = {
        "auto": "auto",
        "transition": "transition",
        "shift_1": "phase_1",
        "shift_2": "phase_1",
        "shift_3": "phase_2",
        "shift_4": "phase_2",
        "endgame": "endgame",
    }

    result = {
        "fuel": {
            "total": {"shot": 0, "scored": 0, "accuracy": 0},
            "auto": {"shot": 0, "scored": 0, "accuracy": 0},
            "transition": {"shot": 0, "scored": 0, "accuracy": 0},
            "phase_1": {"shot": 0, "scored": 0, "accuracy": 0},
            "phase_2": {"shot": 0, "scored": 0, "accuracy": 0},
            "endgame": {"shot": 0, "scored": 0, "accuracy": 0},
        },
        "climb": {
            "auto": {"duration": 0, "attempt": False, "success": False},
            "endgame": {"duration": 0, "level": 3, "attempt": False, "success": False},
        },
        "actions": {},
        "metadata": {},
        "time_percentages": compute_time_percentages(actions),
    }

    fuel = result["fuel"]

    for action in actions:
        if isinstance(action, ShootingAction):
            bucket = subphase_to_bucket.get(action.subPhase)
            fuel["total"]["shot"] += 1
            if bucket:
                fuel[bucket]["shot"] += 1

        elif isinstance(action, ScoreAction):
            bucket = subphase_to_bucket.get(action.subPhase)
            fuel["total"]["scored"] += action.score
            if bucket:
                fuel[bucket]["scored"] += action.score

        elif isinstance(action, ClimbAction):
            climb_phase = "auto" if action.phase == "auto" else "endgame"
            result["climb"][climb_phase]["attempt"] = True
            if action.success:
                result["climb"][climb_phase]["success"] = True
            level_map = {"L1": 1, "L2": 2, "L3": 3}
            result["climb"][climb_phase]["level"] = level_map.get(action.level, 3)

    for bucket in fuel:
        shots = fuel[bucket]["shot"]
        fuel[bucket]["accuracy"] = (
            round(fuel[bucket]["scored"] / shots, 3) if shots > 0 else 0
        )

    return result


def one_var_stats(data: list[float]) -> dict:
    """
    Calculate descriptive statistics for a list of numbers.
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

    n = len(data)

    q1 = statistics.quantiles(data, n=4)[0] if n >= 4 else None
    q3 = statistics.quantiles(data, n=4)[2] if n >= 4 else None

    return {
        "n": n,
        "mean": statistics.mean(data),
        "median": statistics.median(data),
        "std_dev": statistics.stdev(data) if n > 1 else 0,
        "min": min(data),
        "max": max(data),
        "q1": q1,
        "q3": q3,
        "iqr": (q3 - q1) if (q1 is not None and q3 is not None) else None,
    }


def prob_sum1_greater_sum2(
    normals1: list[tuple[float, float]],
    normals2: list[tuple[float, float]],
) -> float:
    """
    Probability that the sum of normals1 is greater than the sum of normals2.
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
    return 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))