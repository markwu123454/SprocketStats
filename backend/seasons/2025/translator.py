import random
from typing import TypedDict, Any, Dict, List, Union, Optional
import enums

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
    autoPoints: int
    teleopPoints: int
    endgamePoints: int
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


# ============================================================
# Team Main Structure
# ============================================================

class TeamData(TypedDict, total=False):
    """Schema matching the placeholder structure used in the frontend."""
    basic: TeamBasicInfo
    ranking: TeamRankingData
    metrics: Dict[str, str]
    rp: Dict[str, str]
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
    teams = [3473, 3476]
    matches = ["QM1", "QM2"]

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
                    "auto": round(random.uniform(0.5, 1.0), 2),
                    "teleop": round(random.uniform(0.5, 1.0), 2),
                    "climb": round(random.uniform(0.5, 1.0), 2),
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
        data["team"][team] = {
            "basic": {
                "tags": ["High Auto", "Reliable", "Fast Climb"],
            },
            "ranking": {
                "auto": round(random.uniform(1, 5), 2),
                "teleop": round(random.uniform(1, 5), 2),
                "endgame": round(random.uniform(1, 5), 2),
                "rp": round(random.uniform(1, 4), 2),
                "rp_pred": round(random.uniform(1, 4), 2),
                "rp_avg": round(random.uniform(1, 3), 2),
                "rp_avg_pred": round(random.uniform(1, 3), 2),
            },
            "metrics": {
                "Average_Score": f"{round(random.uniform(70, 120), 2)}",
                "Score_StdDev": f"{round(random.uniform(5, 15), 2)}",
                "Fault_Rate_Percent": f"{round(random.uniform(0, 10), 2)}%",
            },
            "matches": [
                {
                    "match": "QM1",
                    "alliance": "Red",
                    "own_alliance": [3473, 6800, 4499],
                    "opp_alliance": [1323, 971, 4414],
                    "own_score": 143,
                    "opp_score": 247,
                    "result": "W",
                    "autoPoints": 45,
                    "teleopPoints": 75,
                    "endgamePoints": 12,
                    "rp_Earned": 4,
                },
                {
                    "match": "QM2",
                    "alliance": "Blue",
                    "own_alliance": [3473, 148, 6995],
                    "opp_alliance": [3476, 118, 10118],
                    "own_score": 143,
                    "opp_score": 186,
                    "result": "L",
                    "autoPoints": 30,
                    "teleopPoints": 60,
                    "endgamePoints": 14,
                    "rp_Earned": 1,
                },
                {
                    "match": "QM3",
                    "alliance": "Red",
                    "own_alliance": [3473, 968, 2056],
                    "opp_alliance": [5857, 971, 4415],
                    "own_score": 232,
                    "opp_score": 123,
                    "result": "W",
                    "autoPoints": 42,
                    "teleopPoints": 70,
                    "endgamePoints": 7,
                    "rp_Earned": 4,
                },
                {
                    "match": "QF1",
                    "alliance": "Blue",
                    "own_alliance": [3473, 254, 1678],
                    "opp_alliance": [2910, 5199, 4481],
                    "own_score": 213,
                    "opp_score": 256,
                    "result": "W",
                    "autoPoints": 47,
                    "teleopPoints": 78,
                    "endgamePoints": 12,
                    "rp_Earned": 4,
                },
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
                                "id": "auto_algae",
                                "label": "Algae",
                                "children": [
                                    {"id": "auto_processor", "label": "Processor", "value": random.randint(5, 10)},
                                    {"id": "auto_net", "label": "Net", "value": random.randint(3, 8)},
                                ],
                            },
                            {"id": "auto_move", "label": "Move", "value": random.randint(5, 15)},
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
                            {
                                "id": "teleop_algae",
                                "label": "Algae",
                                "children": [
                                    {"id": "teleop_processor", "label": "Processor", "value": random.randint(5, 12)},
                                    {"id": "teleop_net", "label": "Net", "value": random.randint(4, 10)},
                                ],
                            },
                        ],
                    },
                    {
                        "id": "endgame",
                        "label": "Endgame",
                        "children": [
                            {"id": "climb", "label": "Climb", "value": random.randint(10, 30)},
                        ],
                    },
                ],
            },
            "timeline": [
                {"match": "QM1", "auto": 32.5, "teleop": 55.1, "endgame": 12.4},
                {"match": "QM2", "auto": 28.9, "teleop": 60.3, "endgame": 18.8},
            ],
        }

    for match in matches:
        data["match"][match] = {
            "placeholder": f"Sample data for {match}"
        }
        data["Alliance"]["qm_matches"][match] = {
            "alliance_color": random.choice(["Red", "Blue"]),
            "opponent_color": "Red" if random.choice(["Red", "Blue"]) == "Blue" else "Blue",
            "own_score": random.randint(80, 130),
            "opp_score": random.randint(70, 120),
            "result": random.choice(["W", "L"]),
            "rp_earned": [random.randint(1, 3)],
            "played": match == "QM1",
            "match_type": "QM",
            "match_number": int(match.replace("QM", "")),
        }

    return data

if __name__ == "__main__":
    from pprint import pprint
    pprint(generate_sample_data(None))