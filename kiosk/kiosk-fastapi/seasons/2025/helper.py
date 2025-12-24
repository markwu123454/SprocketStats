from typing import List, Dict, DefaultDict, Any
from collections import defaultdict, Counter

def extract_team_metrics(records: List[Any]) -> Dict[str, Dict[str, Any]]:
    """
    Aggregates Tier 3 (preferred branches, auto scoring),
    Tier 4 (boolean scoring capabilities),
    and Tier 5 (driver skill)
    into one set of metrics per team.
    Works directly on asyncpg.Record rows.
    """
    team_data: DefaultDict[str, Dict[str, Any]] = defaultdict(lambda: {
        "Barge Scoring": False,
        "Processor Scoring": False,
        "Coral Scoring": False,
        "Driver skill sum": 0,
        "Driver skill count": 0,
        "branch_hits": Counter(),
        "branch_attempts": Counter(),
        "auto_scoring": Counter()
    })

    for rec in records:
        team = str(rec["team"])
        d = rec["data"]
        auto, teleop, post = d.get("auto", {}), d.get("teleop", {}), d.get("postmatch", {})

        # ===== Tier 4: scoring capabilities =====
        if (auto.get("barge", 0) + teleop.get("barge", 0)) > 0:
            team_data[team]["Barge Scoring"] = True
        if (auto.get("processor", 0) + teleop.get("processor", 0)) > 0:
            team_data[team]["Processor Scoring"] = True
        coral_total = (
            auto.get("l1", 0) + teleop.get("l1", 0)
            + auto.get("l2", 0) + teleop.get("l2", 0)
            + auto.get("l3", 0) + teleop.get("l3", 0)
            + auto.get("l4", 0) + teleop.get("l4", 0)
        )
        if coral_total > 0:
            team_data[team]["Coral Scoring"] = True

        # ===== Tier 5: driver skill =====
        skill = post.get("skill")
        if isinstance(skill, (int, float)) and skill > 0:
            team_data[team]["Driver skill sum"] += skill
            team_data[team]["Driver skill count"] += 1

        # ===== Tier 3: branch & auto data =====
        for phase in ("auto", "teleop"):
            branch_data = d.get(phase, {}).get("branchPlacement", {})
            for branch, levels in branch_data.items():
                attempts = sum(1 for v in levels.values() if v is not None)
                hits = sum(1 for v in levels.values() if v)
                if attempts > 0:
                    team_data[team]["branch_attempts"][branch] += attempts
                    team_data[team]["branch_hits"][branch] += hits

        for lvl in ("l1", "l2", "l3", "l4", "barge", "processor"):
            team_data[team]["auto_scoring"][lvl] += auto.get(lvl, 0)

    # ===== Final aggregation =====
    result = {}
    for team, vals in team_data.items():
        count = vals["Driver skill count"]
        avg_skill = vals["Driver skill sum"] / count if count else 0

        top_freq = [b for b, _ in vals["branch_hits"].most_common(3)]
        accuracies = {
            b: vals["branch_hits"][b] / vals["branch_attempts"][b]
            for b in vals["branch_attempts"] if vals["branch_attempts"][b] > 0
        }
        top_accu = [b for b, _ in sorted(accuracies.items(), key=lambda x: x[1], reverse=True)[:3]]

        auto_summary = {lvl.upper(): n for lvl, n in vals["auto_scoring"].items() if n > 0}
        auto_str = ", ".join(f"{lvl}: {n}" for lvl, n in auto_summary.items()) if auto_summary else "None"

        result[team] = {
            "Barge Scoring": "Yes" if vals["Barge Scoring"] else "No",
            "Processor Scoring": "Yes" if vals["Processor Scoring"] else "No",
            "Coral Scoring": "Yes" if vals["Coral Scoring"] else "No",
            "Driver skill": round(avg_skill, 2),
            "Preferred Branch(freq)": ", ".join(top_freq) if top_freq else "None",
            "Preferred Branch(accu)": ", ".join(top_accu) if top_accu else "None",
            "Auto Scoring": auto_str,
        }

    return result
