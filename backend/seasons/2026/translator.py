import random
from typing import TypedDict, Any, Dict, List, Union, Optional
import enums

# TODO: still from reefscape, everything need to change

# ============================================================
# Input and Output Data Structures
# ============================================================

class RawData(TypedDict, total=False):
    """Schema of a single record from db.get_processed_data()."""
    team: int
    rank_auto: float
    rank_teleop: float
    rank_endgame: float
    avg_score: float
    score_stddev: float
    fault_rate: float
    timeline: List[Dict[str, Any]]
    # add other raw fields as needed


class RankingData(TypedDict, total=False):
        rp: List[int]


# ============================================================
# Team Sub-structures
# ============================================================

class TeamBasicInfo(TypedDict, total=False):
    tags: List[str]


class TeamRankingData(TypedDict, total=False):
    auto: float
    teleop: float
    endgame: float
    rp: float
    rp_pred: float
    rp_avg: float
    rp_avg_pred: float


class TeamMetricsData(TypedDict, total=False):
    """Arbitrary string-based metrics for display"""
    Average_Score: str
    Score_StdDev: str
    Score_Consistency: str
    Kmeans_Cluster: str
    KMeans_Ranking: str
    Climb_Success_Percent: str
    Fault_Rate_Percent: str
    Auto_StdDev: str
    Teleop_StdDev: str
    Aggregate_ELO: str
    Team_ELO: str
    Preferred_Branch_freq: str
    Preferred_Branch_accu: str
    Driver_skill: str
    Avg_Climb_Speed_Succeed: str
    Avg_Climb_Speed_All: str
    Preferred_cage_set: str
    Ground_intake_Coral: str
    Ground_intake_Algae: str
    Station_intake_Coral: str
    Reef_intake_Algae: str
    Barge_Scoring: str
    Processor_Scoring: str
    Coral_Scoring: str
    Auto_Scoring: str
    Auto_Intake: str
    Current_Record: str
    Predicted_Record: str


class TeamMatchEntry(TypedDict, total=False):
    match: str
    alliance: str
    own_alliance: List[int]
    opp_alliance: List[int]
    own_score: int
    opp_score: int
    result: str
    auto_Points: int
    teleop_Points: int
    endgame_Points: int
    rp_Earned: int


class TeamBreakdownNode(TypedDict, total=False):
    id: str
    label: str
    value: Union[int, float, None]
    children: List["TeamBreakdownNode"]


class TeamTimelineEntry(TypedDict, total=False):
    match: str
    auto: float
    teleop: float
    endgame: float

class RPAspectEntry(TypedDict, total=False):
    """Subfields of a single RP category (booleans, numbers, etc.)."""
    # flexible field values
    Move: bool
    Score: bool
    L1: int
    L2: int
    L3: int
    L4: int
    Processor: bool
    Climb: str


class TeamRPData(TypedDict, total=False):
    """Grouped RP breakdowns by point category."""
    Auto: RPAspectEntry
    Coral: RPAspectEntry
    Barge: RPAspectEntry


# ============================================================
# Team Main Structure
# ============================================================

class TeamData(TypedDict, total=False):
    """Schema matching the placeholder structure used in the frontend."""
    basic: TeamBasicInfo
    ranking: TeamRankingData
    metrics: Dict[str, str]
    rp: Dict[str, TeamRPData]
    matches: List[TeamMatchEntry]
    breakdown: TeamBreakdownNode
    timeline: List[TeamTimelineEntry]


# ============================================================
# Match Main Structure
# ============================================================


class MatchData(TypedDict, total=False):
    placeholder: str


# ============================================================
# Alliance Sub-Structures
# ============================================================


class AllianceMatchInfo(TypedDict, total=False):
    """Per-match alliance performance and results."""
    alliance_color: str                # "Red" | "Blue"
    opponent_color: str                # "Blue" | "Red"
    own_score: float
    opp_score: float
    result: str                        # "W" | "L" | "T"
    rp_earned: List[int]               # list of RP types earned (e.g., [1,3])
    played: bool                       # True if actual match completed
    match_type: str                    # "QM", "QF", "SF", "F"
    match_number: int


class AllianceModelOutput(TypedDict, total=False):
    """Placeholder for decision-tree / random-forest output."""
    model_type: str                    # e.g., "RandomForest"
    win_probability: float
    predicted_rp: Dict[str, float]     # e.g., {"auto":0.8,"teleop":0.6,"climb":0.7}
    feature_importance: Dict[str, float]
    notes: str


# ============================================================
# Alliance Main Structure
# ============================================================


class AllianceData(TypedDict, total=False):
    """Alliance-level summary + match-level results + ML predictions."""
    average_score: float
    score_stddev: float
    consistency: float
    fault_rate: float

    # Keyed by match identifier, e.g. "QM1", "QM2"
    qm_matches: Dict[str, AllianceMatchInfo]

    # Most recently played match number, and partition of matches
    last_played: Optional[str]
    past_matches: List[str]
    predicted_matches: List[str]

    # Optional model output (decision tree / random forest)
    model_analysis: Optional[AllianceModelOutput]


class Data(TypedDict, total=False):
    """Schema returned to the frontend after translation."""
    ranking: RankingData
    team: Dict[int, TeamData]
    match: Dict[str, MatchData]
    Alliance: AllianceData


# ============================================================
# Translator Function
# ============================================================

def generate_sample_data(entry: RawData) -> Data:
        teams = [3473, 3476, 118, 10118, 2910, 1690, 1323, 4414, 5199, 4415, 2056, 148, 1678, 254, 6995, 6800, 4481,
                 968]
        matches = ["QM1", "QM2", "QM3", "QM4"]
        climb_types = ["None", "Park", "Shallow", "Deep"]

        data: Data = {
            "ranking": {"rp": [random.randint(0, 4) for _ in range(2)]},
            "team": {},
            "match": {},
            "Alliance": {
                "average_score": round(random.uniform(80, 130), 2),
                "score_stddev": round(random.uniform(5, 15), 2),
                "consistency": round(random.uniform(85, 98), 2),
                "fault_rate": round(random.uniform(0, 10), 2),
                "qm_matches": {},
                "last_played": random.choice(matches),
                "past_matches": ["QM1"],
                "predicted_matches": ["QM2"],
                "model_analysis": {
                    "model_type": "RandomForest",
                    "win_probability": round(random.uniform(0.4, 0.9), 2),
                    "predicted_rp": {
                        "auto": round(random.uniform(0.4, 1.0), 2),
                        "coral": round(random.uniform(0.4, 1.0), 2),
                        "barge": round(random.uniform(0.4, 1.0), 2),
                    },
                    "feature_importance": {
                        "auto_points": 0.3,
                        "teleop_points": 0.4,
                        "climb_points": 0.3,
                    },
                    "notes": "Simulated data",
                },
            },
        }

        for team in teams:
            # --- Generate per-match RP sets ---
            rp_by_match: Dict[str, TeamRPData] = {}
            for m in matches:
                rp_by_match[m] = {
                    "Auto": {
                        "Move": random.choice([True, False]),
                        "Score": random.choice([True, False]),
                    },
                    "Coral": {
                        "L1": random.randint(0, 5),
                        "L2": random.randint(0, 5),
                        "L3": random.randint(0, 5),
                        "L4": random.randint(0, 5),
                        "Processor": random.choice([True, False]),
                    },
                    "Barge": {
                        "Climb": random.choice(climb_types),
                    },
                }

            data["team"][team] = {
                "basic": {"tags": ["High Auto", "Reliable", "Fast Climb"]},
                "ranking": {
                    "auto": round(random.uniform(1, 5), 2),
                    "teleop": round(random.uniform(1, 5), 2),
                    "endgame": round(random.uniform(1, 5), 2),
                    "rp": round(random.uniform(1, 4), 2),
                    "rp_pred": round(random.uniform(1, 4), 2),
                    "rp_avg": round(random.uniform(1, 3), 2),
                    "rp_avg_pred": round(random.uniform(1, 3), 2),
                },
                "rp": rp_by_match,  # ✅ per-match RP sets
                "metrics": {
                    "Average_Score": f"{round(random.uniform(70, 120), 2)}",
                    "Score_StdDev": f"{round(random.uniform(5, 15), 2)}",
                    "Fault_Rate_Percent": f"{round(random.uniform(0, 10), 2)}%",
                },
                "matches": [
                    {
                        "match": m,
                        "alliance": random.choice(["Red", "Blue"]),
                        "own_alliance": random.sample(teams, 3),
                        "opp_alliance": random.sample(teams, 3),
                        "own_score": random.randint(100, 250),
                        "opp_score": random.randint(100, 250),
                        "result": random.choice(["W", "L"]),
                        "auto_Points": random.randint(20, 60),
                        "teleop_Points": random.randint(50, 90),
                        "endgame_Points": random.randint(0, 20),
                        "rp_Earned": random.randint(0, 4),
                    }
                    for m in matches
                ],
                "breakdown": {
                "id": "root",
                "label": "Score Breakdown",
                "children": [
                    {
                        "id": "auto",
                        "label": "Auto",
                        "children": [
                            {
                                "id": "auto_coral",
                                "label": "Coral",
                                "children": [
                                    {"id": "auto_l1", "label": "L1", "value": random.randint(2, 8)},
                                    {"id": "auto_l2", "label": "L2", "value": random.randint(4, 10)},
                                    {"id": "auto_l3", "label": "L3", "value": random.randint(6, 12)},
                                    {"id": "auto_l4", "label": "L4", "value": random.randint(8, 15)},
                                ],
                            },
                            {
                                "id": "auto_move",
                                "label": "Move",
                                "value": random.randint(5, 15),
                            },
                        ],
                    },
                    {
                        "id": "teleop",
                        "label": "Teleop",
                        "children": [
                            {
                                "id": "teleop_coral",
                                "label": "Coral",
                                "children": [
                                    {"id": "teleop_l1", "label": "L1", "value": random.randint(4, 10)},
                                    {"id": "teleop_l2", "label": "L2", "value": random.randint(6, 12)},
                                    {"id": "teleop_l3", "label": "L3", "value": random.randint(8, 14)},
                                    {"id": "teleop_l4", "label": "L4", "value": random.randint(10, 16)},
                                ],
                            },
                        ],
                    },
                    {
                        "id": "endgame",
                        "label": "Endgame",
                        "children": [{"id": "climb", "label": "Climb", "value": random.randint(10, 30)}],
                    },
                ],
            },
                "timeline": [
                    {
                        "match": m,
                        "auto": random.randint(3, 30),
                        "teleop": random.randint(10, 60),
                        "endgame": random.randint(0, 12),
                    }
                    for m in matches
                ],
            }

        for match in matches:
            data["match"][match] = {"placeholder": f"Sample data for {match}"}
            data["Alliance"]["qm_matches"][match] = {
                "alliance_color": random.choice(["Red", "Blue"]),
                "opponent_color": random.choice(["Red", "Blue"]),
                "own_score": random.randint(80, 130),
                "opp_score": random.randint(70, 120),
                "result": random.choice(["W", "L"]),
                "rp_earned": [random.randint(0, 1) for _ in range(3)],
                "played": match == "QM1",
                "match_type": "QM",
                "match_number": int(match.replace("QM", "")),
            }

        return data


if __name__ == "__main__":
    from pprint import pprint
    pprint(generate_sample_data(None))