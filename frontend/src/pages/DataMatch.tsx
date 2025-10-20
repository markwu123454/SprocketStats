import React, {useMemo, useState} from "react"
import {Navigate, useParams} from "react-router-dom"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select.tsx";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from "recharts";
import {CircleArrowUp, CircleArrowDown, CircleEqual} from "lucide-react"
import type {MatchAllianceData} from "@/types";
import {useLargeData} from "@/contexts/dataProvider.tsx";


const COLOR_PALETTE = [
    "#4E79A7", // muted blue
    "#F28E2B", // orange
    "#E15759", // red
    "#76B7B2", // teal
    "#59A14F", // green
    "#EDC948", // yellow
    "#B07AA1", // purple
    "#FF9DA7", // pink
    "#9C755F", // brown
    "#BAB0AC", // gray
    "#4E79A7", // muted blue
    "#F28E2B", // orange
    "#E15759", // red
    "#76B7B2", // teal
    "#59A14F", // green
    "#EDC948", // yellow
    "#B07AA1", // purple
    "#FF9DA7", // pink
    "#9C755F", // brown
    "#BAB0AC", // gray
];

const totalTeam = 75

export const GRAPH_OPTIONS = [
    "Score Breakdown Norm.",
    "Score Breakdown Abs.",
    "Strength Map",
] as const;

export type GraphType = typeof GRAPH_OPTIONS[number];


export default function MatchDetailPage() {
    const {matchType, matchNumStr} = useParams<{ matchType: string; matchNumStr: string }>()
    if (!matchType || !matchNumStr || isNaN(Number(matchNumStr))) return <Navigate to="/404"/>;
    const matchNum = Number(matchNumStr);

    const [graphType, setGraphType] = useState<GraphType>("Strength Map")

    const data = useLargeData()
    const current_match_data = data["match_data"][matchType][matchNum]
    console.log(data)
    const red_teams = (
        Object.keys(current_match_data["red"])
            .map(Number)
            .slice(0, 3)
            .concat([0, 0, 0])
            .slice(0, 3)
    ) as [number, number, number];
    const blue_teams = (
        Object.keys(current_match_data["blue"])
            .map(Number)
            .slice(0, 3)
            .concat([0, 0, 0])
            .slice(0, 3)
    ) as [number, number, number];

    console.log(data["team_data"][blue_teams[0]])
    const TEMPDATA: MatchAllianceData = {
        scheduledTime: 1754358600000,

        red: {
            teams: red_teams,
            AIPredictedScore: 128,
            HeuristicPredictedScore: 120,
            actualScore: 127,
            calculatedScore: 127,
            teamData: {
                [red_teams[0]]: {
                    summary: [
                        {label: "Auton", summary: 20, reliability: 88, unit: "pt"},
                        {label: "Coral", summary: 7.1, reliability: 83, unit: "cycles"},
                        {label: "Algae", summary: 2.5, reliability: 60, unit: "cycles"},
                        {label: "Climb", summary: 4, reliability: 99, unit: "pt"},
                    ],
                    capabilities: [
                        {label: "Ground Intake", enabled: "yes"},
                        {label: "Station Intake", enabled: "yes"},
                        {label: "Full Auto", enabled: "yes"},
                        {label: "4 Piece Auto", enabled: "yes"},
                        {label: "Defense", enabled: "no"},
                        {label: "Deep Climb", enabled: "yes"},
                        {label: "Barge Scoring", enabled: "no"},
                        {label: "Algae Ground Intake", enabled: "yes"},
                        {label: "L4 Coral", enabled: "yes"},
                    ],
                    rankings: [
                        {
                            label: "Overall",
                            rank: data["team_data"][red_teams[0]]["ranking"]["overall"],
                            percentile: data["team_data"][red_teams[0]]["ranking_pct"]["overall"]
                        },
                        {
                            label: "Auton",
                            rank: data["team_data"][red_teams[0]]["ranking"]["auto"],
                            percentile: data["team_data"][red_teams[0]]["ranking_pct"]["auto"]
                        },
                        {
                            label: "Coral",
                            rank: data["team_data"][red_teams[0]]["ranking"]["teleop_coral"],
                            percentile: data["team_data"][red_teams[0]]["ranking_pct"]["teleop_coral"]
                        },
                        {
                            label: "Algae",
                            rank: data["team_data"][red_teams[0]]["ranking"]["teleop_algae"],
                            percentile: data["team_data"][red_teams[0]]["ranking_pct"]["teleop_algae"]
                        },
                        {
                            label: "Climb",
                            rank: data["team_data"][red_teams[0]]["ranking"]["climb"],
                            percentile: data["team_data"][red_teams[0]]["ranking_pct"]["climb"]
                        },
                    ],
                    matches: [
                        {
                                match: "Q15", result: "W", score: 126, pred_ai: 120, pred_heur: 115, pred_elo: 122,
                            teammates: [973, 1690, 1323], opponents: [254, 118, 192],
                        },
                        {
                            match: "Q08", result: "W", score: 110, pred_ai: 112, pred_heur: 108, pred_elo: 110,
                            teammates: [1323, 1690, 2910], opponents: [973, 4414, 1678],
                        },
                    ],
                    metrics: {
                        auto: current_match_data["red"][red_teams[0]]["score_actions"]["auto"]["total"],
                        teleop_coral: current_match_data["red"][red_teams[0]]["score_actions"]["teleop"]["coral_cycle"],
                        teleop_algae: current_match_data["red"][red_teams[0]]["score_actions"]["teleop"]["algae_cycle"],
                        climb: current_match_data["red"][red_teams[0]]["score_actions"]["climb"]
                    },
                    scoring: {
                        auto: current_match_data["red"][red_teams[0]]["score_breakdown"]["auto"]["total"],
                        teleop_algae: current_match_data["red"][red_teams[0]]["score_breakdown"]["teleop"]["algae"],
                        teleop_coral: current_match_data["red"][red_teams[0]]["score_breakdown"]["teleop"]["coral"],
                        endgame: current_match_data["red"][red_teams[0]]["score_breakdown"]["climb"]
                    },
                },

                [red_teams[1]]: {
                    rank: 4,
                    logoUrl: "/logos/111.png",
                    nickname: "HighTide",
                    capabilities: [
                        {label: "Ground Intake", enabled: "yes"},
                        {label: "Station Intake", enabled: "yes"},
                        {label: "Full Auto", enabled: "yes"},
                        {label: "4 Piece Auto", enabled: "not demonstrated"},
                        {label: "Defense", enabled: "not demonstrated"},
                        {label: "Deep Climb", enabled: "no"},
                        {label: "Barge Scoring", enabled: "yes"},
                        {label: "Algae Ground Intake", enabled: "no"},
                        {label: "L4 Coral", enabled: "yes"},
                    ],
                    rankings: [
                        {
                            label: "Overall",
                            rank: data["team_data"][red_teams[1]]["ranking"]["overall"],
                            percentile: data["team_data"][red_teams[1]]["ranking_pct"]["overall"]
                        },
                        {
                            label: "Auton",
                            rank: data["team_data"][red_teams[1]]["ranking"]["auto"],
                            percentile: data["team_data"][red_teams[1]]["ranking_pct"]["auto"]
                        },
                        {
                            label: "Coral",
                            rank: data["team_data"][red_teams[1]]["ranking"]["teleop_coral"],
                            percentile: data["team_data"][red_teams[1]]["ranking_pct"]["teleop_coral"]
                        },
                        {
                            label: "Algae",
                            rank: data["team_data"][red_teams[1]]["ranking"]["teleop_algae"],
                            percentile: data["team_data"][red_teams[1]]["ranking_pct"]["teleop_algae"]
                        },
                        {
                            label: "Climb",
                            rank: data["team_data"][red_teams[1]]["ranking"]["climb"],
                            percentile: data["team_data"][red_teams[1]]["ranking_pct"]["climb"]
                        },
                    ],
                    matches: [
                        {
                            match: "Q25",
                            result: "W",
                            score: 132,
                            pred_ai: 128,
                            pred_heur: 120, pred_elo: 122,
                            teammates: [254, 973, 4414],
                            opponents: [1678, 118, 2910],
                        },
                        {
                            match: "Q25",
                            result: "W",
                            score: 132,
                            pred_ai: 128,
                            pred_heur: 120, pred_elo: 122,
                            teammates: [254, 973, 4414],
                            opponents: [1678, 118, 2910],
                        },
                        {
                            match: "Q25",
                            result: "W",
                            score: 132,
                            pred_ai: 128,
                            pred_heur: 120, pred_elo: 122,
                            teammates: [254, 973, 4414],
                            opponents: [1678, 118, 2910],
                        },
                        {
                            match: "Q25",
                            result: "W",
                            score: 132,
                            pred_ai: 128,
                            pred_heur: 120, pred_elo: 122,
                            teammates: [254, 973, 4414],
                            opponents: [1678, 118, 2910],
                        },
                        {
                            match: "Q25",
                            result: "W",
                            score: 132,
                            pred_ai: 128,
                            pred_heur: 120, pred_elo: 122,
                            teammates: [254, 973, 4414],
                            opponents: [1678, 118, 2910],
                        },
                        {
                            match: "Q18",
                            result: "L",
                            score: 86,
                            pred_ai: 94,
                            pred_heur: 86, pred_elo: 96,
                            teammates: [973, 1323, 4414],
                            opponents: [2910, 1671, 192],
                        },
                        {
                            match: "Q12",
                            result: "W",
                            score: 115,
                            pred_ai: 110,
                            pred_heur: 102, pred_elo: 114,
                            teammates: [973, 1678, 4414],
                            opponents: [254, 118, 192],
                        },
                    ],
                    metrics: {
                        auto: current_match_data["red"][red_teams[1]]["score_actions"]["auto"]["total"],
                        teleop_coral: current_match_data["red"][red_teams[1]]["score_actions"]["teleop"]["coral_cycle"],
                        teleop_algae: current_match_data["red"][red_teams[1]]["score_actions"]["teleop"]["algae_cycle"],
                        climb: current_match_data["red"][red_teams[1]]["score_actions"]["climb"]
                    },
                    scoring: {
                        auto: current_match_data["red"][red_teams[1]]["score_breakdown"]["auto"]["total"],
                        teleop_algae: current_match_data["red"][red_teams[1]]["score_breakdown"]["teleop"]["algae"],
                        teleop_coral: current_match_data["red"][red_teams[1]]["score_breakdown"]["teleop"]["coral"],
                        endgame: current_match_data["red"][red_teams[1]]["score_breakdown"]["climb"]
                    },
                },

                [red_teams[2]]: {
                    rank: 7,
                    logoUrl: "/logos/118.png",
                    nickname: "Robonauts",
                    summary: [
                        {label: "Auton", summary: 17, reliability: 91, unit: "pt"},
                        {label: "Coral", summary: 6.9, reliability: 83, unit: "cycles"},
                        {label: "Algae", summary: 3.3, reliability: 78, unit: "cycles"},
                        {label: "Climb", summary: 5.5, reliability: 84, unit: "pt"},
                    ],
                    rankings: [
                        {
                            label: "Overall",
                            rank: data["team_data"][red_teams[2]]["ranking"]["overall"],
                            percentile: data["team_data"][red_teams[2]]["ranking_pct"]["overall"]
                        },
                        {
                            label: "Auton",
                            rank: data["team_data"][red_teams[2]]["ranking"]["auto"],
                            percentile: data["team_data"][red_teams[2]]["ranking_pct"]["auto"]
                        },
                        {
                            label: "Coral",
                            rank: data["team_data"][red_teams[2]]["ranking"]["teleop_coral"],
                            percentile: data["team_data"][red_teams[2]]["ranking_pct"]["teleop_coral"]
                        },
                        {
                            label: "Algae",
                            rank: data["team_data"][red_teams[2]]["ranking"]["teleop_algae"],
                            percentile: data["team_data"][red_teams[2]]["ranking_pct"]["teleop_algae"]
                        },
                        {
                            label: "Climb",
                            rank: data["team_data"][red_teams[2]]["ranking"]["climb"],
                            percentile: data["team_data"][red_teams[2]]["ranking_pct"]["climb"]
                        },
                    ],
                    matches: [
                        {
                            match: "Q14", result: "W", score: 121, pred_ai: 119, pred_heur: 116, pred_elo: 100,
                            teammates: [118, 1323, 4414], opponents: [254, 973, 1671],
                        },
                        {
                            match: "Q09", result: "L", score: 98, pred_ai: 100, pred_heur: 92, pred_elo: 122,
                            teammates: [118, 1678, 192], opponents: [2910, 973, 1690],
                        },
                    ],
                    metrics: {
                        auto: current_match_data["red"][red_teams[2]]["score_actions"]["auto"]["total"],
                        teleop_coral: current_match_data["red"][red_teams[2]]["score_actions"]["teleop"]["coral_cycle"],
                        teleop_algae: current_match_data["red"][red_teams[2]]["score_actions"]["teleop"]["algae_cycle"],
                        climb: current_match_data["red"][red_teams[2]]["score_actions"]["climb"]
                    },
                    scoring: {
                        auto: current_match_data["red"][red_teams[2]]["score_breakdown"]["auto"]["total"],
                        teleop_algae: current_match_data["red"][red_teams[2]]["score_breakdown"]["teleop"]["algae"],
                        teleop_coral: current_match_data["red"][red_teams[2]]["score_breakdown"]["teleop"]["coral"],
                        endgame: current_match_data["red"][red_teams[2]]["score_breakdown"]["climb"]
                    },
                },
            },
        },

        blue: {
            teams: blue_teams,
            AIPredictedScore: 110,
            HeuristicPredictedScore: 129,
            actualScore: 118,
            calculatedScore: 109,
            teamData: {
                [blue_teams[0]]: {
                    rank: 1,
                    logoUrl: "/logos/2910.png",
                    nickname: "Jack in the Bot",
                    summary: [
                        {label: "Auton", summary: 19, reliability: 93, unit: "pt"},
                        {label: "Coral", summary: 6.9, reliability: 87, unit: "cycles"},
                        {label: "Algae", summary: 3.2, reliability: 90, unit: "cycles"},
                        {label: "Climb", summary: 4.5, reliability: 82, unit: "pt"},
                    ],
                    capabilities: [
                        {label: "Ground Intake", enabled: "yes"},
                        {label: "Station Intake", enabled: "yes"},
                        {label: "Full Auto", enabled: "yes"},
                        {label: "4 Piece Auto", enabled: "yes"},
                        {label: "Defense", enabled: "no"},
                        {label: "Deep Climb", enabled: "no"},
                        {label: "Barge Scoring", enabled: "yes"},
                        {label: "Algae Ground Intake", enabled: "yes"},
                        {label: "L4 Coral", enabled: "yes"},
                    ],
                    rankings: [
                        {
                            label: "Overall",
                            rank: data["team_data"][blue_teams[0]]["ranking"]["overall"],
                            percentile: data["team_data"][blue_teams[0]]["ranking_pct"]["overall"]
                        },
                        {
                            label: "Auton",
                            rank: data["team_data"][blue_teams[0]]["ranking"]["auto"],
                            percentile: data["team_data"][blue_teams[0]]["ranking_pct"]["auto"]
                        },
                        {
                            label: "Coral",
                            rank: data["team_data"][blue_teams[0]]["ranking"]["teleop_coral"],
                            percentile: data["team_data"][blue_teams[0]]["ranking_pct"]["teleop_coral"]
                        },
                        {
                            label: "Algae",
                            rank: data["team_data"][blue_teams[0]]["ranking"]["teleop_algae"],
                            percentile: data["team_data"][blue_teams[0]]["ranking_pct"]["teleop_algae"]
                        },
                        {
                            label: "Climb",
                            rank: data["team_data"][blue_teams[0]]["ranking"]["climb"],
                            percentile: data["team_data"][blue_teams[0]]["ranking_pct"]["climb"]
                        },
                    ],
                    matches: [
                        {
                            match: "Q30", result: "W", score: 135, pred_ai: 130, pred_heur: 125, pred_elo: 137,
                            teammates: [2910, 973, 254], opponents: [1690, 1323, 118],
                        },
                        {
                            match: "Q26", result: "W", score: 124, pred_ai: 121, pred_heur: 119, pred_elo: 122,
                            teammates: [2910, 4414, 192], opponents: [1323, 1678, 973],
                        },
                    ],
                    metrics: {
                        auto: current_match_data["blue"][blue_teams[0]]["score_actions"]["auto"]["total"],
                        teleop_coral: current_match_data["blue"][blue_teams[0]]["score_actions"]["teleop"]["coral_cycle"],
                        teleop_algae: current_match_data["blue"][blue_teams[0]]["score_actions"]["teleop"]["algae_cycle"],
                        climb: current_match_data["blue"][blue_teams[0]]["score_actions"]["climb"]
                    },
                    scoring: {
                        auto: current_match_data["blue"][blue_teams[0]]["score_breakdown"]["auto"]["total"],
                        teleop_algae: current_match_data["blue"][blue_teams[0]]["score_breakdown"]["teleop"]["algae"],
                        teleop_coral: current_match_data["blue"][blue_teams[0]]["score_breakdown"]["teleop"]["coral"],
                        endgame: current_match_data["blue"][blue_teams[0]]["score_breakdown"]["climb"]
                    },
                },

                [blue_teams[1]]: {
                    rank: 2,
                    logoUrl: "/logos/1323.png",
                    nickname: "MadTown Robotics",
                    summary: [
                        {label: "Auton", summary: 17, reliability: 85, unit: "pt"},
                        {label: "Coral", summary: 8.2, reliability: 89, unit: "cycles"},
                        {label: "Algae", summary: 2.7, reliability: 80, unit: "cycles"},
                        {label: "Climb", summary: 5, reliability: 81, unit: "pt"},
                    ],
                    capabilities: [
                        {label: "Ground Intake", enabled: "yes"},
                        {label: "Station Intake", enabled: "yes"},
                        {label: "Full Auto", enabled: "yes"},
                        {label: "4 Piece Auto", enabled: "yes"},
                        {label: "Defense", enabled: "yes"},
                        {label: "Deep Climb", enabled: "not demonstrated"},
                        {label: "Barge Scoring", enabled: "no"},
                        {label: "Algae Ground Intake", enabled: "yes"},
                        {label: "L4 Coral", enabled: "not demonstrated"},
                    ],
                    rankings: [
                        {
                            label: "Overall",
                            rank: data["team_data"][blue_teams[1]]["ranking"]["overall"],
                            percentile: data["team_data"][blue_teams[1]]["ranking_pct"]["overall"]
                        },
                        {
                            label: "Auton",
                            rank: data["team_data"][blue_teams[1]]["ranking"]["auto"],
                            percentile: data["team_data"][blue_teams[1]]["ranking_pct"]["auto"]
                        },
                        {
                            label: "Coral",
                            rank: data["team_data"][blue_teams[1]]["ranking"]["teleop_coral"],
                            percentile: data["team_data"][blue_teams[1]]["ranking_pct"]["teleop_coral"]
                        },
                        {
                            label: "Algae",
                            rank: data["team_data"][blue_teams[1]]["ranking"]["teleop_algae"],
                            percentile: data["team_data"][blue_teams[1]]["ranking_pct"]["teleop_algae"]
                        },
                        {
                            label: "Climb",
                            rank: data["team_data"][blue_teams[1]]["ranking"]["climb"],
                            percentile: data["team_data"][blue_teams[1]]["ranking_pct"]["climb"]
                        },
                    ],
                    matches: [
                        {
                            match: "Q21", result: "W", score: 128, pred_ai: 127, pred_heur: 121, pred_elo: 122,
                            teammates: [1323, 973, 1690], opponents: [254, 118, 192],
                        },
                        {
                            match: "Q16", result: "L", score: 105, pred_ai: 107, pred_heur: 109, pred_elo: 100,
                            teammates: [1323, 254, 973], opponents: [2910, 1671, 192],
                        },
                        {
                            match: "Q30", result: "W", score: 135, pred_ai: 130, pred_heur: 125, pred_elo: 137,
                            teammates: [2910, 973, 254], opponents: [1690, 1323, 118],
                        },
                        {
                            match: "Q26", result: "W", score: 124, pred_ai: 121, pred_heur: 119, pred_elo: 122,
                            teammates: [2910, 4414, 192], opponents: [1323, 1678, 973],
                        },
                        {
                            match: "Q30", result: "W", score: 135, pred_ai: 130, pred_heur: 125, pred_elo: 137,
                            teammates: [2910, 973, 254], opponents: [1690, 1323, 118],
                        },
                        {
                            match: "Q26", result: "W", score: 124, pred_ai: 121, pred_heur: 119, pred_elo: 122,
                            teammates: [2910, 4414, 192], opponents: [1323, 1678, 973],
                        },
                    ],
                    metrics: {
                        auto: current_match_data["blue"][blue_teams[1]]["score_actions"]["auto"]["total"],
                        teleop_coral: current_match_data["blue"][blue_teams[1]]["score_actions"]["teleop"]["coral_cycle"],
                        teleop_algae: current_match_data["blue"][blue_teams[1]]["score_actions"]["teleop"]["algae_cycle"],
                        climb: current_match_data["blue"][blue_teams[1]]["score_actions"]["climb"]
                    },
                    scoring: {
                        auto: current_match_data["blue"][blue_teams[1]]["score_breakdown"]["auto"]["total"],
                        teleop_algae: current_match_data["blue"][blue_teams[1]]["score_breakdown"]["teleop"]["algae"],
                        teleop_coral: current_match_data["blue"][blue_teams[1]]["score_breakdown"]["teleop"]["coral"],
                        endgame: current_match_data["blue"][blue_teams[1]]["score_breakdown"]["climb"]
                    },
                },

                [blue_teams[2]]: {
                    rankings: [
                        {
                            label: "Overall",
                            rank: data["team_data"][blue_teams[2]]["ranking"]["overall"],
                            percentile: data["team_data"][blue_teams[2]]["ranking_pct"]["overall"]
                        },
                        {
                            label: "Auton",
                            rank: data["team_data"][blue_teams[2]]["ranking"]["auto"],
                            percentile: data["team_data"][blue_teams[2]]["ranking_pct"]["auto"]
                        },
                        {
                            label: "Coral",
                            rank: data["team_data"][blue_teams[2]]["ranking"]["teleop_coral"],
                            percentile: data["team_data"][blue_teams[2]]["ranking_pct"]["teleop_coral"]
                        },
                        {
                            label: "Algae",
                            rank: data["team_data"][blue_teams[2]]["ranking"]["teleop_algae"],
                            percentile: data["team_data"][blue_teams[2]]["ranking_pct"]["teleop_algae"]
                        },
                        {
                            label: "Climb",
                            rank: data["team_data"][blue_teams[2]]["ranking"]["climb"],
                            percentile: data["team_data"][blue_teams[2]]["ranking_pct"]["climb"]
                        },
                    ],
                    metrics: {
                        auto: current_match_data["blue"][blue_teams[2]]["score_actions"]["auto"]["total"],
                        teleop_algae: current_match_data["blue"][blue_teams[2]]["score_actions"]["teleop"]["algae_cycle"],
                        teleop_coral: current_match_data["blue"][blue_teams[2]]["score_actions"]["teleop"]["coral_cycle"],
                        climb: current_match_data["blue"][blue_teams[2]]["score_actions"]["climb"]
                    },
                    scoring: {
                        auto: current_match_data["blue"][blue_teams[2]]["score_breakdown"]["auto"]["total"],
                        teleop_algae: current_match_data["blue"][blue_teams[2]]["score_breakdown"]["teleop"]["algae"],
                        teleop_coral: current_match_data["blue"][blue_teams[2]]["score_breakdown"]["teleop"]["coral"],
                        endgame: current_match_data["blue"][blue_teams[2]]["score_breakdown"]["climb"]
                    },
                },
            },
        },
    }


    const getNormalizedAllianceMetrics = (alliance: "red" | "blue") => {
        const teamStats = Object.fromEntries(
            TEMPDATA[alliance].teams
                .map(team => [team, TEMPDATA[alliance].teamData[team]?.metrics])
                .filter(([, score]) => score !== undefined)
        );

        const selected = Object.keys(teamStats).map(Number);
        const metricKeys = Object.keys(Object.values(teamStats)[0] || {});

        return metricKeys.map((metric) => {
            const max = Math.max(...selected.map((id) => teamStats[id]?.[metric] ?? 0)) || 1;

            return Object.fromEntries([
                ["metric", metric.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())],
                ...selected.map((id) => [
                    id.toString(),
                    Math.round(((teamStats[id]?.[metric] ?? 0) / max) * 10000) / 100,
                ]),
            ]);
        });
    };


    const scoreBreakdownDataNormalized = useMemo(() => {
        const getAllianceEntries = (
            alliance: "red" | "blue"
        ): Array<{ team: string; [scoreCategory: string]: number | string }> => {
            return TEMPDATA[alliance].teams.map((id) => ({
                team: `${alliance[0].toUpperCase()}${alliance.slice(1)} ${id}`,
                ...TEMPDATA[alliance].teamData[id]?.scoring,
            }));
        };

        const raw = [...getAllianceEntries("red"), ...getAllianceEntries("blue")];

        const normalized = raw.map((entry) => {
            const total = Object.entries(entry)
                .filter(([k]) => k !== "team")
                .reduce((sum, [, v]) => sum + Number(v), 0);

            const keys = Object.keys(entry).filter((k) => k !== "team");

            // Step 1: Compute unrounded hundredths (e.g., 32.78% → 3278)
            const unrounded = keys.map((k) => ({
                key: k,
                raw: (Number(entry[k]) / total) * 100,
            }));

            const hundredths = unrounded.map((x) => Math.floor(x.raw * 100));
            const sumHundredths = hundredths.reduce((a, b) => a + b, 0);
            let diff = 10000 - sumHundredths;

            // Step 2: Distribute remainder (±1) to highest remainders
            const remainders = unrounded.map((x, i) => ({
                index: i,
                frac: (x.raw * 100) - hundredths[i], // fractional part
            }));

            remainders.sort((a, b) => b.frac - a.frac); // descending

            for (let i = 0; diff > 0; i++, diff--) {
                hundredths[remainders[i].index]++;
            }

            // Step 3: Convert back to 2-digit floats
            const corrected = keys.reduce((acc, k, i) => {
                acc[k] = hundredths[i] / 100;
                return acc;
            }, {} as Record<string, number>);

            return {
                team: entry.team,
                ...corrected,
            };
        });


        const keys =
            normalized.length > 0
                ? Object.keys(normalized[0]).filter((k) => k !== "team")
                : [];

        return {
            data: normalized,
            keys,
        };
    }, []);


    const scoreBreakdownDataAbsolute = useMemo(() => {
        const getAllianceEntries = (
            alliance: "red" | "blue"
        ): Array<{ team: string; [scoreCategory: string]: number | string }> => {
            return TEMPDATA[alliance].teams.map((id) => ({
                team: `${alliance[0].toUpperCase()}${alliance.slice(1)} ${id}`,
                ...TEMPDATA[alliance].teamData[id]?.scoring,
            }));
        };

        const raw = [...getAllianceEntries("red"), ...getAllianceEntries("blue")];

        const keys =
            raw.length > 0
                ? Object.keys(raw[0]).filter((k) => k !== "team")
                : [];

        return {
            data: raw,
            keys,
        };
    }, []);


    return (
        <div className="h-screen w-screen overflow-hidden flex flex-col">

            {/* Header */}
            <div className="grid grid-cols-12">
                <div className="col-span-7 px-4 py-2 border-b bg-white shadow-sm flex justify-between items-center">
                    <div className="text-xl font-bold">
                        {
                            matchType === "qm" ? `Qualification match ${matchNum} of 84` :
                                matchType === "f" ? `Finals ${matchNum}` : (() => {
                                    if (matchNum <= 4) return `PlayOffs – Round 1 – Match ${matchNum}`;
                                    if (matchNum <= 8) return `PlayOffs – Round 2 – Match ${matchNum}`;
                                    if (matchNum <= 10) return `PlayOffs – Round 3 – Match ${matchNum}`;
                                    if (matchNum <= 12) return `PlayOffs – Round 4 – Match ${matchNum}`;
                                    if (matchNum === 13) return `PlayOffs – Round 5 – Match 13`;
                                    return `PlayOffs – Match ${matchNum}`;
                                })()
                        }
                    </div>
                    <div className="text-sm text-gray-500">Scheduled: 12:30 PM</div>
                    <div className="text-sm text-gray-700">Predicted: 132 - 121 | Final: 127 - 118</div>
                </div>
                <div className="col-span-5 bg-white border-b border-l p-1">
                    <Select value={graphType}
                            onValueChange={(v) => setGraphType(v as GraphType)}>
                        <SelectTrigger className="w-[220px]">
                            <SelectValue placeholder="Select graph type"/>
                        </SelectTrigger>
                        <SelectContent>
                            {GRAPH_OPTIONS.map((key) => (
                                <SelectItem key={key} value={key}>
                                    {key}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Main Body */}
            <div className="flex-1 grid grid-cols-12">

                {/* Team Banners */}
                <div className="col-span-7 grid grid-rows-2 divide-y">
                    {(["red", "blue"] as const).map((allianceColor) => {
                        return (
                            <div className={`flex flex-col divide-y bg-${allianceColor}-50`}>
                                {TEMPDATA[allianceColor].teams.map((teamNum) => {
                                    const team = TEMPDATA?.[allianceColor]?.teamData?.[teamNum] ?? {};
                                    const summary = Array.isArray(team.summary) ? team.summary : [];
                                    const capabilities = Array.isArray(team.capabilities) ? team.capabilities : [];
                                    const rankings = Array.isArray(team.rankings) ? team.rankings : [];
                                    const matches = Array.isArray(team.matches) ? team.matches : [];
                                    const teamNickname = typeof team.nickname === "string" ? team.nickname : "Unknown";
                                    const teamRank = typeof team.rank === "number" ? team.rank : "N/A";
                                    const logoUrl = typeof team.logoUrl === "string" ? team.logoUrl : ""

                                    return (
                                        <div key={teamNum} className="h-[50%] bg-white p-2 @container">
                                            <div
                                                className={`flex w-full h-full overflow-x-auto border border-gray-400 h-sm:bg-zinc-600 ${allianceColor == "red" ? "bg-red-100" : "bg-blue-100"} rounded-xl shadow-sm text-sm`}>

                                                {/* Identity */}
                                                <div
                                                    className="flex flex-col items-center justify-center px-4 w-[160px] border-r border-gray-400 flex-grow-0 flex-shrink-0">
                                                    <img src={logoUrl} alt="Team Logo"
                                                         className="h-12 w-12 object-contain mb-1"/>
                                                    <div className="font-bold text-base">{teamNum ?? "???"}</div>
                                                    <div
                                                        className="text-gray-600">{teamNickname}</div>
                                                    <div className="text-xs text-gray-500">
                                                        RP Rank: {teamRank} / {totalTeam ?? "???"}
                                                    </div>
                                                </div>

                                                {/* Summary */}
                                                <div
                                                    className="flex flex-col items-start px-2 pt-1 w-[150px] border-r border-gray-400 flex-grow-0 flex-shrink-0">
                                                    <div className="font-semibold">Summary</div>
                                                    <div className="flex flex-col gap-1 w-full">
                                                        {summary.length > 0 ? (
                                                            summary.map((item, idx) => {
                                                                const rel = typeof item.reliability === "number" ? item.reliability : 0;
                                                                const label = item.label ?? "Unknown";
                                                                const value = item.summary ?? "N/A";
                                                                const unit = item.unit ?? "";
                                                                let color: string;

                                                                if (rel <= 50) {
                                                                    color = `rgb(255, ${Math.round((rel / 50) * 255)}, 80)`; // Red → Yellow
                                                                } else if (rel <= 85) {
                                                                    color = `rgb(${Math.round(255 - ((rel - 50) / 40) * 255)}, 255, 80)`; // Yellow → Green
                                                                } else {
                                                                    const t = (rel - 85) / 10;
                                                                    color = `rgb(0, ${Math.round((1 - t) * 255 + t * 180)}, ${Math.round((1 - t) * 80 + t * 255)})`; // Green → Blue
                                                                }

                                                                const clampedRel = Math.min(Math.max(rel, 0), 100); // Clamp 0–100
                                                                const halfWidth = clampedRel / 2;

                                                                return (
                                                                    <div key={idx} className="flex flex-col">
                                                                        <div className="flex justify-between text-xs">
                                                                            <span>{label}:</span>
                                                                            <span>{value} {unit}</span>
                                                                        </div>
                                                                        <div
                                                                            title={`Consistency: ${rel}%`}
                                                                            className="relative w-full h-1.5 rounded-full bg-zinc-200 overflow-hidden">
                                                                            <div
                                                                                className="absolute top-0 bottom-0 left-1/2 transform -translate-x-1/2 rounded-full"
                                                                                style={{
                                                                                    width: `${100-(halfWidth * 2)}%`,
                                                                                    backgroundColor: color
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        ) : (
                                                            <div className="text-sm text-gray-400">No summary
                                                                available</div>
                                                        )}
                                                    </div>
                                                </div>


                                                {/* Capabilities */}
                                                <div
                                                    className="flex flex-col items-start px-2 pt-1 w-[300px] border-r border-gray-400 flex-grow-0 flex-shrink-0">
                                                    <div className="font-semibold mb-1">Capabilities</div>
                                                    <div className="flex flex-wrap gap-1 text-xs">
                                                        {capabilities.length > 0 ? (
                                                            capabilities.map((cap, i) => (
                                                                <span
                                                                    key={i}
                                                                    className={`px-2 py-0.5 rounded-full ${
                                                                        cap.enabled === "yes"
                                                                            ? "bg-green-200 text-green-800"
                                                                            : cap.enabled === "no"
                                                                                ? "bg-red-200 text-red-800"
                                                                                : "bg-yellow-200 text-yellow-800"
                                                                    }`}
                                                                >
                                                            {cap.label}
                                                        </span>
                                                            ))
                                                        ) : (
                                                            <div className="text-sm text-gray-400">No capabilities
                                                                listed</div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Rankings */}
                                                <div
                                                    className="flex flex-col items-start px-2 pt-1 w-[200px] border-r border-gray-400 flex-grow-0 flex-shrink-0">
                                                    <div className="font-semibold">Rankings</div>
                                                    {rankings.length > 0 ? (
                                                        <div className="flex-1 w-full flex items-center justify-center">
                                                            <div
                                                                className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs w-full">
                                                                {rankings.map((r, i) => {
                                                                    if (r.rank === undefined || r.percentile === undefined) {
                                                                        return (
                                                                            <React.Fragment key={i}>
                                                                                <div>{r.label}:</div>
                                                                                <div><span
                                                                                    className="text-gray-500 italic">No rank</span>
                                                                                </div>
                                                                            </React.Fragment>
                                                                        );
                                                                    }

                                                                    const rankRatio = r.rank / totalTeam;
                                                                    const percentile = r.percentile;

                                                                    let rankColor: string;
                                                                    let percentileColor: string;

                                                                    if (rankRatio <= 0.10) rankColor = "text-blue-500";
                                                                    else if (rankRatio <= 0.25) rankColor = "text-green-500";
                                                                    else if (rankRatio <= 0.5) rankColor = "text-orange-500";
                                                                    else if (rankRatio <= 0.75) rankColor = "text-yellow-500";
                                                                    else rankColor = "text-red-500";

                                                                    if (percentile <= 10) percentileColor = "text-blue-500";
                                                                    else if (percentile <= 25) percentileColor = "text-green-500";
                                                                    else if (percentile <= 50) percentileColor = "text-orange-500";
                                                                    else if (percentile <= 75) percentileColor = "text-yellow-500";
                                                                    else percentileColor = "text-red-500";

                                                                    return (
                                                                        <React.Fragment key={i}>
                                                                            <div>{r.label}:</div>
                                                                            <div>
                                                                        <span
                                                                            className={`${rankColor} font-semibold`}>#{r.rank}</span>{" "}
                                                                                (<span
                                                                                title={`${100-r.percentile}% to 1# performance.`}
                                                                                className={`${percentileColor} font-semibold`}>
                                                                        {Number(r.percentile).toFixed(1)}%
                                                                    </span>)
                                                                            </div>
                                                                        </React.Fragment>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="text-sm text-gray-400">No rankings
                                                            available</div>
                                                    )}
                                                </div>

                                                {/* Match History */}
                                                <div className="flex flex-col items-start pt-1 grow min-w-0">
                                                    <div className="font-semibold px-2 mb-0.5">Recent Matches</div>

                                                    {/* Scroll Container */}
                                                    <div
                                                        className={`h-full w-full overflow-x-auto scrollbar-thin ${allianceColor == "red" ? "scrollbar-thumb-red-400 scrollbar-track-red-200" : "scrollbar-thumb-blue-400 scrollbar-track-blue-200"}`}>
                                                        {/* Inner Row */}
                                                        <div className="flex gap-4 text-xs whitespace-nowrap">
                                                            {matches.length > 0 ? (
                                                                [...matches].reverse().map((m, i) => {
                                                                    const color = m.result === "W" ? "text-green-600" : "text-red-600";

                                                                    const PredDiffIcon = ({pred}: { pred: number }) => {
                                                                        if (m.score > pred) return <CircleArrowUp
                                                                            size={12}
                                                                            className="text-green-500 inline ml-1"/>;
                                                                        if (m.score < pred) return <CircleArrowDown
                                                                            size={12}
                                                                            className="text-red-500 inline ml-1"/>;
                                                                        return <CircleEqual size={12}
                                                                                            className="text-gray-500 inline ml-1"/>;
                                                                    };

                                                                    return (
                                                                        <div key={i}
                                                                             className="flex flex-col items-center w-18 shrink-0">
                                                                            <div className="font-mono">{m.match}</div>
                                                                            <div
                                                                                className={`font-bold ${color}`}>{m.result}</div>
                                                                            <div>{m.score} pts</div>
                                                                            <div
                                                                                className="text-gray-500">AI: {m.pred_ai}<PredDiffIcon
                                                                                pred={m.pred_ai}/></div>
                                                                            <div
                                                                                className="text-gray-500">H: {m.pred_heur}<PredDiffIcon
                                                                                pred={m.pred_heur}/></div>
                                                                            <div
                                                                                className="text-gray-500">ELO: {m.pred_elo}<PredDiffIcon
                                                                                pred={m.pred_elo}/></div>
                                                                        </div>
                                                                    );
                                                                })
                                                            ) : (
                                                                <div className="text-sm text-gray-400">No match
                                                                    data</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )
                    })}
                </div>

                {/* Charts */}
                {graphType === "Score Breakdown Norm." ? (
                    <div className="col-span-5 bg-white p-4 border-l">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                layout="horizontal"
                                data={scoreBreakdownDataNormalized.data}
                                margin={{top: 20, right: 20, left: 40, bottom: 20}}
                            >
                                <CartesianGrid strokeDasharray="3 3"/>
                                <XAxis dataKey="team" type="category" interval={0} angle={0} height={60}/>
                                <YAxis type="number" domain={[0, 100]}/>
                                <Tooltip/>
                                <Legend/>
                                {scoreBreakdownDataNormalized.keys.map((key, i) => (
                                    <Bar
                                        key={key}
                                        dataKey={key}
                                        stackId="a"
                                        fill={COLOR_PALETTE[i % COLOR_PALETTE.length]}
                                        name={key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                                    />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                ) : graphType === "Score Breakdown Abs." ? (
                    <div className="col-span-5 bg-white p-4 border-l">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                layout="horizontal"
                                data={scoreBreakdownDataAbsolute.data}
                                margin={{top: 20, right: 20, left: 40, bottom: 20}}
                            >
                                <CartesianGrid strokeDasharray="3 3"/>
                                <XAxis dataKey="team" type="category" interval={0} angle={0} height={60}/>
                                <YAxis type="number" domain={[0, 100]}/>
                                <Tooltip/>
                                <Legend/>
                                {scoreBreakdownDataAbsolute.keys.map((key, i) => (
                                    <Bar
                                        key={key}
                                        dataKey={key}
                                        stackId="a"
                                        fill={COLOR_PALETTE[i % COLOR_PALETTE.length]}
                                        name={key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                                    />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                ) : graphType === "Strength Map" ? (
                    <div className="col-span-5 grid grid-rows-2 divide-y border-l">
                        {(["red", "blue"] as const).map((color) => {
                            const alliance = TEMPDATA[color];
                            const data = getNormalizedAllianceMetrics(color); // same structure

                            return (
                                <div key={color} className="p-4 bg-white flex flex-col justify-center">
                                    <div
                                        className={`font-bold ${color === "red" ? "text-red-700" : "text-blue-700"} text-lg mb-2`}>
                                        {color.toUpperCase()} Alliance Strength
                                    </div>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <LineChart data={data}>
                                            <CartesianGrid strokeDasharray="3 3"/>
                                            <XAxis dataKey="metric" type="category"/>
                                            <YAxis domain={[0, "auto"]}/>
                                            <Tooltip/>
                                            <Legend/>
                                            {alliance.teams.map((id, i) => (
                                                <Line
                                                    key={id}
                                                    type="monotone"
                                                    dataKey={id.toString()}
                                                    stroke={COLOR_PALETTE[i % COLOR_PALETTE.length]}
                                                    dot={{r: 2}}
                                                />
                                            ))}
                                        </LineChart>
                                    </ResponsiveContainer>
                                    <div className="text-sm text-gray-700">
                                        Alliance combined data placeholder row 1
                                    </div>
                                    <div className="text-sm text-gray-700">
                                        Alliance combined data placeholder row 2
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : null}

            </div>
        </div>
    )
}
