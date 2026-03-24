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
WinningAlliance = Literal["red", "blue", "tie", ""]


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
    winner: Optional[WinningAlliance]
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
    winner: Optional[WinningAlliance]
    red_score: int
    blue_score: int
    red_no_foul: Optional[int] = None
    blue_no_foul: Optional[int] = None
    red_auto_points: Optional[int] = None
    blue_auto_points: Optional[int] = None
    red_teleop_points: Optional[int] = None
    blue_teleop_points: Optional[int] = None
    red_endgame_points: Optional[int] = None
    blue_endgame_points: Optional[int] = None
    red_tiebreaker_points: Optional[int] = None
    blue_tiebreaker_points: Optional[int] = None
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
    success: bool = True
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
    role: Optional[Literal["Shooter", "Support", "Defense", "Generalist", "Useless"]]
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
    scouter_name: Optional[str] = None


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
        return {}

    return {
        state: pct
        for state, dur in durations.items()
        if (pct := round((dur / total_time) * 100, 2)) > 0
    }


def transform_event_data(raw: dict) -> dict:
    """
    Transform the raw calc_result into the final DataSchema shape.

    This replaces the frontend TypeScript ``transformEventData`` function so
    the backend emits the finished structure directly.

    Output shape (DataSchema)::

        {
            "ranking": { ... },          # passthrough
            "team": {                     # Record<team_num, TeamData>
                <team_num>: {
                    "basic":     { "tags": [] },
                    "ranking":   { auto, teleop, endgame, rp, rp_pred, rp_avg, rp_avg_pred },
                    "metrics":   { fallback averages merged with backend-computed metrics },
                    "matches":   [ { match, own_alliance, opp_alliance, result, score, ... } ],
                    "rp":        { <match_key>: { energized, supercharged, win } },
                    "timeline":  [ { match, auto, teleop, endgame } ],
                    "breakdown": { id, label, children: [ {auto}, {teleop}, {endgame} ] },
                    "shots":     [ ... ],
                    "fuel":      { ... },
                },
                ...
            },
            "match":               { ... },   # passthrough
            "Alliance":            { ... },   # from raw["alliance"]
            "sb":                  [ ... ],   # passthrough
            "tba":                 [ ... ],   # passthrough
            "match_reverse_index": { ... },   # passthrough
        }
    """

    sb: list[dict] = raw.get("sb", [])
    tba: list[dict] = raw.get("tba", [])
    team_raw: dict[str, dict] = raw.get("team", {})
    ranking_raw: dict[str, dict] = raw.get("ranking", {})
    team_fuel_raw: dict[str, dict] = raw.get("team_fuel", {})
    match_reverse_index: dict[str, str] = raw.get("match_reverse_index", {})

    # --- Collect all team numbers from Statbotics matches ---
    all_teams: set[int] = set()
    for m in sb:
        alliances = m.get("alliances") or {}
        for color in ("red", "blue"):
            team_keys = (alliances.get(color) or {}).get("team_keys", [])
            for t in team_keys:
                all_teams.add(t)

    # --- Completed matches (have a result) ---
    completed_matches = [
        m for m in sb
        if m.get("status") == "Completed" and m.get("result")
    ]

    def _short_key(m: dict) -> str:
        return match_reverse_index.get(m.get("key", ""), "") or m.get("match_name", "") or m.get("key", "")

    # --- Build per-team data ---
    team_data: dict[int, dict] = {}
    for team_num in all_teams:
        # Filter & sort matches for this team
        team_matches = []
        for m in completed_matches:
            alliances = m.get("alliances") or {}
            red_keys = (alliances.get("red") or {}).get("team_keys", [])
            blue_keys = (alliances.get("blue") or {}).get("team_keys", [])
            if team_num in red_keys or team_num in blue_keys:
                team_matches.append(m)
        team_matches.sort(key=lambda m: m.get("time") or 0)

        # --- matches array (TeamMatchRow[]) ---
        matches: list[dict] = []
        for m in team_matches:
            alliances = m.get("alliances") or {}
            red_keys = (alliances.get("red") or {}).get("team_keys", [])
            blue_keys = (alliances.get("blue") or {}).get("team_keys", [])
            is_red = team_num in red_keys
            own = "red" if is_red else "blue"
            opp = "blue" if is_red else "red"
            r = m.get("result", {})

            own_score = r.get(f"{own}_score", 0)
            opp_score = r.get(f"{opp}_score", 0)

            if r.get("winner") == own:
                result_str = "W"
            elif own_score == opp_score:
                result_str = "T"
            else:
                result_str = "L"

            matches.append({
                "match": _short_key(m),
                "own_alliance": (alliances.get(own) or {}).get("team_keys", []),
                "opp_alliance": (alliances.get(opp) or {}).get("team_keys", []),
                "result": result_str,
                "score": own_score,
                "opp_score": opp_score,
                "auto": r.get(f"{own}_auto_points", 0),
                "teleop": r.get(f"{own}_teleop_points", 0),
                "endgame": r.get(f"{own}_endgame_points", 0),
            })

        # --- Qual-only matches for fallback metrics ---
        qual_matches = [m for m in matches if str(m["match"]).startswith("qm")]
        n = len(qual_matches) or 1

        fallback_metrics: dict[str, object] = {
            "Avg Score": round(sum(m["score"] for m in qual_matches) / n, 1),
            "Avg Auto": round(sum(m["auto"] for m in qual_matches) / n, 1),
            "Avg Teleop": round(sum(m["teleop"] for m in qual_matches) / n, 1),
            "Avg Endgame": round(sum(m["endgame"] for m in qual_matches) / n, 1),
            "Win Rate": f"{round(sum(1 for m in qual_matches if m['result'] == 'W') / n * 100)}%",
            "Qual Matches": len(qual_matches),
        }
        fallback_metrics = {k: v for k, v in fallback_metrics.items() if v != 0 and v != "0%"}

        # Merge: fallback first, backend overwrites/extends
        # team_raw keys may be int (from run_calculation) or str (from JSON)
        team_entry = team_raw.get(team_num) or team_raw.get(str(team_num)) or {}
        backend_metrics = team_entry.get("metrics", {})
        metrics = {**fallback_metrics, **backend_metrics}

        # --- Per-match RP data ---
        rp: dict[str, dict] = {}
        for m in team_matches:
            alliances = m.get("alliances") or {}
            red_keys = (alliances.get("red") or {}).get("team_keys", [])
            is_red = team_num in red_keys
            own = "red" if is_red else "blue"
            r = m.get("result", {})
            rp[_short_key(m)] = {
                "energized": r.get(f"{own}_energized_rp", r.get(f"{own}_rp_1", False)),
                "supercharged": r.get(f"{own}_supercharged_rp", r.get(f"{own}_rp_2", False)),
                "win": r.get("winner") == own,
            }

        # --- Scoring timeline ---
        timeline = [
            {
                "match": m["match"],
                "auto": m["auto"],
                "teleop": m["teleop"],
                "endgame": m["endgame"],
            }
            for m in matches
        ]

        # --- Score breakdown tree ---
        breakdown_children = [
            {"id": "auto", "label": "Auto", "value": float(fallback_metrics.get("Avg Auto", 0))},
            {"id": "teleop", "label": "Teleop", "value": float(fallback_metrics.get("Avg Teleop", 0))},
            {"id": "endgame", "label": "Endgame", "value": float(fallback_metrics.get("Avg Endgame", 0))},
        ]
        breakdown = {
            "id": "total",
            "label": "Total Score",
            "children": [c for c in breakdown_children if c["value"] > 0],
        }

        # --- Ranking (use backend values, fall back to 0) ---
        def _rank_val(section: str) -> object:
            d = ranking_raw.get(section) or {}
            return d.get(team_num, d.get(str(team_num), 0))

        ranking_entry = {
            "auto": _rank_val("auto"),
            "teleop": _rank_val("teleop"),
            "endgame": _rank_val("endgame"),
            "rp": _rank_val("rp_rank"),
            "rp_pred": _rank_val("rp_pred"),
            "rp_avg": _rank_val("rp_avg"),
            "rp_avg_pred": _rank_val("rp_avg_pred"),
        }

        team_data[team_num] = {
            "basic": {"tags": []},
            "ranking": ranking_entry,
            "metrics": metrics,
            "matches": matches,
            "rp": rp,
            "timeline": timeline,
            "breakdown": breakdown,
            "shots": team_entry.get("shots", []),
            "fuel": team_fuel_raw.get(str(team_num)) or team_fuel_raw.get(team_num) or team_entry.get("fuel"),
        }

    return {
        "ranking": ranking_raw,
        "team": team_data,
        "match": raw.get("match", {}),
        "Alliance": raw.get("alliance", {}),
        "sb": sb,
        "tba": tba,
        "match_reverse_index": match_reverse_index,
        "next_match": raw.get("next_match"),
    }




# ===========================================================================
# Phase 1: Input Processing
# ===========================================================================
# Take all raw data sources and crunch them into per-team stat profiles.
# No output formatting, no rankings — just the numbers.
# ===========================================================================

TOWER_POINTS = {"L1": 10, "L2": 20, "L3": 30}
AUTO_TOWER_POINTS_MAP = {"L1": 15}
ACTIVE_WINDOW_SECONDS = 25.0 * 2  # two 25s shifts when hub is active
PHASES = ["auto", "transition", "phase_1", "phase_2", "endgame"]
FAULT_FIELDS = [
    "jam", "other", "brownout", "disabled", "failed_auto",
    "immobilized", "disconnected", "erratic_driving", "structural_failure",
]


def phase1_fetch_data(event_key: str, stop_on_warning: bool, log: Logger):
    """Fetch TBA and Statbotics data. Returns (tba_data, sb_data) or error dict."""

    # -- Statbotics --------------------------------------------------------
    with log.section("Fetching Statbotics data"):
        try:
            sb_data: list[StatboticsMatch] = [
                StatboticsMatch(**m) for m in _sb.get_matches(event=event_key)
            ]
            if not sb_data:
                log.warn("No Statbotics data returned")
                if stop_on_warning:
                    return {"success": False, "error": "No Statbotics data"}
            else:
                log.stat("Statbotics entries", len(sb_data))
        except UserWarning as e:
            log.error(f"Statbotics error: {e}")
            log.error("Statbotics data will not be included in this run.")
            if stop_on_warning:
                return {"success": False, "error": f"Statbotics error: {e}"}
            sb_data: list[StatboticsMatch] = []

    # -- TBA ---------------------------------------------------------------
    with log.section("Fetching TBA data"):
        tba_response = requests.get(
            f"https://www.thebluealliance.com/api/v3/event/{event_key}/matches",
            headers={"X-TBA-Auth-Key": ctx.TBA_API_KEY},
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

    return tba_data, sb_data


def phase1_process_scouting(
    event_key: str,
    downloaded_data: DownloadedData,
    log: Logger,
) -> dict[str, dict]:
    """Process raw match scouting entries into per-entry stat dicts."""
    with log.section("Processing match scouting entries"):
        processed = {}
        for entry in downloaded_data.match_scouting:
            if entry.event_key != event_key:
                continue
            key = encode_match_entry(
                entry.match_type + str(entry.match),
                int(entry.team),
            )
            processed[key] = process_match_entry(entry.data)
        log.stat("Processed entries", len(processed))
    return processed


def phase1_tally_rp(tba_data: list[Match], log: Logger):
    """Tally ranking points and per-RP-type rates from played quals.

    Returns (rp_tally, team_matches_played, team_energized,
             team_supercharged, team_traversal, played_quals).
    """
    with log.section("Tallying ranking points from TBA"):
        rp_tally: dict[int, int] = {}
        team_matches_played: dict[int, int] = {}
        team_energized: dict[int, int] = {}
        team_supercharged: dict[int, int] = {}
        team_traversal: dict[int, int] = {}

        quals_matches = [m for m in tba_data if m.comp_level == "qm"]
        played_quals = [m for m in quals_matches if m.score_breakdown is not None]

        for match in played_quals:
            for color in ("red", "blue"):
                alliance: MatchAlliance = getattr(match.alliances, color)
                breakdown: AllianceScoreBreakdown2026 = getattr(match.score_breakdown, color)

                for raw_team_key in alliance.team_keys:
                    tn = parse_team_key(raw_team_key)
                    rp_tally[tn] = rp_tally.get(tn, 0) + breakdown.rp
                    team_matches_played[tn] = team_matches_played.get(tn, 0) + 1
                    if breakdown.energizedAchieved:
                        team_energized[tn] = team_energized.get(tn, 0) + 1
                    if breakdown.superchargedAchieved:
                        team_supercharged[tn] = team_supercharged.get(tn, 0) + 1
                    if breakdown.traversalAchieved:
                        team_traversal[tn] = team_traversal.get(tn, 0) + 1

        log.stat("Teams with RP data", len(rp_tally))
        log.stat("Quals matches tallied", len(played_quals))

    return rp_tally, team_matches_played, team_energized, team_supercharged, team_traversal, played_quals


def phase1_accumulate_team_stats(
    processed_match_entries: dict[str, dict],
    calc_result: dict,
    tba_data: list[Match],
    event_key: str,
    downloaded_data: DownloadedData,
    rp_tally: dict[int, int],
    team_matches_played: dict[int, int],
    team_energized: dict[int, int],
    team_supercharged: dict[int, int],
    team_traversal: dict[int, int],
    log: Logger,
) -> dict:
    """Aggregate all per-team statistics from scouting + TBA data.

    Returns a dict with keys: accumulators, profiles, team_fuel_output, rp.
    """
    with log.section("Accumulating per-team statistics"):

        # -- Per-match value accumulators (keyed by team_num int) -----------
        acc_total_fuel: dict[int, list[float]] = {}
        acc_auto_fuel: dict[int, list[float]] = {}
        acc_teleop_fuel: dict[int, list[float]] = {}
        acc_active_fuel: dict[int, list[float]] = {}
        acc_endgame_fuel: dict[int, list[float]] = {}
        acc_transition_fuel: dict[int, list[float]] = {}
        acc_accuracy: dict[int, list[float]] = {}
        acc_climb_points: dict[int, list[float]] = {}
        acc_auto_climb_success: dict[int, list[float]] = {}
        acc_endgame_climb_success: dict[int, list[float]] = {}
        acc_endgame_climb_level: dict[int, list[int]] = {}
        acc_total_points_est: dict[int, list[float]] = {}

        # -- TBA-based auto point accumulator (alliance auto / 3 per team) --
        acc_tba_auto_contrib: dict[int, list[float]] = {}
        played_quals = [m for m in tba_data if m.comp_level == "qm" and m.score_breakdown is not None]
        for match in played_quals:
            for color in ("red", "blue"):
                alliance: MatchAlliance = getattr(match.alliances, color)
                breakdown: AllianceScoreBreakdown2026 = getattr(match.score_breakdown, color)
                auto_per_robot = breakdown.totalAutoPoints / 3.0
                for raw_team_key in alliance.team_keys:
                    tn = parse_team_key(raw_team_key)
                    acc_tba_auto_contrib.setdefault(tn, []).append(auto_per_robot)

        # -- Fuel output (per-match phase breakdown for frontend) -----------
        phase_fuel_lists: dict[str, dict[str, list[float]]] = {}
        state_time_lists: dict[str, dict[str, list[float]]] = {}
        team_fuel_output: dict[str, dict] = {}

        for encoded_key, processed in processed_match_entries.items():
            match_code, team_num = decode_match_entry(encoded_key)
            team_str = str(team_num)

            fuel = processed.get("fuel", {})
            climb = processed.get("climb", {})

            # Numeric extractions
            total_scored = float(fuel.get("total", {}).get("scored", 0))
            auto_scored = float(fuel.get("auto", {}).get("scored", 0))
            transition_scored = float(fuel.get("transition", {}).get("scored", 0))
            phase_1_scored = float(fuel.get("phase_1", {}).get("scored", 0))
            phase_2_scored = float(fuel.get("phase_2", {}).get("scored", 0))
            endgame_scored = float(fuel.get("endgame", {}).get("scored", 0))
            teleop_scored = transition_scored + phase_1_scored + phase_2_scored + endgame_scored

            s1 = float(fuel.get("shift_1", {}).get("scored", 0))
            s2 = float(fuel.get("shift_2", {}).get("scored", 0))
            s3 = float(fuel.get("shift_3", {}).get("scored", 0))
            s4 = float(fuel.get("shift_4", {}).get("scored", 0))
            active_fuel = float(max(s1 + s3, s2 + s4))

            total_shots = float(fuel.get("total", {}).get("shot", 0))
            match_accuracy = (total_scored / total_shots) if total_shots > 0 else 0.0

            # Climb points
            auto_climb_pts = 0.0
            auto_climb_ok = 0.0
            if climb.get("auto", {}).get("attempt") and climb["auto"].get("success"):
                auto_climb_pts = 15.0
                auto_climb_ok = 1.0

            endgame_climb_pts = 0.0
            endgame_climb_ok = 0.0
            endgame_level = 0
            if climb.get("endgame", {}).get("attempt") and climb["endgame"].get("success"):
                endgame_climb_ok = 1.0
                lvl = climb["endgame"].get("level", 1)
                endgame_level = lvl
                endgame_climb_pts = float(TOWER_POINTS.get(f"L{lvl}", 10))

            total_climb_pts = auto_climb_pts + endgame_climb_pts
            est_points = total_scored + total_climb_pts

            # Accumulate into lists
            if total_scored > 0:
                acc_total_fuel.setdefault(team_num, []).append(total_scored)
            if auto_scored > 0:
                acc_auto_fuel.setdefault(team_num, []).append(auto_scored)
            if teleop_scored > 0:
                acc_teleop_fuel.setdefault(team_num, []).append(teleop_scored)
            if active_fuel > 0:
                acc_active_fuel.setdefault(team_num, []).append(active_fuel)
            if endgame_scored > 0:
                acc_endgame_fuel.setdefault(team_num, []).append(endgame_scored)
            if transition_scored > 0:
                acc_transition_fuel.setdefault(team_num, []).append(transition_scored)
            
            if total_shots > 0:
                acc_accuracy.setdefault(team_num, []).append(match_accuracy)
            
            if total_climb_pts > 0:
                acc_climb_points.setdefault(team_num, []).append(total_climb_pts)
            
            acc_auto_climb_success.setdefault(team_num, []).append(auto_climb_ok)
            acc_endgame_climb_success.setdefault(team_num, []).append(endgame_climb_ok)
            if endgame_level > 0:
                acc_endgame_climb_level.setdefault(team_num, []).append(endgame_level)
            
            if est_points > 0:
                acc_total_points_est.setdefault(team_num, []).append(est_points)

            # Fuel output per match (resolve canon key)
            is_finals = match_code.startswith("f") and not match_code.startswith("sf")
            canon_match_key = None
            for canon, tba_key in calc_result["match_index"].items():
                if is_finals:
                    game_num = int("".join(c for c in match_code if c.isdigit()))
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
            team_fuel_output[team_str][canon_match_key] = {
                phase: {"fuel": fuel_data.get(phase, {}).get("scored", 0)}
                for phase in PHASES
            }
            team_fuel_output[team_str][canon_match_key]["time_percentages"] = time_pcts

            phase_fuel_lists.setdefault(team_str, {ph: [] for ph in PHASES})
            for phase in PHASES:
                scored = fuel_data.get(phase, {}).get("scored", 0)
                phase_fuel_lists[team_str][phase].append(float(scored))

            state_time_lists.setdefault(team_str, {s: [] for s in _STATE_LABELS})
            for state in _STATE_LABELS:
                state_time_lists[team_str][state].append(float(time_pcts.get(state, 0.0)))

        # Attach aggregated 1-var stats to fuel output
        for team_str in team_fuel_output:
            team_fuel_output[team_str]["phase"] = {
                phase: {
                    "fuel": one_var_stats(phase_fuel_lists.get(team_str, {}).get(phase, []))
                }
                for phase in PHASES
            }
            team_fuel_output[team_str]["time_percentages"] = {
                state: one_var_stats(state_time_lists.get(team_str, {}).get(state, []))
                for state in _STATE_LABELS
            }

        log.stat("Teams with fuel data", len(team_fuel_output))

    # -- Build per-team profiles (qualitative + quantitative) ---------------
    with log.section("Building per-team profiles"):

        def _mean(lst):
            return round(statistics.mean(lst), 2) if lst else None

        def _stdev(lst):
            return round(statistics.stdev(lst), 2) if lst and len(lst) > 1 else 0.0

        def _rate(lst):
            return round((sum(lst) / len(lst)) * 100, 1) if lst else None

        profiles: dict[int, dict] = {}
        all_team_nums = set(calc_result["team"].keys())

        for tn in all_team_nums:
            fuel_list = acc_total_fuel.get(tn, [])
            auto_fuel_list = acc_auto_fuel.get(tn, [])
            climb_pts_list = acc_climb_points.get(tn, [])
            auto_climb_list = acc_auto_climb_success.get(tn, [])
            endgame_climb_list = acc_endgame_climb_success.get(tn, [])
            endgame_levels = acc_endgame_climb_level.get(tn, [])

            fuel_mean = statistics.mean(fuel_list) if fuel_list else 0.0
            fuel_std = statistics.stdev(fuel_list) if len(fuel_list) > 1 else (fuel_mean * 0.3 if fuel_mean > 0 else 1.0)
            auto_fuel_mean = statistics.mean(auto_fuel_list) if auto_fuel_list else 0.0
            auto_fuel_std = statistics.stdev(auto_fuel_list) if len(auto_fuel_list) > 1 else (auto_fuel_mean * 0.3 if auto_fuel_mean > 0 else 1.0)
            climb_pts_mean = statistics.mean(climb_pts_list) if climb_pts_list else 0.0
            climb_pts_std = statistics.stdev(climb_pts_list) if len(climb_pts_list) > 1 else (climb_pts_mean * 0.3 if climb_pts_mean > 0 else 1.0)

            auto_climb_rate = (sum(auto_climb_list) / len(auto_climb_list)) if auto_climb_list else 0.0
            endgame_climb_rate = (sum(endgame_climb_list) / len(endgame_climb_list)) if endgame_climb_list else 0.0
            best_level = max(set(endgame_levels), key=endgame_levels.count) if endgame_levels else 0

            active_avg = _mean(acc_active_fuel.get(tn, []))
            bps = round(active_avg / ACTIVE_WINDOW_SECONDS, 3) if (active_avg is not None and ACTIVE_WINDOW_SECONDS > 0) else None

            # Qualitative data from scouting postmatch
            team_entries = [
                e for e in downloaded_data.match_scouting
                if e.event_key == event_key and int(e.team) == tn
            ]
            n = len(team_entries)

            teleop_pos_counts: dict[str, int] = {}
            auto_pos_counts: dict[str, int] = {}
            role_counts: dict[str, int] = {}
            trav_counts: dict[str, int] = {}
            skill_vals: list[float] = []
            speed_vals: list[float] = []
            defense_vals: list[float] = []
            fault_counts = {f: 0 for f in FAULT_FIELDS}
            total_fault_flags = 0
            intake_counts = {"neutral": 0, "depot": 0, "outpost": 0, "opponent": 0}
            auto_climb_attempts = 0
            teleop_climb_attempts = 0
            climb_actions_all: list[ClimbAction] = []

            for e in team_entries:
                pm = e.data.postmatch
                if pm.teleopClimbPos:
                    teleop_pos_counts[pm.teleopClimbPos] = teleop_pos_counts.get(pm.teleopClimbPos, 0) + 1
                if pm.autoClimbPos:
                    auto_pos_counts[pm.autoClimbPos] = auto_pos_counts.get(pm.autoClimbPos, 0) + 1
                if pm.autoClimbPos is not None:
                    auto_climb_attempts += 1
                if pm.teleopClimbPos is not None:
                    teleop_climb_attempts += 1
                if pm.role:
                    role_counts[pm.role] = role_counts.get(pm.role, 0) + 1
                trav_counts[pm.traversalLocation] = trav_counts.get(pm.traversalLocation, 0) + 1
                skill_vals.append(pm.skill)
                speed_vals.append(pm.speed)
                defense_vals.append(pm.defenseSkill)
                for f in FAULT_FIELDS:
                    if getattr(pm.faults, f):
                        fault_counts[f] += 1
                        total_fault_flags += 1
                for pos in intake_counts:
                    if getattr(pm.intakePos, pos):
                        intake_counts[pos] += 1
                for a in e.data.actions:
                    if isinstance(a, ClimbAction):
                        climb_actions_all.append(a)

            preferred_climb_pos = max(teleop_pos_counts, key=teleop_pos_counts.get) if teleop_pos_counts else None
            preferred_auto_climb_pos = max(auto_pos_counts, key=auto_pos_counts.get) if auto_pos_counts else None
            primary_role = max(role_counts, key=role_counts.get) if role_counts else "Unknown"
            traversal_pref = max(trav_counts, key=trav_counts.get) if trav_counts else "Unknown"
            primary_intake = max(intake_counts, key=intake_counts.get) if any(intake_counts.values()) else "None"

            endgame_climbs_all = [a for a in climb_actions_all if a.phase != "auto"]
            auto_climbs_all = [a for a in climb_actions_all if a.phase == "auto"]
            endgame_climb_successes = sum(1 for a in endgame_climbs_all if a.success)
            auto_climb_successes = sum(1 for a in auto_climbs_all if a.success)
            endgame_levels_from_actions = [a.level for a in endgame_climbs_all if a.success]
            most_common_climb_level = max(set(endgame_levels_from_actions), key=endgame_levels_from_actions.count) if endgame_levels_from_actions else "None"

            top_faults = sorted(
                [(f, c) for f, c in fault_counts.items() if c > 0],
                key=lambda x: x[1], reverse=True,
            )
            top_fault_str = ", ".join(f"{f} ({c})" for f, c in top_faults[:3]) if top_faults else "None"

            # Shot coordinates
            shots: list[dict] = []
            for entry in team_entries:
                actions = entry.data.actions
                last_x, last_y = 0.5, 0.5
                shooting_origin = None
                for action in actions:
                    if isinstance(action, StartingAction):
                        last_x, last_y = action.x, action.y
                    elif isinstance(action, ShootingAction):
                        shooting_origin = (last_x, last_y)
                    elif isinstance(action, ScoreAction):
                        origin = shooting_origin if shooting_origin else (last_x, last_y)
                        shots.append({
                            "x1": origin[0], "y1": origin[1],
                            "x2": action.x, "y2": action.y,
                            "fuelShot": 1, "fuelScored": action.score,
                        })
                        last_x, last_y = action.x, action.y
                        shooting_origin = None

            # RP rates from TBA
            mp = team_matches_played.get(tn, 0)
            rp_total = rp_tally.get(tn, 0)

            # Qualitative metrics dict (for frontend display)
            if n == 0:
                qual_metrics = {}
            else:
                qual_metrics = {
                    "Matches Scouted": n,
                    "Primary Role": primary_role,
                    "Avg Skill": round(statistics.mean(skill_vals), 2) if skill_vals else 0,
                    "Avg Defense Skill": round(statistics.mean(defense_vals), 2) if defense_vals else 0,
                    "Avg Speed": round(statistics.mean(speed_vals), 2) if speed_vals else 0,
                    "Traversal Pref": traversal_pref,
                    "Primary Intake": primary_intake,
                    "Intake Neutral": f"{intake_counts['neutral']}/{n}",
                    "Intake Depot": f"{intake_counts['depot']}/{n}",
                    "Intake Outpost": f"{intake_counts['outpost']}/{n}",
                    "Intake Opponent": f"{intake_counts['opponent']}/{n}",
                    "Endgame Climb Rate": f"{endgame_climb_successes}/{len(endgame_climbs_all)}" if endgame_climbs_all else "No attempts",
                    "Auto Climb Rate": f"{auto_climb_successes}/{len(auto_climbs_all)}" if auto_climbs_all else "No attempts",
                    "Common Climb Level": most_common_climb_level,
                    "Teleop Climb Pos": f"{teleop_climb_attempts}/{n}",
                    "Auto Climb Pos": f"{auto_climb_attempts}/{n}",
                    "Fault Rate": round(total_fault_flags / n, 2),
                    "Top Faults": top_fault_str,
                }

            # Assemble profile
            profiles[tn] = {
                # Quantitative stats (for predictions & rankings)
                "fuel_mean": round(fuel_mean, 2),
                "fuel_std": round(fuel_std, 2),
                "auto_fuel_mean": round(auto_fuel_mean, 2),
                "auto_fuel_std": round(auto_fuel_std, 2),
                "climb_pts_mean": round(climb_pts_mean, 2),
                "climb_pts_std": round(climb_pts_std, 2),
                "auto_climb_rate": round(auto_climb_rate * 100, 1),
                "endgame_climb_rate": round(endgame_climb_rate * 100, 1),
                "best_climb_level": best_level,
                "preferred_climb_pos": preferred_climb_pos,
                "preferred_auto_climb_pos": preferred_auto_climb_pos,
                "climb_pos_counts": teleop_pos_counts,

                # Aggregate stats
                "total_fuel_avg": _mean(acc_total_fuel.get(tn, [])),
                "total_fuel_median": round(statistics.median(fuel_list), 2) if fuel_list else None,
                "total_fuel_stdev": _stdev(acc_total_fuel.get(tn, [])),
                "auto_fuel_avg": _mean(acc_auto_fuel.get(tn, [])),
                "teleop_fuel_avg": _mean(acc_teleop_fuel.get(tn, [])),
                "active_fuel_avg": _mean(acc_active_fuel.get(tn, [])),
                "endgame_fuel_avg": _mean(acc_endgame_fuel.get(tn, [])),
                "transition_fuel_avg": _mean(acc_transition_fuel.get(tn, [])),
                "accuracy_avg": _mean(acc_accuracy.get(tn, [])),
                "climb_points_avg": _mean(acc_climb_points.get(tn, [])),
                "auto_climb_rate_pct": _rate(acc_auto_climb_success.get(tn, [])),
                "endgame_climb_rate_pct": _rate(acc_endgame_climb_success.get(tn, [])),
                "total_points_avg": _mean(acc_total_points_est.get(tn, [])),
                "total_points_stdev": _stdev(acc_total_points_est.get(tn, [])),
                "bps": bps,

                # TBA-based auto contribution (alliance auto / 3)
                "tba_auto_contrib_mean": _mean(acc_tba_auto_contrib.get(tn, [])),
                "tba_auto_contrib_stdev": _stdev(acc_tba_auto_contrib.get(tn, [])),

                # RP from TBA
                "rp_total": rp_total,
                "rp_avg": round(rp_total / mp, 2) if mp > 0 else None,
                "energized_rate": round((team_energized.get(tn, 0) / mp) * 100, 1) if mp > 0 else None,
                "supercharged_rate": round((team_supercharged.get(tn, 0) / mp) * 100, 1) if mp > 0 else None,
                "traversal_rate": round((team_traversal.get(tn, 0) / mp) * 100, 1) if mp > 0 else None,
                "matches_played": mp,

                # Qualitative
                "role": primary_role,
                "traversal": traversal_pref,
                "skill": round(statistics.mean(skill_vals), 2) if skill_vals else None,
                "speed": round(statistics.mean(speed_vals), 2) if speed_vals else None,
                "defense_skill": round(statistics.mean(defense_vals), 2) if defense_vals else None,
                "fault_rate": round(total_fault_flags / n, 2) if n > 0 else 0,
                "matches_scouted": n,

                # Frontend display
                "qualitative_metrics": qual_metrics,
                "shots": shots,
            }

        log.stat("Team profiles built", len(profiles))

    # Bundle accumulators for anything that needs raw lists
    accumulators = {
        tn: {
            "total_fuel": acc_total_fuel.get(tn, []),
            "auto_fuel": acc_auto_fuel.get(tn, []),
            "teleop_fuel": acc_teleop_fuel.get(tn, []),
            "active_fuel": acc_active_fuel.get(tn, []),
            "endgame_fuel": acc_endgame_fuel.get(tn, []),
            "transition_fuel": acc_transition_fuel.get(tn, []),
            "accuracy": acc_accuracy.get(tn, []),
            "climb_points": acc_climb_points.get(tn, []),
            "auto_climb_success": acc_auto_climb_success.get(tn, []),
            "endgame_climb_success": acc_endgame_climb_success.get(tn, []),
            "endgame_climb_level": acc_endgame_climb_level.get(tn, []),
            "total_points_est": acc_total_points_est.get(tn, []),
        }
        for tn in all_team_nums
    }

    return {
        "accumulators": accumulators,
        "profiles": profiles,
        "team_fuel_output": team_fuel_output,
        "rp": {
            "rp_tally": rp_tally,
            "team_matches_played": team_matches_played,
            "team_energized": team_energized,
            "team_supercharged": team_supercharged,
            "team_traversal": team_traversal,
        },
    }


# ===========================================================================
# Phase 2: Inference
# ===========================================================================
# Take team stat profiles and produce derived insights: predictions,
# predicted RP, cross-team analysis. Creates new information from Phase 1.
# ===========================================================================


# ===========================================================================
# Phase 2: Inference — Modular Ensemble Prediction System
# ===========================================================================
#
# Architecture:
#   - Each prediction algorithm is a function that receives a MatchContext
#     and returns a ModelOutput dict with only the domains it supports.
#   - Algorithms register themselves in MODEL_REGISTRY with their name,
#     function, and a prior weight (used before empirical scoring kicks in).
#   - The ensemble runner:
#       1. Runs every model on every match
#       2. Scores each model on completed matches per-domain
#       3. Computes empirical weights (or falls back to priors)
#       4. Produces weighted ensemble predictions per domain
#
# Prediction domains:
#   "winner"       -> "red" | "blue"              (binary)
#   "win_prob"     -> float 0-1                    (red win probability)
#   "red_score"    -> float                        (predicted red total)
#   "blue_score"   -> float                        (predicted blue total)
#   "auto_winner"  -> "red" | "blue"               (who wins auto)
#   "auto_win_prob"-> float 0-1                    (red auto win prob)
#   "red_auto"     -> float                        (predicted red auto)
#   "blue_auto"    -> float                        (predicted blue auto)
#   "energized_red"   -> float 0-1                 (prob red gets energized RP)
#   "energized_blue"  -> float 0-1
#   "supercharged_red"  -> float 0-1
#   "supercharged_blue" -> float 0-1
#   "traversal_red"     -> float 0-1
#   "traversal_blue"    -> float 0-1
#
# Domain hierarchy (higher can derive lower):
#   score -> win_prob -> winner
#   A model that outputs scores automatically contributes to win_prob & winner.
#
# Adding a new algorithm:
#   1. Write a function: def my_model(ctx: MatchContext) -> dict
#      Return a dict with only the domain keys you support.
#   2. Add to MODEL_REGISTRY with a prior weight.
#   That's it. The ensemble handles scoring, weighting, and merging.
# ===========================================================================


class MatchContext:
    """Everything a prediction model might need for a single match."""

    __slots__ = (
        "red_teams", "blue_teams", "profiles",
        "sb_match", "tba_match", "canon_key",
    )

    def __init__(self, red_teams, blue_teams, profiles, sb_match, tba_match, canon_key):
        self.red_teams = red_teams          # list[int]
        self.blue_teams = blue_teams        # list[int]
        self.profiles = profiles            # dict[int, dict] — full Phase 1 profiles
        self.sb_match = sb_match            # StatboticsMatch | None
        self.tba_match = tba_match          # Match
        self.canon_key = canon_key          # str, e.g. "qm5"

    def get_profile(self, tn: int) -> dict:
        return self.profiles.get(tn, {})

    def safe(self, val, default=0.0):
        return val if val is not None else default


# ---------------------------------------------------------------------------
# Model: Statbotics
# ---------------------------------------------------------------------------
# Uses Statbotics pre-computed predictions. Dominates early because it
# incorporates prior-event data. Supports all domains.
# ---------------------------------------------------------------------------

def model_statbotics(ctx: MatchContext) -> dict:
    """Statbotics prediction overlay."""
    sb = ctx.sb_match
    if not sb or not sb.pred:
        return {}  # no prediction available

    p = sb.pred
    red_wp = p.red_win_prob  # 0-1

    result = {
        "win_prob": red_wp,
        "red_score": p.red_score,
        "blue_score": p.blue_score,
    }

    # RP predictions (statbotics gives per-alliance RP probabilities)
    result["energized_red"] = p.red_rp_1
    result["energized_blue"] = p.blue_rp_1
    result["supercharged_red"] = p.red_rp_2
    result["supercharged_blue"] = p.blue_rp_2
    if p.red_rp_3 is not None:
        result["traversal_red"] = p.red_rp_3
    if p.blue_rp_3 is not None:
        result["traversal_blue"] = p.blue_rp_3

    return result


# ---------------------------------------------------------------------------
# Model: Whole-Match Normals
# ---------------------------------------------------------------------------
# Uses mean/stdev of each robot's total match contribution (fuel + climb).
# Predicts winner via sum-of-normals CDF. Simple but effective with enough
# scouting data. Only predicts win_prob domain.
# ---------------------------------------------------------------------------

def model_whole_match_normals(ctx: MatchContext) -> dict:
    """Sum-of-normals on total match contribution (fuel + climb)."""
    def _team_normal(tn):
        p = ctx.get_profile(tn)
        fuel_mean = ctx.safe(p.get("fuel_mean"))
        fuel_std = ctx.safe(p.get("fuel_std"), 1.0)
        climb_mean = ctx.safe(p.get("climb_pts_mean"))
        climb_std = ctx.safe(p.get("climb_pts_std"), 1.0)
        total_mean = fuel_mean + climb_mean
        total_std = math.sqrt(fuel_std**2 + climb_std**2)
        return (total_mean, total_std)

    red_normals = [_team_normal(tn) for tn in ctx.red_teams]
    blue_normals = [_team_normal(tn) for tn in ctx.blue_teams]

    # Check if we have any scouting data at all
    has_data = any(
        ctx.get_profile(tn).get("matches_scouted", 0) > 0
        for tn in ctx.red_teams + ctx.blue_teams
    )
    if not has_data:
        return {}

    try:
        win_prob = prob_sum1_greater_sum2(red_normals, blue_normals)
    except (ValueError, ZeroDivisionError):
        return {}

    return {"win_prob": win_prob}


# ---------------------------------------------------------------------------
# Model: Per-Period Breakdown
# ---------------------------------------------------------------------------
# Uses mean/stdev for fuel and climb broken down by period (auto, teleop,
# endgame). Predicts scores, winner, auto winner, and RP probabilities.
# The most comprehensive scouting-based model.
# ---------------------------------------------------------------------------

def _prob_sum_exceeds(normals: list[tuple[float, float]], threshold: float) -> float:
    """Probability that the sum of normal RVs exceeds a threshold."""
    mu = sum(m for m, _ in normals)
    var = sum(s * s for _, s in normals)
    if var <= 0:
        return 1.0 if mu >= threshold else 0.0
    z = (threshold - mu) / math.sqrt(var)
    return 1.0 - 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))


def model_per_period_breakdown(ctx: MatchContext) -> dict:
    """Per-period normal model: auto fuel, teleop fuel, climb separately."""

    def _get_normals(teams, mean_key, std_key, std_default=1.0):
        return [
            (ctx.safe(ctx.get_profile(tn).get(mean_key)),
             ctx.safe(ctx.get_profile(tn).get(std_key), std_default))
            for tn in teams
        ]

    # Check if we have any scouting data at all
    has_data = any(
        ctx.get_profile(tn).get("matches_scouted", 0) > 0
        for tn in ctx.red_teams + ctx.blue_teams
    )
    if not has_data:
        return {}

    # Fuel normals (total)
    red_fuel = _get_normals(ctx.red_teams, "fuel_mean", "fuel_std")
    blue_fuel = _get_normals(ctx.blue_teams, "fuel_mean", "fuel_std")

    # Auto fuel normals
    red_auto = _get_normals(ctx.red_teams, "auto_fuel_mean", "auto_fuel_std")
    blue_auto = _get_normals(ctx.blue_teams, "auto_fuel_mean", "auto_fuel_std")

    # Climb normals
    red_climb = _get_normals(ctx.red_teams, "climb_pts_mean", "climb_pts_std")
    blue_climb = _get_normals(ctx.blue_teams, "climb_pts_mean", "climb_pts_std")

    # Total = fuel + climb per team
    red_total = [
        (f[0] + c[0], math.sqrt(f[1]**2 + c[1]**2))
        for f, c in zip(red_fuel, red_climb)
    ]
    blue_total = [
        (f[0] + c[0], math.sqrt(f[1]**2 + c[1]**2))
        for f, c in zip(blue_fuel, blue_climb)
    ]

    # Predicted scores
    red_score = sum(m for m, _ in red_total)
    blue_score = sum(m for m, _ in blue_total)

    # Win probability
    try:
        win_prob = prob_sum1_greater_sum2(red_total, blue_total)
    except (ValueError, ZeroDivisionError):
        win_prob = 0.5

    # Auto
    red_auto_score = sum(m for m, _ in red_auto)
    blue_auto_score = sum(m for m, _ in blue_auto)
    try:
        auto_win_prob = prob_sum1_greater_sum2(red_auto, blue_auto)
    except (ValueError, ZeroDivisionError):
        auto_win_prob = 0.5

    result = {
        "win_prob": win_prob,
        "red_score": round(red_score, 1),
        "blue_score": round(blue_score, 1),
        "auto_win_prob": auto_win_prob,
        "red_auto": round(red_auto_score, 1),
        "blue_auto": round(blue_auto_score, 1),

        # RP probabilities
        "energized_red": _prob_sum_exceeds(red_fuel, 100),
        "energized_blue": _prob_sum_exceeds(blue_fuel, 100),
        "supercharged_red": _prob_sum_exceeds(red_fuel, 360),
        "supercharged_blue": _prob_sum_exceeds(blue_fuel, 360),
        "traversal_red": _prob_sum_exceeds(red_climb, 50),
        "traversal_blue": _prob_sum_exceeds(blue_climb, 50),
    }

    return result


# ---------------------------------------------------------------------------
# Model: TBA Auto Average
# ---------------------------------------------------------------------------
# Estimates each team's auto contribution by averaging the alliance-level
# totalAutoPoints / 3 from all past TBA qual matches. This is a coarse
# but data-rich signal: it works even without scouting data, since TBA
# records every match. Only predicts auto-related domains.
# ---------------------------------------------------------------------------

def model_tba_auto_average(ctx: MatchContext) -> dict:
    """Predict auto scores from TBA alliance auto / 3 averages."""
    has_data = any(
        ctx.get_profile(tn).get("tba_auto_contrib_mean") is not None
        for tn in ctx.red_teams + ctx.blue_teams
    )
    if not has_data:
        return {}

    def _team_auto_normal(tn):
        p = ctx.get_profile(tn)
        mean = ctx.safe(p.get("tba_auto_contrib_mean"))
        std = ctx.safe(p.get("tba_auto_contrib_stdev"), 1.0)
        return (mean, std)

    red_normals = [_team_auto_normal(tn) for tn in ctx.red_teams]
    blue_normals = [_team_auto_normal(tn) for tn in ctx.blue_teams]

    red_auto = sum(m for m, _ in red_normals)
    blue_auto = sum(m for m, _ in blue_normals)

    try:
        auto_win_prob = prob_sum1_greater_sum2(red_normals, blue_normals)
    except (ValueError, ZeroDivisionError):
        auto_win_prob = 0.5

    return {
        "red_auto": round(red_auto, 1),
        "blue_auto": round(blue_auto, 1),
        "auto_win_prob": auto_win_prob,
    }


# ---------------------------------------------------------------------------
# Model: Scouted Auto Points
# ---------------------------------------------------------------------------
# Uses per-team scouted auto fuel (scored during auto phase) plus auto
# climb success rate * 15 pts to predict each team's individual auto
# contribution. More granular than the TBA model because it tracks
# actual robot-level actions, not just alliance totals.
# ---------------------------------------------------------------------------

def model_scouted_auto(ctx: MatchContext) -> dict:
    """Predict auto scores from scouted per-robot auto fuel + auto climb."""
    has_data = any(
        ctx.get_profile(tn).get("matches_scouted", 0) > 0
        for tn in ctx.red_teams + ctx.blue_teams
    )
    if not has_data:
        return {}

    def _team_auto_normal(tn):
        p = ctx.get_profile(tn)
        auto_fuel_mean = ctx.safe(p.get("auto_fuel_mean"))
        auto_fuel_std = ctx.safe(p.get("auto_fuel_std"), 1.0)
        # Auto climb contributes 15 pts; weight by success rate
        auto_climb_rate = ctx.safe(p.get("auto_climb_rate")) / 100.0  # stored as pct
        auto_climb_mean = auto_climb_rate * 15.0
        # Std dev of a Bernoulli * 15
        auto_climb_std = 15.0 * math.sqrt(auto_climb_rate * (1 - auto_climb_rate)) if 0 < auto_climb_rate < 1 else 0.5
        total_mean = auto_fuel_mean + auto_climb_mean
        total_std = math.sqrt(auto_fuel_std ** 2 + auto_climb_std ** 2)
        return (total_mean, total_std)

    red_normals = [_team_auto_normal(tn) for tn in ctx.red_teams]
    blue_normals = [_team_auto_normal(tn) for tn in ctx.blue_teams]

    red_auto = sum(m for m, _ in red_normals)
    blue_auto = sum(m for m, _ in blue_normals)

    try:
        auto_win_prob = prob_sum1_greater_sum2(red_normals, blue_normals)
    except (ValueError, ZeroDivisionError):
        auto_win_prob = 0.5

    return {
        "red_auto": round(red_auto, 1),
        "blue_auto": round(blue_auto, 1),
        "auto_win_prob": auto_win_prob,
    }


# ---------------------------------------------------------------------------
# Model Registry
# ---------------------------------------------------------------------------
# prior_weight: relative weight when no empirical data exists yet.
#   Statbotics gets a high prior because it has cross-event data.
#   Scouting models start lower and earn weight as matches are played.
# ---------------------------------------------------------------------------

MODEL_REGISTRY = [
    {
        "name": "statbotics",
        "fn": model_statbotics,
        "prior_weight": 3.0,
    },
    {
        "name": "whole_match_normals",
        "fn": model_whole_match_normals,
        "prior_weight": 1.0,
    },
    {
        "name": "per_period_breakdown",
        "fn": model_per_period_breakdown,
        "prior_weight": 1.5,
    },
    {
        "name": "tba_auto_average",
        "fn": model_tba_auto_average,
        "prior_weight": 1.0,
    },
    {
        "name": "scouted_auto",
        "fn": model_scouted_auto,
        "prior_weight": 1.5,
    },
]


# ---------------------------------------------------------------------------
# Ensemble scoring & weighting
# ---------------------------------------------------------------------------

# All known prediction domains
ALL_DOMAINS = [
    "win_prob", "red_score", "blue_score",
    "auto_win_prob", "red_auto", "blue_auto",
    "energized_red", "energized_blue",
    "supercharged_red", "supercharged_blue",
    "traversal_red", "traversal_blue",
]

# Domains that are probabilities (scored with Brier) vs scores (scored with MAE)
PROB_DOMAINS = {
    "win_prob", "auto_win_prob",
    "energized_red", "energized_blue",
    "supercharged_red", "supercharged_blue",
    "traversal_red", "traversal_blue",
}
SCORE_DOMAINS = {"red_score", "blue_score", "red_auto", "blue_auto"}

# Minimum completed matches before using empirical weights
MIN_MATCHES_FOR_EMPIRICAL = 1


def _extract_actual(tba_match: Match, canon_key: str) -> Optional[dict]:
    """Extract actual results from a completed TBA match for scoring models.

    Returns a dict with the same domain keys as model outputs, or None if
    the match has no results.
    """
    if tba_match.score_breakdown is None:
        return None

    sb = tba_match.score_breakdown
    red_bd: AllianceScoreBreakdown2026 = sb.red
    blue_bd: AllianceScoreBreakdown2026 = sb.blue

    red_score = red_bd.totalPoints
    blue_score = blue_bd.totalPoints

    if red_score > blue_score:
        winner = "red"
        win_prob_actual = 1.0
    elif blue_score > red_score:
        winner = "blue"
        win_prob_actual = 0.0
    else:
        winner = "tie"
        win_prob_actual = 0.5

    red_auto = red_bd.totalAutoPoints
    blue_auto = blue_bd.totalAutoPoints
    if red_auto > blue_auto:
        auto_win_actual = 1.0
    elif blue_auto > red_auto:
        auto_win_actual = 0.0
    else:
        auto_win_actual = 0.5

    return {
        "win_prob": win_prob_actual,
        "red_score": float(red_score),
        "blue_score": float(blue_score),
        "auto_win_prob": auto_win_actual,
        "red_auto": float(red_auto),
        "blue_auto": float(blue_auto),
        "energized_red": 1.0 if red_bd.energizedAchieved else 0.0,
        "energized_blue": 1.0 if blue_bd.energizedAchieved else 0.0,
        "supercharged_red": 1.0 if red_bd.superchargedAchieved else 0.0,
        "supercharged_blue": 1.0 if blue_bd.superchargedAchieved else 0.0,
        "traversal_red": 1.0 if red_bd.traversalAchieved else 0.0,
        "traversal_blue": 1.0 if blue_bd.traversalAchieved else 0.0,
    }


def _score_model_on_domain(
    predictions: list[float],
    actuals: list[float],
    domain: str,
) -> Optional[float]:
    """Compute error for a model on a specific domain. Lower is better.

    Returns None if not enough data.
    """
    if len(predictions) < MIN_MATCHES_FOR_EMPIRICAL:
        return None

    if domain in PROB_DOMAINS:
        # Brier score: mean of (predicted - actual)^2
        return statistics.mean((p - a) ** 2 for p, a in zip(predictions, actuals))
    elif domain in SCORE_DOMAINS:
        # MAE: mean absolute error
        return statistics.mean(abs(p - a) for p, a in zip(predictions, actuals))
    else:
        return None


def _compute_ensemble_weights(
    model_errors: dict[str, dict[str, Optional[float]]],
    model_priors: dict[str, float],
    model_active_domains: Optional[dict[str, set[str]]] = None,
) -> dict[str, dict[str, float]]:
    """Compute per-domain weights for each model.

    Args:
        model_errors: {model_name: {domain: error_or_None}}
        model_priors: {model_name: prior_weight}
        model_active_domains: {model_name: set of domains the model has ever
            produced across ALL matches (not just completed ones)}.  When
            provided this ensures a model that only has predictions for
            upcoming/recent matches still receives a prior weight.

    Returns:
        {domain: {model_name: normalized_weight}}
    """
    EPSILON = 0.01
    weights: dict[str, dict[str, float]] = {}

    for domain in ALL_DOMAINS:
        domain_weights: dict[str, float] = {}

        # Collect which models have predictions for this domain —
        # check both model_errors (from completed-match scoring) and
        # model_active_domains (from all matches including upcoming).
        models_with_domain: list[str] = []
        seen = set()
        for name, errors in model_errors.items():
            if domain in errors:
                models_with_domain.append(name)
                seen.add(name)
        if model_active_domains:
            for name, domains in model_active_domains.items():
                if domain in domains and name not in seen:
                    models_with_domain.append(name)

        if not models_with_domain:
            continue

        # Check if any model has empirical error data for this domain
        has_empirical = any(
            model_errors.get(name, {}).get(domain) is not None
            for name in models_with_domain
        )

        if has_empirical:
            for name in models_with_domain:
                err = model_errors.get(name, {}).get(domain)
                if err is not None:
                    domain_weights[name] = 1.0 / (err + EPSILON)
                else:
                    # Model contributed to this domain but not enough data to score:
                    # give it a small fraction of its prior
                    domain_weights[name] = model_priors.get(name, 1.0) * 0.5
        else:
            # Pure prior weights — no empirical data yet
            for name in models_with_domain:
                domain_weights[name] = model_priors.get(name, 1.0)

        # Normalize
        total = sum(domain_weights.values())
        if total > 0:
            weights[domain] = {
                name: round(w / total, 4)
                for name, w in domain_weights.items()
            }

    return weights


def _merge_ensemble(
    per_model_outputs: dict[str, dict],
    weights: dict[str, dict[str, float]],
) -> dict:
    """Weighted-average merge of model outputs across all domains.

    Returns the ensemble prediction dict with all domains that had
    at least one contributing model.
    """
    ensemble = {}

    for domain in ALL_DOMAINS:
        domain_weights = weights.get(domain, {})
        if not domain_weights:
            continue

        weighted_sum = 0.0
        weight_sum = 0.0

        for model_name, w in domain_weights.items():
            output = per_model_outputs.get(model_name, {})
            if domain in output:
                weighted_sum += output[domain] * w
                weight_sum += w

        if weight_sum > 0:
            ensemble[domain] = weighted_sum / weight_sum

    return ensemble


# ---------------------------------------------------------------------------
# Climb position recommendations (non-model, carried forward from before)
# ---------------------------------------------------------------------------

def _recommend_climb_positions(summaries: list[dict]) -> list[dict]:
    """Assign climb positions to minimize conflicts."""
    POSITIONS = ["Left", "Center", "Right"]
    ranked = sorted(
        summaries,
        key=lambda s: (s["best_climb_level"], s["endgame_climb_rate"]),
        reverse=True,
    )

    assigned = {}
    used_positions = set()

    for s in ranked:
        tn = s["team"]
        if s["best_climb_level"] == 0 or s["endgame_climb_rate"] == 0:
            assigned[tn] = {"pos": None, "level": 0, "note": "No climb expected"}
            continue

        pref = s["preferred_climb_pos"]
        if pref and pref in POSITIONS and pref not in used_positions:
            used_positions.add(pref)
            assigned[tn] = {"pos": pref, "level": s["best_climb_level"], "note": "preferred"}
        else:
            placed = False
            for pos in POSITIONS:
                if pos not in used_positions:
                    used_positions.add(pos)
                    note = "reassigned" if pref and pref != pos else "auto-assigned"
                    assigned[tn] = {"pos": pos, "level": s["best_climb_level"], "note": note}
                    placed = True
                    break
            if not placed:
                assigned[tn] = {"pos": None, "level": s["best_climb_level"], "note": "no slot available"}

    return [
        {
            "team": s["team"],
            "recommended_pos": assigned[s["team"]]["pos"],
            "level": assigned[s["team"]]["level"],
            "note": assigned[s["team"]]["note"],
            "climb_rate": s["endgame_climb_rate"],
            "preferred_pos": s["preferred_climb_pos"],
        }
        for s in summaries
    ]


# ---------------------------------------------------------------------------
# Team summary builder (shared by all models via MatchContext.profiles,
# but needed for the output structure)
# ---------------------------------------------------------------------------

def _build_team_summary(profiles: dict, tn: int) -> dict:
    """Build team detail dict for match output."""
    p = profiles.get(tn, {})

    def _safe(val, default=0.0):
        return val if val is not None else default

    return {
        "team": tn,
        "fuel_mean": _safe(p.get("fuel_mean")),
        "fuel_std": _safe(p.get("fuel_std"), 1.0),
        "auto_fuel_mean": _safe(p.get("auto_fuel_mean")),
        "auto_fuel_std": _safe(p.get("auto_fuel_std"), 1.0),
        "climb_pts_mean": _safe(p.get("climb_pts_mean")),
        "climb_pts_std": _safe(p.get("climb_pts_std"), 1.0),
        "auto_climb_rate": _safe(p.get("auto_climb_rate")),
        "endgame_climb_rate": _safe(p.get("endgame_climb_rate")),
        "best_climb_level": p.get("best_climb_level", 0),
        "preferred_climb_pos": p.get("preferred_climb_pos"),
        "preferred_auto_climb_pos": p.get("preferred_auto_climb_pos"),
        "climb_pos_counts": p.get("climb_pos_counts", {}),
        "role": p.get("role", "Unknown"),
        "traversal": p.get("traversal", "Unknown"),
        "skill": p.get("skill"),
        "speed": p.get("speed"),
        "defense_skill": p.get("defense_skill"),
        "fault_rate": p.get("fault_rate"),
        "accuracy": p.get("accuracy_avg"),
        "bps": p.get("bps"),
        "active_fuel_avg": p.get("active_fuel_avg"),
    }


# ---------------------------------------------------------------------------
# Main Phase 2 entry point
# ---------------------------------------------------------------------------

def phase2_predict_matches(
    calc_result: dict,
    tba_data: list[Match],
    sb_data: list[StatboticsMatch],
    team_stats: dict,
    log: Logger,
) -> dict[str, dict]:
    """Run the ensemble prediction system on all matches.

    Steps:
        1. Run every registered model on every match
        2. Score each model against completed matches
        3. Compute ensemble weights
        4. Merge into final predictions per match

    Returns match_predictions dict in the same shape Phase 3 expects.
    """
    with log.section("Running ensemble prediction system"):
        profiles = team_stats["profiles"]
        sb_match_map: dict[str, StatboticsMatch] = {m.key: m for m in sb_data}
        tba_match_map: dict[str, Match] = {m.key: m for m in tba_data}

        # ------------------------------------------------------------------
        # Step 1: Run every model on every match
        # ------------------------------------------------------------------
        # {canon_key: {model_name: output_dict}}
        all_model_outputs: dict[str, dict[str, dict]] = {}
        # {canon_key: actual_dict or None}
        all_actuals: dict[str, Optional[dict]] = {}
        # Track match metadata
        match_meta: dict[str, dict] = {}

        for canon_key, tba_key in calc_result["match_index"].items():
            tba_match = tba_match_map.get(tba_key)
            if not tba_match:
                continue

            red_teams = [parse_team_key(k) for k in tba_match.alliances.red.team_keys]
            blue_teams = [parse_team_key(k) for k in tba_match.alliances.blue.team_keys]

            ctx = MatchContext(
                red_teams=red_teams,
                blue_teams=blue_teams,
                profiles=profiles,
                sb_match=sb_match_map.get(tba_key),
                tba_match=tba_match,
                canon_key=canon_key,
            )

            # Run each model
            match_outputs: dict[str, dict] = {}
            for model in MODEL_REGISTRY:
                try:
                    output = model["fn"](ctx)
                    if output:  # only store if model returned something
                        match_outputs[model["name"]] = output
                except Exception:
                    pass  # model failed on this match, skip it

            all_model_outputs[canon_key] = match_outputs
            all_actuals[canon_key] = _extract_actual(tba_match, canon_key)
            match_meta[canon_key] = {
                "tba_key": tba_key,
                "tba_match": tba_match,
                "red_teams": red_teams,
                "blue_teams": blue_teams,
            }

        # Build a map of every domain each model has ever produced
        # (across ALL matches, not just completed ones).  This ensures
        # models that only fire on upcoming matches still get weights.
        model_active_domains: dict[str, set[str]] = {}
        for canon_key, outputs in all_model_outputs.items():
            for model_name, output in outputs.items():
                model_active_domains.setdefault(model_name, set()).update(output.keys())

        log.stat("Models registered", len(MODEL_REGISTRY))

        # ------------------------------------------------------------------
        # Step 2: Score each model on completed matches
        # ------------------------------------------------------------------
        # {model_name: {domain: [predicted values]}}
        model_preds_by_domain: dict[str, dict[str, list[float]]] = {}
        # {domain: [actual values]} — same ordering as preds
        actual_by_domain: dict[str, dict[str, list[float]]] = {}

        completed_keys = [ck for ck, actual in all_actuals.items() if actual is not None]

        for model in MODEL_REGISTRY:
            name = model["name"]
            model_preds_by_domain[name] = {}

        for ck in completed_keys:
            actual = all_actuals[ck]
            outputs = all_model_outputs.get(ck, {})

            for model in MODEL_REGISTRY:
                name = model["name"]
                output = outputs.get(name, {})
                for domain in ALL_DOMAINS:
                    if domain in output and domain in actual:
                        model_preds_by_domain[name].setdefault(domain, []).append(output[domain])
                        actual_by_domain.setdefault(name, {}).setdefault(domain, []).append(actual[domain])

        # Compute error per model per domain
        model_errors: dict[str, dict[str, Optional[float]]] = {}
        for model in MODEL_REGISTRY:
            name = model["name"]
            model_errors[name] = {}
            for domain in ALL_DOMAINS:
                preds = model_preds_by_domain[name].get(domain, [])
                acts = actual_by_domain.get(name, {}).get(domain, [])
                if preds and acts:
                    model_errors[name][domain] = _score_model_on_domain(preds, acts, domain)
                elif domain in model_preds_by_domain[name]:
                    # Model produces this domain but not enough completed matches
                    model_errors[name][domain] = None

        # Log model performance
        for model in MODEL_REGISTRY:
            name = model["name"]
            domains_active = [d for d in ALL_DOMAINS if d in model_errors[name]]
            scored = [d for d in domains_active if model_errors[name][d] is not None]
            log.substep(f"{name}: {len(domains_active)} domains, {len(scored)} scored empirically")

        # ------------------------------------------------------------------
        # Step 3: Compute ensemble weights
        # ------------------------------------------------------------------
        model_priors = {m["name"]: m["prior_weight"] for m in MODEL_REGISTRY}
        ensemble_weights = _compute_ensemble_weights(model_errors, model_priors, model_active_domains)

        log.stat("Completed matches scored", len(completed_keys))

        # ------------------------------------------------------------------
        # Step 4: Build final predictions per match
        # ------------------------------------------------------------------
        match_predictions: dict[str, dict] = {}

        for canon_key, meta in match_meta.items():
            tba_match = meta["tba_match"]
            red_teams = meta["red_teams"]
            blue_teams = meta["blue_teams"]

            # Ensemble merge
            outputs = all_model_outputs.get(canon_key, {})
            ensemble = _merge_ensemble(outputs, ensemble_weights)

            # Build team summaries for output
            red_summaries = [_build_team_summary(profiles, tn) for tn in red_teams]
            blue_summaries = [_build_team_summary(profiles, tn) for tn in blue_teams]

            # Climb recommendations
            red_climb_recs = _recommend_climb_positions(red_summaries)
            blue_climb_recs = _recommend_climb_positions(blue_summaries)

            # Derive winner from win_prob if available
            win_prob = ensemble.get("win_prob", 0.5)
            auto_win_prob = ensemble.get("auto_win_prob", 0.5)

            # Format the ensemble output into the predictions dict
            # (same shape the frontend expects)
            predictions = {
                "red_win_prob": round(win_prob * 100, 1),
                "blue_win_prob": round((1 - win_prob) * 100, 1),
                "red_score_pred": round(ensemble.get("red_score", 0), 1),
                "blue_score_pred": round(ensemble.get("blue_score", 0), 1),
                "red_fuel_pred": None,   # not directly in ensemble (could add)
                "blue_fuel_pred": None,
                "red_climb_pred": None,
                "blue_climb_pred": None,
                "red_auto_pred": round(ensemble.get("red_auto", 0), 1),
                "blue_auto_pred": round(ensemble.get("blue_auto", 0), 1),
                "red_auto_win_prob": round(auto_win_prob * 100, 1),
                "blue_auto_win_prob": round((1 - auto_win_prob) * 100, 1),
                "red_energized_prob": round(ensemble.get("energized_red", 0) * 100, 1),
                "blue_energized_prob": round(ensemble.get("energized_blue", 0) * 100, 1),
                "red_supercharged_prob": round(ensemble.get("supercharged_red", 0) * 100, 1),
                "blue_supercharged_prob": round(ensemble.get("supercharged_blue", 0) * 100, 1),
                "red_traversal_prob": round(ensemble.get("traversal_red", 0) * 100, 1),
                "blue_traversal_prob": round(ensemble.get("traversal_blue", 0) * 100, 1),
            }

            # Per-model breakdown for debugging / frontend display
            model_breakdown = {}
            for model_name, output in outputs.items():
                model_breakdown[model_name] = {
                    k: round(v * 100, 1) if k in PROB_DOMAINS else round(v, 1)
                    for k, v in output.items()
                    if isinstance(v, (int, float))
                }

            # Statbotics raw pred (preserved for backwards compat)
            sb_match = sb_match_map.get(meta["tba_key"])
            sb_pred = None
            if sb_match and sb_match.pred:
                p = sb_match.pred
                sb_pred = {
                    "red_win_prob": round(p.red_win_prob * 100, 1),
                    "blue_win_prob": round((1 - p.red_win_prob) * 100, 1),
                    "red_score": round(p.red_score, 1),
                    "blue_score": round(p.blue_score, 1),
                    "red_rp_1": round(p.red_rp_1 * 100, 1),
                    "blue_rp_1": round(p.blue_rp_1 * 100, 1),
                    "red_rp_2": round(p.red_rp_2 * 100, 1),
                    "blue_rp_2": round(p.blue_rp_2 * 100, 1),
                    "red_rp_3": round(p.red_rp_3 * 100, 1) if p.red_rp_3 is not None else None,
                    "blue_rp_3": round(p.blue_rp_3 * 100, 1) if p.blue_rp_3 is not None else None,
                }

            match_predictions[canon_key] = {
                "key": meta["tba_key"],
                "comp_level": tba_match.comp_level,
                "match_number": tba_match.match_number,
                "set_number": tba_match.set_number,
                "alliances": {
                    "red": {
                        "teams": red_teams,
                        "team_details": red_summaries,
                        "climb_recommendations": red_climb_recs,
                    },
                    "blue": {
                        "teams": blue_teams,
                        "team_details": blue_summaries,
                        "climb_recommendations": blue_climb_recs,
                    },
                },
                "predictions": predictions,
                "model_breakdown": model_breakdown,
                "ensemble_weights": {
                    domain: {name: round(w, 3) for name, w in ws.items()}
                    for domain, ws in ensemble_weights.items()
                },
                "sb_pred": sb_pred,
            }

        log.stat("Match predictions built", len(match_predictions))

    return match_predictions


def phase2_predict_rp(
    sb_data: list[StatboticsMatch],
    team_stats: dict,
    log: Logger,
) -> dict:
    """Compute predicted RP totals from Statbotics. Returns rp_pred dicts."""
    with log.section("Computing predicted RP from Statbotics"):
        team_matches_played = team_stats["rp"]["team_matches_played"]

        sb_rp_pred: dict[int, float] = {}
        sb_quals = [m for m in sb_data if m.comp_level == "qm" and m.pred is not None]
        for m in sb_quals:
            for color in ("red", "blue"):
                alliance_data: StatboticsAllianceData = getattr(m.alliances, color)
                pred: StatboticsPred = m.pred
                win_prob = pred.red_win_prob if color == "red" else (1 - pred.red_win_prob)
                expected_win_rp = 3.0 * win_prob
                rp1 = pred.red_rp_1 if color == "red" else pred.blue_rp_1
                rp2 = pred.red_rp_2 if color == "red" else pred.blue_rp_2
                rp3 = (pred.red_rp_3 if color == "red" else pred.blue_rp_3) or 0.0
                expected_total = expected_win_rp + rp1 + rp2 + rp3

                for team_key in alliance_data.team_keys:
                    tn = parse_team_key(team_key)
                    sb_rp_pred[tn] = sb_rp_pred.get(tn, 0.0) + expected_total

        rp_pred = {tn: round(val, 2) for tn, val in sb_rp_pred.items()}
        rp_avg_pred = {
            tn: round(val / max(team_matches_played.get(tn, 1), 1), 2)
            for tn, val in sb_rp_pred.items()
        }

        log.stat("Teams with RP predictions", len(rp_pred))

    return {"rp_pred": rp_pred, "rp_avg_pred": rp_avg_pred}

# ===========================================================================
# Phase 3: Output Building
# ===========================================================================
# Assemble final structures for the frontend. Rankings, match objects with
# pred/post, team objects. No new data — only organize and format.
# ===========================================================================

def phase3_build_rankings(
    calc_result: dict,
    team_stats: dict,
    rp_predictions: dict,
    log: Logger,
):
    """Build the ranking dict from team profiles. Mutates calc_result["ranking"]."""
    with log.section("Building team rankings"):
        profiles = team_stats["profiles"]
        rp_tally = team_stats["rp"]["rp_tally"]
        ranking = calc_result["ranking"]

        _ALL_RANKING_KEYS = [
            "total_fuel_avg", "total_fuel_median", "total_fuel_stdev",
            "auto_fuel_avg", "teleop_fuel_avg", "active_fuel_avg",
            "endgame_fuel_avg", "transition_fuel_avg", "accuracy_avg",
            "climb_points_avg", "auto_climb_rate", "endgame_climb_rate",
            "best_climb_level", "total_points_avg", "total_points_stdev",
            "bps", "rp_avg", "energized_rate", "supercharged_rate",
            "traversal_rate", "skill_avg", "defense_skill_avg",
            "speed_avg", "fault_rate",
        ]

        for key in _ALL_RANKING_KEYS:
            ranking[key] = {}

        for tn, prof in profiles.items():
            ranking["total_fuel_avg"][tn] = prof.get("total_fuel_avg")
            ranking["total_fuel_median"][tn] = prof.get("total_fuel_median")
            ranking["total_fuel_stdev"][tn] = prof.get("total_fuel_stdev")
            ranking["auto_fuel_avg"][tn] = prof.get("auto_fuel_avg")
            ranking["teleop_fuel_avg"][tn] = prof.get("teleop_fuel_avg")
            ranking["active_fuel_avg"][tn] = prof.get("active_fuel_avg")
            ranking["endgame_fuel_avg"][tn] = prof.get("endgame_fuel_avg")
            ranking["transition_fuel_avg"][tn] = prof.get("transition_fuel_avg")
            ranking["accuracy_avg"][tn] = prof.get("accuracy_avg")
            ranking["climb_points_avg"][tn] = prof.get("climb_points_avg")
            ranking["auto_climb_rate"][tn] = prof.get("auto_climb_rate_pct")
            ranking["endgame_climb_rate"][tn] = prof.get("endgame_climb_rate_pct")
            ranking["best_climb_level"][tn] = prof.get("best_climb_level", 0)
            ranking["total_points_avg"][tn] = prof.get("total_points_avg")
            ranking["total_points_stdev"][tn] = prof.get("total_points_stdev")
            ranking["bps"][tn] = prof.get("bps")
            ranking["rp_avg"][tn] = prof.get("rp_avg")
            ranking["energized_rate"][tn] = prof.get("energized_rate")
            ranking["supercharged_rate"][tn] = prof.get("supercharged_rate")
            ranking["traversal_rate"][tn] = prof.get("traversal_rate")
            ranking["skill_avg"][tn] = prof.get("skill")
            ranking["defense_skill_avg"][tn] = prof.get("defense_skill")
            ranking["speed_avg"][tn] = prof.get("speed")
            ranking["fault_rate"][tn] = prof.get("fault_rate")

        # Backfill missing teams with 0
        all_teams = set(calc_result["team"].keys())
        for metric_key in _ALL_RANKING_KEYS:
            for tn in all_teams:
                if tn not in ranking.get(metric_key, {}):
                    ranking.setdefault(metric_key, {})[tn] = 0

        # Composite metrics for header display
        ranking["auto"] = dict(ranking.get("auto_fuel_avg", {}))
        ranking["teleop"] = dict(ranking.get("teleop_fuel_avg", {}))
        ranking["endgame"] = dict(ranking.get("climb_points_avg", {}))

        # RP rankings
        ranking["rp"] = dict(rp_tally)
        ranking["rp_rank"] = dict(rp_tally)
        ranking["rp_pred"] = rp_predictions.get("rp_pred", {})
        ranking["rp_avg_pred"] = rp_predictions.get("rp_avg_pred", {})

        # Convert specific metrics to Standard Competition Rank (1st, 1st, 3rd, 4th)
        keys_to_rank = ["auto", "teleop", "endgame", "rp", "rp_rank", "rp_pred", "rp_avg", "rp_avg_pred"]
        for k in keys_to_rank:
            if k in ranking:
                metric_dict = ranking[k]
                # Filter out None values and sort descending
                sorted_items = sorted(
                    [(tn, val) for tn, val in metric_dict.items() if val is not None],
                    key=lambda x: x[1], 
                    reverse=True
                )
                ranks = {}
                current_rank = 1
                current_val = None
                for idx, (tn, val) in enumerate(sorted_items):
                    if val != current_val:
                        current_rank = idx + 1
                        current_val = val
                    ranks[tn] = current_rank
                
                # Backfill any teams that were None with a default max rank
                max_rank = len(sorted_items) + 1
                for tn in metric_dict.keys():
                    if tn not in ranks:
                        ranks[tn] = max_rank
                        
                ranking[k] = ranks

        log.stat("Teams ranked", len(all_teams))
        log.stat("Ranking dimensions", len(ranking))


def phase3_build_match_output(
    calc_result: dict,
    tba_data: list[Match],
    sb_data: list[StatboticsMatch],
    match_predictions: dict[str, dict],
    log: Logger,
):
    """Build the final match pred/post structures. Mutates calc_result["match"].

    Post data is built exclusively from TBA and Statbotics — no scouting data.
    """
    with log.section("Building match pred/post structure"):
        TOWER_LEVEL_PTS = {"Level1": 10, "Level2": 20, "Level3": 30, "None": 0}
        AUTO_TOWER_LEVEL_PTS = {"Level1": 15, "None": 0}

        sb_match_map: dict[str, StatboticsMatch] = {m.key: m for m in sb_data}

        post_count = 0

        for canon_key, tba_key in calc_result["match_index"].items():
            tba_match = next((m for m in tba_data if m.key == tba_key), None)
            if not tba_match:
                continue

            has_result = tba_match.score_breakdown is not None

            # Wrap prediction data into "pred" sub-key
            pred_source = match_predictions.get(canon_key, {})
            pred_data = {
                "key": pred_source.get("key"),
                "comp_level": pred_source.get("comp_level"),
                "match_number": pred_source.get("match_number"),
                "set_number": pred_source.get("set_number"),
                "alliances": pred_source.get("alliances"),
                "predictions": pred_source.get("predictions"),
                "sb_pred": pred_source.get("sb_pred"),
            }

            post_data = None
            if has_result:
                sb = tba_match.score_breakdown
                alliances_tba = tba_match.alliances
                sb_match = sb_match_map.get(tba_key)

                result = {}
                for color in ("red", "blue"):
                    bd: AllianceScoreBreakdown2026 = getattr(sb, color)
                    al: MatchAlliance = getattr(alliances_tba, color)
                    hub = bd.hubScore
                    teams = [parse_team_key(k) for k in al.team_keys]

                    climbs = []
                    for i in range(1, 4):
                        auto_level = getattr(bd, f"autoTowerRobot{i}")
                        endgame_level = getattr(bd, f"endGameTowerRobot{i}")
                        auto_pts = AUTO_TOWER_LEVEL_PTS.get(auto_level, 0)
                        endgame_pts = TOWER_LEVEL_PTS.get(endgame_level, 0)
                        climbs.append({
                            "team": teams[i - 1] if i - 1 < len(teams) else None,
                            "auto_tower": auto_level,
                            "auto_tower_pts": auto_pts,
                            "endgame_tower": endgame_level,
                            "endgame_tower_pts": endgame_pts,
                            "total_tower_pts": auto_pts + endgame_pts,
                        })

                    result[color] = {
                        "teams": teams,
                        "score": bd.totalPoints,
                        "rp": bd.rp,
                        "auto_points": bd.totalAutoPoints,
                        "teleop_points": bd.totalTeleopPoints,
                        "tower_points": bd.totalTowerPoints,
                        "auto_tower_points": bd.autoTowerPoints,
                        "endgame_tower_points": bd.endGameTowerPoints,
                        "foul_points": bd.foulPoints,
                        "adjust_points": bd.adjustPoints,
                        "minor_fouls": bd.minorFoulCount,
                        "major_fouls": bd.majorFoulCount,
                        "energized": bd.energizedAchieved,
                        "supercharged": bd.superchargedAchieved,
                        "traversal": bd.traversalAchieved,
                        "hub": {
                            "total": {"count": hub.totalCount, "points": hub.totalPoints},
                            "auto": {"count": hub.autoCount, "points": hub.autoPoints},
                            "transition": {"count": hub.transitionCount, "points": hub.transitionPoints},
                            "shift_1": {"count": hub.shift1Count, "points": hub.shift1Points},
                            "shift_2": {"count": hub.shift2Count, "points": hub.shift2Points},
                            "shift_3": {"count": hub.shift3Count, "points": hub.shift3Points},
                            "shift_4": {"count": hub.shift4Count, "points": hub.shift4Points},
                            "endgame": {"count": hub.endgameCount, "points": hub.endgamePoints},
                        },
                        "climbs": climbs,
                    }

                red_score = result["red"]["score"]
                blue_score = result["blue"]["score"]
                winner = "red" if red_score > blue_score else "blue" if blue_score > red_score else "tie"

                # Pred error computed from Statbotics predictions only (no scouting)
                sb_pred = pred_data.get("sb_pred") or {}
                sb_pred_error = None
                if sb_pred.get("red_score") is not None:
                    sb_pred_error = {
                        "red": round(red_score - sb_pred["red_score"], 1),
                        "blue": round(blue_score - sb_pred["blue_score"], 1),
                        "pred_winner_correct": (
                            (sb_pred["red_win_prob"] > 50 and winner == "red")
                            or (sb_pred["blue_win_prob"] > 50 and winner == "blue")
                        ),
                    }

                # Build SB-sourced result data if available
                sb_result = None
                if sb_match and sb_match.result:
                    r = sb_match.result
                    sb_result = {
                        "red_score": r.red_score,
                        "blue_score": r.blue_score,
                        "red_no_foul": r.red_no_foul,
                        "blue_no_foul": r.blue_no_foul,
                        "red_auto_points": r.red_auto_points,
                        "blue_auto_points": r.blue_auto_points,
                        "red_teleop_points": r.red_teleop_points,
                        "blue_teleop_points": r.blue_teleop_points,
                        "red_endgame_points": r.red_endgame_points,
                        "blue_endgame_points": r.blue_endgame_points,
                    }

                post_data = {
                    "red": result["red"],
                    "blue": result["blue"],
                    "winner": winner,
                    "sb_pred_error": sb_pred_error,
                    "sb_result": sb_result,
                    "time": tba_match.actual_time or tba_match.time,
                }
                post_count += 1

            calc_result["match"][canon_key] = {
                "pred": pred_data,
                "post": post_data,
            }

        log.stat("Matches with results", post_count)


def phase3_attach_team_output(calc_result: dict, team_stats: dict):
    """Attach shots, fuel, and metrics to per-team output in calc_result."""
    profiles = team_stats["profiles"]
    team_fuel_output = team_stats["team_fuel_output"]

    for team_num in calc_result["team"]:
        prof = profiles.get(team_num, {})
        calc_result["team"][team_num]["shots"] = prof.get("shots", [])
        calc_result["team"][team_num]["metrics"] = prof.get("qualitative_metrics", {})

        team_str = str(team_num)
        if team_str in team_fuel_output:
            calc_result["team"][team_num]["fuel"] = team_fuel_output[team_str]


def phase3_determine_next_match(calc_result: dict, log: Logger):
    """Find the first unplayed match in canonical order."""
    import re

    with log.section("Determining next match"):
        def _match_order(key: str) -> int:
            m = re.match(r"^(qm|sf|f)(\d+)$", key, re.IGNORECASE)
            if not m:
                return -1
            prefix, num = m.group(1).lower(), int(m.group(2))
            if prefix == "qm":
                return num
            if prefix == "sf":
                return 1000 + num
            return 2000 + num

        sorted_canon_keys = sorted(calc_result["match"].keys(), key=_match_order)
        next_match = None
        for ck in sorted_canon_keys:
            if calc_result["match"][ck].get("post") is None:
                next_match = ck
                break

        calc_result["next_match"] = next_match
        log.stat("Next match", next_match if next_match else "all completed")


# ===========================================================================
# Main entry point
# ===========================================================================

def run_calculation(setting):
    """Execute scouting data calculations using the three-phase pipeline.

    Phase 1 - Input Processing:  crunch raw data into per-team stat profiles.
    Phase 2 - Inference:         predictions, predicted RP, derived insights.
    Phase 3 - Output Building:   rankings, match objects, final DataSchema.
    """
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

    # ======================================================================
    # PHASE 1: Input Processing
    # ======================================================================
    with log.section(f"{Logger.CYAN}-- Phase 1: Input Processing --{Logger.RESET}"):

        # Fetch external data
        fetch_result = phase1_fetch_data(event_key, stop_on_warning, log)
        if isinstance(fetch_result, dict):
            return fetch_result  # error
        tba_data, sb_data = fetch_result

        # Initialize result structure
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
                stop_on_warning=stop_on_warning,
            ):
                log.error("Structure initialization failed")
                return {"success": False, "error": "Structure initialization failed"}

        # Tally RP from TBA
        rp_tally, team_matches_played, team_energized, team_supercharged, team_traversal, played_quals = \
            phase1_tally_rp(tba_data, log)

        # Process scouting entries
        processed_match_entries = phase1_process_scouting(event_key, downloaded_data, log)

        # Accumulate all per-team statistics
        team_stats = phase1_accumulate_team_stats(
            processed_match_entries=processed_match_entries,
            calc_result=calc_result,
            tba_data=tba_data,
            event_key=event_key,
            downloaded_data=downloaded_data,
            rp_tally=rp_tally,
            team_matches_played=team_matches_played,
            team_energized=team_energized,
            team_supercharged=team_supercharged,
            team_traversal=team_traversal,
            log=log,
        )

    # ======================================================================
    # PHASE 2: Inference
    # ======================================================================
    with log.section(f"{Logger.CYAN}-- Phase 2: Inference --{Logger.RESET}"):

        # Match predictions
        match_predictions = phase2_predict_matches(
            calc_result=calc_result,
            tba_data=tba_data,
            sb_data=sb_data,
            team_stats=team_stats,
            log=log,
        )

        # Predicted RP from Statbotics
        rp_predictions = phase2_predict_rp(sb_data, team_stats, log)

    # ======================================================================
    # PHASE 3: Output Building
    # ======================================================================
    with log.section(f"{Logger.CYAN}-- Phase 3: Output Building --{Logger.RESET}"):

        # Rankings
        phase3_build_rankings(calc_result, team_stats, rp_predictions, log)

        # Attach team-level output (shots, fuel, metrics)
        phase3_attach_team_output(calc_result, team_stats)

        # Store fuel output at top level for transform_event_data
        calc_result["team_fuel"] = team_stats["team_fuel_output"]

        # Match pred/post structures
        phase3_build_match_output(calc_result, tba_data, sb_data, match_predictions, log)

        # Next match
        phase3_determine_next_match(calc_result, log)

    # Final DataSchema transform
    with log.section("Transforming into DataSchema"):
        calc_result = transform_event_data(calc_result)
        log.stat("Teams in final output", len(calc_result.get("team", {})))

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
        "metadata": {
            "scouter_name": data.scouter_name
        },
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
        return {}

    n = len(data)

    q1 = statistics.quantiles(data, n=4)[0] if n >= 4 else None
    q3 = statistics.quantiles(data, n=4)[2] if n >= 4 else None

    res = {
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
    return {k: v for k, v in res.items() if v is not None and v != 0}


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