import type * as DataTypes from '@/types/data';
import type {MatchScoutingData, PitScoutingData} from "@/types";


export function processScoutingData(raw: DataTypes.RawData): {
    team: DataTypes.TeamDataMap;
    match: DataTypes.MatchDataMap;
} {
    const teamMap: DataTypes.TeamDataMap = new Map();
    const matchMap: DataTypes.MatchDataMap = new Map();

    for (const pit of raw.pitScouting) {
        teamMap.set(pit.team, {
            pit,
            matches: [],
            accuracy: {
                auton: { l1: 0, l2: 0, l3: 0, l4: 0, algae: 0 },
                teleop: { l1: 0, l2: 0, l3: 0, l4: 0, algae: 0 },
            },
        });
    }

    for (const match of raw.matchScouting) {
        const key = `${match.match_type}-${match.match}`;
        matchMap.set(key, match);

        if (match.teamNumber != null) {
            const team = teamMap.get(match.teamNumber);
            if (team) team.matches.push(match);
        }
    }

    for (const team of teamMap.values()) {
        team.accuracy.auton = computeAccuracy(team.matches, "auto");
        team.accuracy.teleop = computeAccuracy(team.matches, "teleop");
    }

    return { team: teamMap, match: matchMap };
}



function computeAccuracy(
    matches: MatchScoutingData[],
    phase: "auto" | "teleop"
): DataTypes.AccuracyMetrics {
    let made = { l1: 0, l2: 0, l3: 0, l4: 0 };
    let missed = { l1: 0, l2: 0, l3: 0, l4: 0, missAlgae: 0 };
    let barge = 0;

    for (const match of matches) {
        const p = match[phase];

        made.l1 += p.l1;
        made.l2 += Object.values(p.branchPlacement).filter(x => x.l2).length;
        made.l3 += Object.values(p.branchPlacement).filter(x => x.l3).length;
        made.l4 += Object.values(p.branchPlacement).filter(x => x.l4).length;

        missed.l1 += p.missed.l1;
        missed.l2 += p.missed.l2;
        missed.l3 += p.missed.l3;
        missed.l4 += p.missed.l4;
        missed.missAlgae += p.missAlgae;
    }

    return {
        l1: made.l1 / Math.max(made.l1 + missed.l1, 1),
        l2: made.l2 / Math.max(made.l2 + missed.l2, 1),
        l3: made.l3 / Math.max(made.l3 + missed.l3, 1),
        l4: made.l4 / Math.max(made.l4 + missed.l4, 1),
        algae: barge / Math.max(barge + missed.missAlgae, 1),
    };
}
