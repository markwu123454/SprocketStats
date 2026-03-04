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
        calc_result["ranking"] = {
            "auton avg pts": {},
            "teleop avg pts": {},
            "climb avg(auton+teleop) pts": {},
        }
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

    # -- Extract official tower levels from TBA ------------------------
    with log.section("Extracting official tower levels from TBA"):
        # { team_num: { canon_match_key: { "autonclimb": str, "teleopclimb": str } } }
        team_official_climbs: dict[int, dict[str, dict[str, str]]] = {}

        for match in tba_data:
            if not match.score_breakdown:
                continue

            canon_match_key = calc_result["match_reverse_index"].get(match.key)
            if not canon_match_key:
                continue

            for color in ("red", "blue"):
                breakdown: AllianceScoreBreakdown2026 = getattr(match.score_breakdown, color)
                alliance: MatchAlliance = getattr(match.alliances, color)

                # TBA score breakdowns for 2026
                # Robot1, Robot2, Robot3 correspond to the order in alliance.team_keys
                teams = [parse_team_key(k) for k in alliance.team_keys]

                auto_climbs = [
                    breakdown.autoTowerRobot1,
                    breakdown.autoTowerRobot2,
                    breakdown.autoTowerRobot3
                ]
                tele_climbs = [
                    breakdown.endGameTowerRobot1,
                    breakdown.endGameTowerRobot2,
                    breakdown.endGameTowerRobot3
                ]

                for i, team_num in enumerate(teams):
                    if i >= len(auto_climbs):
                        break

                    team_official_climbs.setdefault(team_num, {})
                    team_official_climbs[team_num][canon_match_key] = {
                        "autonclimb": auto_climbs[i],
                        "teleopclimb": tele_climbs[i]
                    }

        log.stat("Teams with official climb data", len(team_official_climbs))

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
        log.stat("Processed entries", len(processed_match_entries))

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

    # -- Compute per-team ranking averages -----------------------------
    with log.section("Computing per-team ranking averages"):
        team_auton_pts: dict[str, list[float]] = {}
        team_teleop_pts: dict[str, list[float]] = {}
        team_climb_pts: dict[str, list[float]] = {}

        for encoded_key, processed in processed_match_entries.items():
            _, team_num = decode_match_entry(encoded_key)
            team_str = str(team_num)

            fuel = processed.get("fuel", {})
            climb = processed.get("climb", {})

            auton_pts = float(fuel.get("auto", {}).get("scored", 0))

            teleop_pts = float(
                fuel.get("transition", {}).get("scored", 0)
                + fuel.get("phase_1", {}).get("scored", 0)
                + fuel.get("phase_2", {}).get("scored", 0)
                + fuel.get("endgame", {}).get("scored", 0)
            )

            climb_pts = 0.0
            if climb.get("auto", {}).get("success"):
                climb_pts += 10
            if climb.get("endgame", {}).get("success"):
                level = climb["endgame"].get("level", 3)
                climb_pts += {1: 10, 2: 20, 3: 30}.get(level, 0)

            team_auton_pts.setdefault(team_str, []).append(auton_pts)
            team_teleop_pts.setdefault(team_str, []).append(teleop_pts)
            team_climb_pts.setdefault(team_str, []).append(climb_pts)

        for team_str in team_auton_pts:
            vals = team_auton_pts[team_str]
            calc_result["ranking"]["auton avg pts"][team_str] = sum(vals) / len(vals)
        for team_str in team_teleop_pts:
            vals = team_teleop_pts[team_str]
            calc_result["ranking"]["teleop avg pts"][team_str] = sum(vals) / len(vals)
        for team_str in team_climb_pts:
            vals = team_climb_pts[team_str]
            calc_result["ranking"]["climb avg(auton+teleop) pts"][team_str] = sum(vals) / len(vals)

        log.stat("Teams with ranking data", len(team_auton_pts))

    # -- Build per-team qualitative metrics --------------------------------
    with log.section("Building per-team qualitative metrics"):
        for team_num in calc_result["team"]:
            team_entries = [
                e for e in downloaded_data.match_scouting
                if e.event_key == event_key and int(e.team) == team_num
            ]
            n = len(team_entries)
            if n == 0:
                calc_result["team"][team_num]["metrics"] = {}
                continue

            # --- Climb stats ---
            auto_climb_attempts = sum(1 for e in team_entries if e.data.postmatch.autoClimbPos is not None)
            teleop_climb_attempts = sum(1 for e in team_entries if e.data.postmatch.teleopClimbPos is not None)

            climb_actions_all = [
                a for e in team_entries for a in e.data.actions if isinstance(a, ClimbAction)
            ]
            endgame_climbs = [a for a in climb_actions_all if a.phase != "auto"]
            auto_climbs = [a for a in climb_actions_all if a.phase == "auto"]

            endgame_climb_successes = sum(1 for a in endgame_climbs if a.success)
            auto_climb_successes = sum(1 for a in auto_climbs if a.success)

            # Most common endgame climb level among successes
            endgame_levels = [a.level for a in endgame_climbs if a.success]
            most_common_climb_level = max(set(endgame_levels), key=endgame_levels.count) if endgame_levels else "None"

            # --- Faults ---
            fault_fields = [
                "jam", "other", "brownout", "disabled", "failed_auto",
                "immobilized", "disconnected", "erratic_driving", "structural_failure",
            ]
            fault_counts = {f: 0 for f in fault_fields}
            total_fault_flags = 0
            for e in team_entries:
                faults = e.data.postmatch.faults
                for f in fault_fields:
                    if getattr(faults, f):
                        fault_counts[f] += 1
                        total_fault_flags += 1

            top_faults = sorted(
                [(f, c) for f, c in fault_counts.items() if c > 0],
                key=lambda x: x[1], reverse=True,
            )
            top_fault_str = ", ".join(f"{f} ({c})" for f, c in top_faults[:3]) if top_faults else "None"

            # --- Intake positions ---
            intake_counts = {"neutral": 0, "depot": 0, "outpost": 0, "opponent": 0}
            for e in team_entries:
                ip = e.data.postmatch.intakePos
                for pos in intake_counts:
                    if getattr(ip, pos):
                        intake_counts[pos] += 1

            primary_intake = max(intake_counts, key=intake_counts.get) if any(intake_counts.values()) else "None"

            # --- Role distribution ---
            role_counts: dict[str, int] = {}
            for e in team_entries:
                r = e.data.postmatch.role
                role_counts[r] = role_counts.get(r, 0) + 1
            primary_role = max(role_counts, key=role_counts.get) if role_counts else "Unknown"

            # --- Skill averages ---
            avg_skill = round(statistics.mean([e.data.postmatch.skill for e in team_entries]), 2)
            avg_defense_skill = round(statistics.mean([e.data.postmatch.defenseSkill for e in team_entries]), 2)
            avg_speed = round(statistics.mean([e.data.postmatch.speed for e in team_entries]), 2)

            # --- Traversal preference ---
            trav_counts: dict[str, int] = {}
            for e in team_entries:
                t = e.data.postmatch.traversalLocation
                trav_counts[t] = trav_counts.get(t, 0) + 1
            primary_traversal = max(trav_counts, key=trav_counts.get) if trav_counts else "Unknown"

            # --- Assemble metrics dict ---
            calc_result["team"][team_num]["metrics"] = {
                "Matches Scouted": n,
                "Primary Role": primary_role,
                "Avg Skill": avg_skill,
                "Avg Defense Skill": avg_defense_skill,
                "Avg Speed": avg_speed,
                "Traversal Pref": primary_traversal,
                "Primary Intake": primary_intake,
                "Intake Neutral": f"{intake_counts['neutral']}/{n}",
                "Intake Depot": f"{intake_counts['depot']}/{n}",
                "Intake Outpost": f"{intake_counts['outpost']}/{n}",
                "Intake Opponent": f"{intake_counts['opponent']}/{n}",
                "Endgame Climb Rate": f"{endgame_climb_successes}/{len(endgame_climbs)}" if endgame_climbs else "No attempts",
                "Auto Climb Rate": f"{auto_climb_successes}/{len(auto_climbs)}" if auto_climbs else "No attempts",
                "Common Climb Level": most_common_climb_level,
                "Teleop Climb Pos": f"{teleop_climb_attempts}/{n}",
                "Auto Climb Pos": f"{auto_climb_attempts}/{n}",
                "Fault Rate": round(total_fault_flags / n, 2),
                "Top Faults": top_fault_str,
            }

        log.stat("Teams with metrics", sum(1 for t in calc_result["team"] if calc_result["team"][t].get("metrics")))

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

        # Attach shots, fuel, and official climbs to per-team output
        for team_num in calc_result["team"]:
            calc_result["team"][team_num]["shots"] = team_shots.get(team_num, [])
            team_str = str(team_num)

            # Ensure 'fuel' (match-by-match data) is populated
            if team_str in team_fuel_output:
                calc_result["team"][team_num]["fuel"] = team_fuel_output[team_str]
            else:
                calc_result["team"][team_num]["fuel"] = {}

            # Add official climb data to match records
            if team_num in team_official_climbs:
                for match_key, climbs in team_official_climbs[team_num].items():
                    # Skip aggregated summary keys
                    if match_key in ("phase", "time_percentages"):
                        continue
                    # Initialize match dictionary if scouting data was missing
                    calc_result["team"][team_num]["fuel"].setdefault(match_key, {})
                    # Add tower level climb status
                    calc_result["team"][team_num]["fuel"][match_key].update(climbs)

        log.stat("Teams with shot data", len(team_shots))

    # -- Print ranking summary -----------------------------------------
    with log.section("Per-team ranking averages"):
        ranking = calc_result["ranking"]
        all_teams = sorted(ranking["auton avg pts"].keys(), key=lambda t: int(t))
        for team_str in all_teams:
            auton = ranking["auton avg pts"].get(team_str, 0)
            teleop = ranking["teleop avg pts"].get(team_str, 0)
            climb = ranking["climb avg(auton+teleop) pts"].get(team_str, 0)
            log.substep(
                f"Team {Logger.CYAN}{team_str}{Logger.RESET}  |  "
                f"auton={Logger.GREEN}{auton:.1f}{Logger.RESET}  "
                f"teleop={Logger.GREEN}{teleop:.1f}{Logger.RESET}  "
                f"climb={Logger.GREEN}{climb:.1f}{Logger.RESET}"
            )

    # -- Build comprehensive rankings --------------------------------------
    with log.section("Building team rankings"):
        TOWER_POINTS = {"L1": 10, "L2": 20, "L3": 30}
        AUTO_TOWER_POINTS = {"L1": 15}
        # Shift durations in seconds for BPS calculations
        # Auto=20s, Transition=10s, Shift1-4=25s each, Endgame=30s
        ACTIVE_WINDOW_SECONDS = 25.0 * 2  # two 25s shifts when hub is active
        TOTAL_TELEOP_SECONDS = 140.0  # 2:20

        # Gather per-team lists for all ranking dimensions
        # We'll accumulate across all scouted matches then compute stats

        # Data accumulators keyed by team_num (int)
        team_total_fuel: dict[int, list[float]] = {}
        team_auto_fuel: dict[int, list[float]] = {}
        team_teleop_fuel: dict[int, list[float]] = {}      # phase_1 + phase_2 + transition + endgame
        team_active_fuel: dict[int, list[float]] = {}       # fuel during active hub windows only
        team_endgame_fuel: dict[int, list[float]] = {}
        team_transition_fuel: dict[int, list[float]] = {}
        team_accuracy: dict[int, list[float]] = {}
        team_climb_points: dict[int, list[float]] = {}      # tower points per match
        team_auto_climb_success: dict[int, list[float]] = {}  # 1/0 per match
        team_endgame_climb_success: dict[int, list[float]] = {}  # 1/0 per match
        team_endgame_climb_level: dict[int, list[int]] = {}  # level achieved when successful
        team_total_points_est: dict[int, list[float]] = {}   # estimated total contribution

        for encoded_key, processed in processed_match_entries.items():
            match_code, team_num = decode_match_entry(encoded_key)

            fuel = processed.get("fuel", {})
            climb = processed.get("climb", {})

            total_scored = float(fuel.get("total", {}).get("scored", 0))
            auto_scored = float(fuel.get("auto", {}).get("scored", 0))
            transition_scored = float(fuel.get("transition", {}).get("scored", 0))
            phase_1_scored = float(fuel.get("phase_1", {}).get("scored", 0))
            phase_2_scored = float(fuel.get("phase_2", {}).get("scored", 0))
            endgame_scored = float(fuel.get("endgame", {}).get("scored", 0))
            teleop_scored = transition_scored + phase_1_scored + phase_2_scored + endgame_scored

            # Per-shift scored for active window calculation
            s1 = float(fuel.get("shift_1", {}).get("scored", 0))
            s2 = float(fuel.get("shift_2", {}).get("scored", 0))
            s3 = float(fuel.get("shift_3", {}).get("scored", 0))
            s4 = float(fuel.get("shift_4", {}).get("scored", 0))
            # Active fuel = max of (s1+s3) or (s2+s4) since one pair is always your active window
            # We take the max because we don't know which shifts were active for this team's alliance,
            # but the higher pair is almost certainly the active one
            active_fuel = float(max(s1 + s3, s2 + s4))

            total_shots = float(fuel.get("total", {}).get("shot", 0))
            match_accuracy = (total_scored / total_shots) if total_shots > 0 else 0.0

            # Climb points
            auto_climb_pts = 0.0
            auto_climb_ok = 0.0
            if climb.get("auto", {}).get("attempt"):
                if climb["auto"].get("success"):
                    auto_climb_pts = 15.0  # auto L1 is always 15
                    auto_climb_ok = 1.0

            endgame_climb_pts = 0.0
            endgame_climb_ok = 0.0
            endgame_level = 0
            if climb.get("endgame", {}).get("attempt"):
                if climb["endgame"].get("success"):
                    endgame_climb_ok = 1.0
                    lvl = climb["endgame"].get("level", 1)
                    endgame_level = lvl
                    endgame_climb_pts = float(TOWER_POINTS.get(f"L{lvl}", 10))

            total_climb_pts = auto_climb_pts + endgame_climb_pts

            # Estimated total point contribution (fuel + tower)
            est_points = total_scored + total_climb_pts

            # Accumulate
            team_total_fuel.setdefault(team_num, []).append(total_scored)
            team_auto_fuel.setdefault(team_num, []).append(auto_scored)
            team_teleop_fuel.setdefault(team_num, []).append(teleop_scored)
            team_active_fuel.setdefault(team_num, []).append(active_fuel)
            team_endgame_fuel.setdefault(team_num, []).append(endgame_scored)
            team_transition_fuel.setdefault(team_num, []).append(transition_scored)
            team_accuracy.setdefault(team_num, []).append(match_accuracy)
            team_climb_points.setdefault(team_num, []).append(total_climb_pts)
            team_auto_climb_success.setdefault(team_num, []).append(auto_climb_ok)
            team_endgame_climb_success.setdefault(team_num, []).append(endgame_climb_ok)
            if endgame_level > 0:
                team_endgame_climb_level.setdefault(team_num, []).append(endgame_level)
            team_total_points_est.setdefault(team_num, []).append(est_points)

        # --- Compute per-team ranking values ---
        ranking = calc_result["ranking"]

        # Helper: safe mean
        def _mean(lst):
            return round(statistics.mean(lst), 2) if lst else None

        def _median(lst):
            return round(statistics.median(lst), 2) if lst else None

        def _stdev(lst):
            return round(statistics.stdev(lst), 2) if lst and len(lst) > 1 else 0.0

        def _rate(lst):
            """Fraction of 1.0 values in a 0/1 list, as percentage."""
            return round((sum(lst) / len(lst)) * 100, 1) if lst else None

        # Per-team stat dicts (team_num -> value)
        ranking["total_fuel_avg"] = {}
        ranking["total_fuel_median"] = {}
        ranking["total_fuel_stdev"] = {}
        ranking["auto_fuel_avg"] = {}
        ranking["teleop_fuel_avg"] = {}
        ranking["active_fuel_avg"] = {}
        ranking["endgame_fuel_avg"] = {}
        ranking["transition_fuel_avg"] = {}
        ranking["accuracy_avg"] = {}
        ranking["climb_points_avg"] = {}
        ranking["auto_climb_rate"] = {}
        ranking["endgame_climb_rate"] = {}
        ranking["best_climb_level"] = {}
        ranking["total_points_avg"] = {}
        ranking["total_points_stdev"] = {}
        ranking["bps"] = {}  # balls per second during active windows

        # RP-derived rankings from TBA
        ranking["rp_avg"] = {}
        ranking["energized_rate"] = {}
        ranking["supercharged_rate"] = {}
        ranking["traversal_rate"] = {}

        # Qualitative from scouting postmatch
        ranking["skill_avg"] = {}
        ranking["defense_skill_avg"] = {}
        ranking["speed_avg"] = {}
        ranking["fault_rate"] = {}

        # Populate from scouting accumulators
        all_scouted_teams = set(team_total_fuel.keys())
        for tn in all_scouted_teams:
            ranking["total_fuel_avg"][tn] = _mean(team_total_fuel.get(tn, []))
            ranking["total_fuel_median"][tn] = _median(team_total_fuel.get(tn, []))
            ranking["total_fuel_stdev"][tn] = _stdev(team_total_fuel.get(tn, []))
            ranking["auto_fuel_avg"][tn] = _mean(team_auto_fuel.get(tn, []))
            ranking["teleop_fuel_avg"][tn] = _mean(team_teleop_fuel.get(tn, []))
            ranking["active_fuel_avg"][tn] = _mean(team_active_fuel.get(tn, []))
            ranking["endgame_fuel_avg"][tn] = _mean(team_endgame_fuel.get(tn, []))
            ranking["transition_fuel_avg"][tn] = _mean(team_transition_fuel.get(tn, []))
            ranking["accuracy_avg"][tn] = _mean(team_accuracy.get(tn, []))
            ranking["climb_points_avg"][tn] = _mean(team_climb_points.get(tn, []))
            ranking["auto_climb_rate"][tn] = _rate(team_auto_climb_success.get(tn, []))
            ranking["endgame_climb_rate"][tn] = _rate(team_endgame_climb_success.get(tn, []))
            ranking["total_points_avg"][tn] = _mean(team_total_points_est.get(tn, []))
            ranking["total_points_stdev"][tn] = _stdev(team_total_points_est.get(tn, []))

            # Best climb level: most common successful endgame level
            levels = team_endgame_climb_level.get(tn, [])
            if levels:
                ranking["best_climb_level"][tn] = max(set(levels), key=levels.count)
            else:
                ranking["best_climb_level"][tn] = 0

            # BPS: average fuel scored in active windows / active window duration
            active_avg = _mean(team_active_fuel.get(tn, []))
            if active_avg is not None and ACTIVE_WINDOW_SECONDS > 0:
                ranking["bps"][tn] = round(active_avg / ACTIVE_WINDOW_SECONDS, 3)
            else:
                ranking["bps"][tn] = None

        # --- RP-based rankings from TBA data ---
        # Track per-team: matches played, RP earned, and per-RP-type achievement
        team_matches_played: dict[int, int] = {}
        team_energized: dict[int, int] = {}
        team_supercharged: dict[int, int] = {}
        team_traversal: dict[int, int] = {}

        for match in played_quals:
            for color in ("red", "blue"):
                alliance: MatchAlliance = getattr(match.alliances, color)
                breakdown: AllianceScoreBreakdown2026 = getattr(match.score_breakdown, color)

                for raw_team_key in alliance.team_keys:
                    tn = parse_team_key(raw_team_key)
                    team_matches_played[tn] = team_matches_played.get(tn, 0) + 1
                    if breakdown.energizedAchieved:
                        team_energized[tn] = team_energized.get(tn, 0) + 1
                    if breakdown.superchargedAchieved:
                        team_supercharged[tn] = team_supercharged.get(tn, 0) + 1
                    if breakdown.traversalAchieved:
                        team_traversal[tn] = team_traversal.get(tn, 0) + 1

        for tn in team_matches_played:
            mp = team_matches_played[tn]
            rp_total = rp_tally.get(tn, 0)
            ranking["rp_avg"][tn] = round(rp_total / mp, 2) if mp > 0 else None
            ranking["energized_rate"][tn] = round((team_energized.get(tn, 0) / mp) * 100, 1) if mp > 0 else None
            ranking["supercharged_rate"][tn] = round((team_supercharged.get(tn, 0) / mp) * 100, 1) if mp > 0 else None
            ranking["traversal_rate"][tn] = round((team_traversal.get(tn, 0) / mp) * 100, 1) if mp > 0 else None

        # --- Qualitative rankings from scouting postmatch ---
        for team_num in calc_result["team"]:
            team_entries = [
                e for e in downloaded_data.match_scouting
                if e.event_key == event_key and int(e.team) == team_num
            ]
            if not team_entries:
                continue

            n = len(team_entries)
            ranking["skill_avg"][team_num] = round(statistics.mean([e.data.postmatch.skill for e in team_entries]), 2)
            ranking["defense_skill_avg"][team_num] = round(statistics.mean([e.data.postmatch.defenseSkill for e in team_entries]), 2)
            ranking["speed_avg"][team_num] = round(statistics.mean([e.data.postmatch.speed for e in team_entries]), 2)

            fault_fields = [
                "jam", "other", "brownout", "disabled", "failed_auto",
                "immobilized", "disconnected", "erratic_driving", "structural_failure",
            ]
            total_faults = sum(
                sum(1 for f in fault_fields if getattr(e.data.postmatch.faults, f))
                for e in team_entries
            )
            ranking["fault_rate"][team_num] = round(total_faults / n, 2)

        # --- Compute ordinal ranks (1 = best) for key metrics ---
        # Higher is better for these metrics
        _HIGHER_IS_BETTER = [
            "total_fuel_avg", "auto_fuel_avg", "teleop_fuel_avg", "active_fuel_avg",
            "climb_points_avg", "auto_climb_rate", "endgame_climb_rate",
            "total_points_avg", "bps", "accuracy_avg", "skill_avg", "speed_avg",
            "defense_skill_avg",
        ]
        # Lower is better
        _LOWER_IS_BETTER = ["total_fuel_stdev", "total_points_stdev", "fault_rate"]

        ranking["ranks"] = {}
        for metric in _HIGHER_IS_BETTER:
            data = ranking.get(metric, {})
            valid = [(tn, v) for tn, v in data.items() if v is not None]
            valid.sort(key=lambda x: x[1], reverse=True)
            ranking["ranks"].setdefault(metric, {})
            for rank_idx, (tn, _) in enumerate(valid, start=1):
                ranking["ranks"][metric][tn] = rank_idx

        for metric in _LOWER_IS_BETTER:
            data = ranking.get(metric, {})
            valid = [(tn, v) for tn, v in data.items() if v is not None]
            valid.sort(key=lambda x: x[1], reverse=False)
            ranking["ranks"].setdefault(metric, {})
            for rank_idx, (tn, _) in enumerate(valid, start=1):
                ranking["ranks"][metric][tn] = rank_idx

        # --- Composite positional ranks for header display ---
        # auto rank = rank by auto_fuel_avg
        # teleop rank = rank by teleop_fuel_avg
        # endgame rank = rank by climb_points_avg
        ranking["auto"] = ranking["ranks"].get("auto_fuel_avg", {})
        ranking["teleop"] = ranking["ranks"].get("teleop_fuel_avg", {})
        ranking["endgame"] = ranking["ranks"].get("climb_points_avg", {})

        # RP rank = rank by total RP (already have rp_tally, sort descending)
        rp_sorted = sorted(rp_tally.items(), key=lambda x: x[1], reverse=True)
        ranking["rp_rank"] = {}
        for rank_idx, (tn, _) in enumerate(rp_sorted, start=1):
            ranking["rp_rank"][tn] = rank_idx

        # Predicted RP rank from Statbotics
        # Sum predicted RP across all qual matches for each team
        sb_rp_pred: dict[int, float] = {}
        sb_quals = [m for m in sb_data if m.comp_level == "qm" and m.pred is not None]
        for m in sb_quals:
            for color in ("red", "blue"):
                alliance_data: StatboticsAllianceData = getattr(m.alliances, color)
                pred: StatboticsPred = m.pred
                # rp from win probability: pred.red_win_prob or (1 - red_win_prob)
                win_prob = pred.red_win_prob if color == "red" else (1 - pred.red_win_prob)
                # Expected RP from win/tie: ~3 * win_prob (ignoring tie for simplicity)
                expected_win_rp = 3.0 * win_prob
                rp1 = pred.red_rp_1 if color == "red" else pred.blue_rp_1
                rp2 = pred.red_rp_2 if color == "red" else pred.blue_rp_2
                rp3 = (pred.red_rp_3 if color == "red" else pred.blue_rp_3) or 0.0
                expected_bonus_rp = rp1 + rp2 + rp3
                expected_total = expected_win_rp + expected_bonus_rp

                for team_key in alliance_data.team_keys:
                    tn = parse_team_key(team_key)
                    sb_rp_pred[tn] = sb_rp_pred.get(tn, 0.0) + expected_total

        ranking["rp_pred"] = {}
        rp_pred_sorted = sorted(sb_rp_pred.items(), key=lambda x: x[1], reverse=True)
        for rank_idx, (tn, val) in enumerate(rp_pred_sorted, start=1):
            ranking["rp_pred"][tn] = rank_idx

        ranking["rp_avg_pred"] = {
            tn: round(val / max(team_matches_played.get(tn, 1), 1), 2)
            for tn, val in sb_rp_pred.items()
        }

        log.stat("Teams ranked", len(all_scouted_teams | set(team_matches_played.keys())))
        log.stat("Ranking dimensions", len([k for k in ranking if k not in ("ranks",)]))

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

    # Also track individual shifts for active/inactive window analysis
    subphase_to_shift = {
        "shift_1": "shift_1",
        "shift_2": "shift_2",
        "shift_3": "shift_3",
        "shift_4": "shift_4",
    }

    result = {
        "fuel": {
            "total": {"shot": 0, "scored": 0, "accuracy": 0},
            "auto": {"shot": 0, "scored": 0, "accuracy": 0},
            "transition": {"shot": 0, "scored": 0, "accuracy": 0},
            "phase_1": {"shot": 0, "scored": 0, "accuracy": 0},
            "phase_2": {"shot": 0, "scored": 0, "accuracy": 0},
            "endgame": {"shot": 0, "scored": 0, "accuracy": 0},
            "shift_1": {"shot": 0, "scored": 0, "accuracy": 0},
            "shift_2": {"shot": 0, "scored": 0, "accuracy": 0},
            "shift_3": {"shot": 0, "scored": 0, "accuracy": 0},
            "shift_4": {"shot": 0, "scored": 0, "accuracy": 0},
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
            shift = subphase_to_shift.get(action.subPhase)
            fuel["total"]["shot"] += 1
            if bucket:
                fuel[bucket]["shot"] += 1
            if shift:
                fuel[shift]["shot"] += 1

        elif isinstance(action, ScoreAction):
            bucket = subphase_to_bucket.get(action.subPhase)
            shift = subphase_to_shift.get(action.subPhase)
            fuel["total"]["scored"] += action.score
            if bucket:
                fuel[bucket]["scored"] += action.score
            if shift:
                fuel[shift]["scored"] += action.score

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