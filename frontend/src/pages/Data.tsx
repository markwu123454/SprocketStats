// DataLayout.tsx

// @ts-ignore
import React, {type JSX, useEffect, useMemo, useRef, useState} from "react";
import Resizable from "react-resizable-layout";
import {Select, SelectTrigger, SelectValue, SelectContent, SelectItem,} from "@/components/ui/select"
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    BarChart,
    Bar,
    RadarChart,
    Radar,
    PolarAngleAxis,
    PolarGrid,
    PolarRadiusAxis, ScatterChart, Scatter, ZAxis
} from "recharts";
import {AgGridReact} from "ag-grid-react";
import {type GridReadyEvent, ModuleRegistry, AllCommunityModule} from "ag-grid-community";
// @ts-ignore
import type {MatchScoutingData, MatchType, PitScoutingData} from '@/types'
// @ts-ignore
import type * as DataTypes from '@/types/data';
import {Input} from "@/components/ui/input";
import {Switch} from "@/components/ui/switch";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {Button} from "@/components/ui/button";

ModuleRegistry.registerModules([AllCommunityModule]);

type TeamDetail = {
    teamNumber: number;
    nickname: string;
    logoUrl: string;
    rank: number;
    summary: { label: string; summary: number; reliability: number; unit: string }[]
    capabilities: { label: string; enabled: "yes" | "no" | "not demonstrated" }[];
    rankings: { label: string; rank: number; percentile: number }[];
    matches: {
        match: string;
        result: "W" | "L";
        score: number;
        pred_ai: number;
        pred_heur: number,
        teammates: [number, number, number],
        opponents: [number, number, number]
    }[];
};

const totalTeam = 64

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


type GraphType = "matchTimeline" | "scoreBreakdown" | "cycleEfficiency" | "objectiveContribution" | "accuracyMap" |
    "correlationMatrix" | "performanceDistribution" | "rankingProgression" | "headToHead" | "autonClustering";

type TableType = "matchData" | "pitData" | "rankings";

/*
const testScoutingData: Omit<MatchScoutingData, 'scouter'>[] = [
    {
        match: 1,
        match_type: "qm",
        alliance: "red",
        teamNumber: 254,
        auto: {
            branchPlacement: {
                A: {l2: true, l3: false, l4: false},
                B: {l2: false, l3: true, l4: false},
                ...Object.fromEntries("CDEFGHIJKL".split("").map((id) => [id, {l2: false, l3: false, l4: false}]))
            },
            algaePlacement: {
                AB: true, CD: false, EF: false, GH: false, IJ: false, KL: false
            },
            missed: {l1: 1, l2: 0, l3: 1, l4: 0},
            l1: 2,
            processor: 1,
            barge: 1,
            missAlgae: 1,
            moved: true,
        },
        teleop: {
            branchPlacement: {
                A: {l2: false, l3: false, l4: false},
                B: {l2: false, l3: false, l4: false},
                C: {l2: true, l3: false, l4: false},
                ...Object.fromEntries("DEFGHIJKL".split("").map((id) => [id, {l2: false, l3: false, l4: false}]))
            },
            algaePlacement: {
                AB: false, CD: true, EF: true, GH: false, IJ: false, KL: false
            },
            missed: {l1: 0, l2: 2, l3: 1, l4: 0},
            l1: 1,
            processor: 3,
            barge: 2,
            missAlgae: 0,
        },
        postmatch: {
            skill: 4,
            climbSpeed: 3,
            climbSuccess: true,
            offense: true,
            defense: false,
            faults: {system: false, idle: false, other: false},
            notes: "Fast scoring and good climb"
        },
    },
    {
        match: 2,
        match_type: "qm",
        alliance: "blue",
        teamNumber: 254,
        auto: {
            branchPlacement: {
                A: {l2: false, l3: false, l4: true},
                ...Object.fromEntries("BCDEFGHIJKL".split("").map((id) => [id, {l2: false, l3: false, l4: false}]))
            },
            algaePlacement: {
                AB: false, CD: true, EF: false, GH: false, IJ: false, KL: false
            },
            missed: {l1: 2, l2: 1, l3: 0, l4: 0},
            l1: 0,
            processor: 0,
            barge: 0,
            missAlgae: 2,
            moved: false,
        },
        teleop: {
            branchPlacement: {
                A: {l2: false, l3: false, l4: false},
                B: {l2: false, l3: false, l4: true},
                ...Object.fromEntries("CDEFGHIJKL".split("").map((id) => [id, {l2: false, l3: false, l4: false}]))
            },
            algaePlacement: {
                AB: true, CD: false, EF: true, GH: false, IJ: false, KL: false
            },
            missed: {l1: 3, l2: 0, l3: 0, l4: 1},
            l1: 2,
            processor: 1,
            barge: 0,
            missAlgae: 1,
        },
        postmatch: {
            skill: 2,
            climbSpeed: 1,
            climbSuccess: false,
            offense: false,
            defense: true,
            faults: {system: false, idle: true, other: false},
            notes: "Missed several shots, no climb"
        },
    },
    {
        match: 3,
        match_type: "f",
        alliance: "red",
        teamNumber: 2910,
        auto: {
            branchPlacement: {
                D: {l2: false, l3: true, l4: false},
                ...Object.fromEntries("ABCEFGHIJKL".split("").map((id) => [id, {l2: false, l3: false, l4: false}]))
            },
            algaePlacement: {
                AB: false, CD: false, EF: false, GH: false, IJ: false, KL: false
            },
            missed: {l1: 0, l2: 0, l3: 0, l4: 1},
            l1: 1,
            processor: 2,
            barge: 1,
            missAlgae: 0,
            moved: true,
        },
        teleop: {
            branchPlacement: {
                D: {l2: false, l3: false, l4: false},
                E: {l2: false, l3: false, l4: true},
                ...Object.fromEntries("ABCFGHIJKL".split("").map((id) => [id, {l2: false, l3: false, l4: false}]))
            },
            algaePlacement: {
                AB: true, CD: true, EF: true, GH: true, IJ: true, KL: true
            },
            missed: {l1: 1, l2: 1, l3: 1, l4: 0},
            l1: 0,
            processor: 2,
            barge: 3,
            missAlgae: 1,
        },
        postmatch: {
            skill: 5,
            climbSpeed: 4,
            climbSuccess: true,
            offense: true,
            defense: false,
            faults: {system: false, idle: false, other: true},
            notes: "Top performer in match"
        },
    },
];

const testPitScoutingData: PitScoutingData[] = [
    {
        team: 254,
        widthInches: 28,
        lengthInches: 32,
        heightExtendedInches: 60,
        heightCollapsedInches: 30,
        weightPounds: 125,
        drivebaseType: "Swerve",
        hoursOfDrivePractice: 40,
        intakeDescription: "Dual-sided roller intake with active centering",
        climbLevel: "deep",
        role: "Offense",
        autonStartPosition: ["Center", "Left Wing", "Right Wing"],
        teleopPlayArea: ["AB Zone", "CD Zone", "EF Zone"],
        additionalComments: "Designed for high-speed cycles and reliable scoring on L3"
    },
    {
        team: 2910,
        widthInches: 29,
        lengthInches: 31,
        heightExtendedInches: 58,
        heightCollapsedInches: 28,
        weightPounds: 123,
        drivebaseType: "Swerve",
        hoursOfDrivePractice: 35,
        intakeDescription: "Single front intake with brushless motor actuation",
        climbLevel: "shallow",
        role: "Both",
        autonStartPosition: ["Stage Edge", "Far Side"],
        teleopPlayArea: ["GH Zone", "IJ Zone", "KL Zone"],
        additionalComments: "Prioritizes flexibility between scoring and defense"
    }
];
*/

export function DataLayout() {
    /*
    const [rawScoutingData, setrawScoutingData] = useState<DataTypes.RawData>();

    const {team: teamMap, match: matchMap} = useMemo(() => {
        return processScoutingData(rawScoutingData ?? {pitScouting: [], matchScouting: []});
    }, [rawScoutingData]);


    useEffect(() => {
        setrawScoutingData({
            pitScouting: testPitScoutingData,
            matchScouting: testScoutingData.map((d) => ({...d, scouter: null}))
        });
    }, []);

    useEffect(() => {
        console.log(testScoutingData.length);
        console.log("teamMap:", teamMap);
    }, [teamMap]);
    */

    const [teamNum, setTeamNum] = useState<number>(973)

    const [_teamMap, _setTeamMap] = useState<Map<number, TeamDetail>>(() =>
        new Map([
            [
                973,
                {
                    teamNumber: 973,
                    nickname: "Greybots",
                    logoUrl: "/team_logo.png",
                    rank: 12,
                    summary: [
                        {label: "Auton", summary: 12, reliability: 65, unit: "pt"},
                        {label: "Coral", summary: 12.7, reliability: 97, unit: "cycles"},
                        {label: "Algae", summary: 3.5, reliability: 40, unit: "cycles"},
                        {label: "Endgame", summary: 8, reliability: 20, unit: "pt"},
                    ],
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
                        {label: "Auton", rank: 3, percentile: 4},
                        {label: "Coral", rank: 5, percentile: 8},
                        {label: "Algae", rank: 12, percentile: 34},
                        {label: "Climb", rank: 10, percentile: 16},
                        {label: "Defense", rank: 7, percentile: 12},
                        {label: "Point", rank: 18, percentile: 82},
                    ],
                    matches: [
                        {
                            match: "Q25",
                            result: "W",
                            score: 132,
                            pred_ai: 128,
                            pred_heur: 120,
                            teammates: [254, 973, 2910],
                            opponents: [1678, 118, 4414],
                        },
                        {
                            match: "Q18",
                            result: "L",
                            score: 86,
                            pred_ai: 94,
                            pred_heur: 86,
                            teammates: [973, 1323, 4414],
                            opponents: [2910, 1671, 192],
                        },
                        {
                            match: "Q12",
                            result: "W",
                            score: 115,
                            pred_ai: 110,
                            pred_heur: 102,
                            teammates: [973, 1678, 1538],
                            opponents: [254, 118, 192],
                        },
                    ],
                },
            ],
        ])
    );


    const [graphType, setGraphType] = useState<GraphType>("matchTimeline");

    function useGraphConfigHooks() {
        const [matchTimelineSelectedTeam, setMatchTimelineSelectedTeam] = useState<number>();

        const [scoreBreakdownMatch, setScoreBreakdownMatch] = useState<number>();
        const [scoreBreakdownMatchType, setScoreBreakdownMatchType] = useState<MatchType>();
        const [scoreBreakdownNorm, setScoreBreakdownNorm] = useState<boolean>();

        const [objectiveContributionSelectedTeams, setObjectiveContributionSelectedTeams] = useState<number[]>([]);

        const [accuracyMapSelectedTeam, setAccuracyMapSelectedTeam] = useState<number>();

        const [headToHeadSelectedTeams, setHeadToHeadSelectedTeams] = useState<number[]>([]);
        const [headToHeadNorm, setHeadToHeadNorm] = useState<boolean>(true);

        return {
            matchTimeline: {
                selectedTeam: matchTimelineSelectedTeam,
                setSelectedTeam: setMatchTimelineSelectedTeam,
            },
            scoreBreakdown: {
                match: scoreBreakdownMatch,
                setMatch: setScoreBreakdownMatch,
                matchType: scoreBreakdownMatchType,
                setMatchType: setScoreBreakdownMatchType,
                norm: scoreBreakdownNorm,
                setNorm: setScoreBreakdownNorm,
            },
            objectiveContribution: {
                selectedTeams: objectiveContributionSelectedTeams,
                setSelectedTeams: setObjectiveContributionSelectedTeams
            },
            accuracyMap: {
                selectedTeam: accuracyMapSelectedTeam,
                setSelectedTeam: setAccuracyMapSelectedTeam,
            },
            headToHead: {
                selectedTeams: headToHeadSelectedTeams,
                setSelectedTeams: setHeadToHeadSelectedTeams,
                norm: headToHeadNorm,
                setNorm: setHeadToHeadNorm,
            }
        };
    }


    const graphHooks = useGraphConfigHooks();

    type GraphConfigEntry = {
        label: string;
        controls: JSX.Element | null;
        chart: () => JSX.Element;
    };

    const matchTimelineTESTDATA: Record<number, { match: string; [key: string]: number | string; }[]> = {
        254: [
            {match: "3", score: 85, pred_ai: 84, pred_heur: 79},
            {match: "15", score: 90, pred_ai: 89, pred_heur: 88},
            {match: "24", score: 70, pred_ai: 72, pred_heur: 68},
        ],
        1323: [
            {match: "5", score: 78, pred_ai: 75, pred_heur: 70},
            {match: "18", score: 88, pred_ai: 86, pred_heur: 82},
            {match: "30", score: 91, pred_ai: 93, pred_heur: 89},
        ],
    };

    const scoreBreakdownTESTDATA: Record<"qm" | "sf" | "f", Record<number, {
        team: string;
        [key: string]: string | number;
    }[]>> = {
        qm: {
            1: [
                {team: "Red 1690", auto: 37, teleop_coral: 35, teleop_algae: 4, endgame: 12},
                {team: "Red 2054", auto: 16, teleop_coral: 28, teleop_algae: 14, endgame: 12},
                {team: "Red 4414", auto: 18, teleop_coral: 30, teleop_algae: 12, endgame: 6},
                {team: "Blue 2910", auto: 24, teleop_coral: 32, teleop_algae: 18, endgame: 12},
                {team: "Blue 1323", auto: 20, teleop_coral: 30, teleop_algae: 16, endgame: 12},
                {team: "Blue 118", auto: 12, teleop_coral: 20, teleop_algae: 10, endgame: 6},
            ],
            2: [
                {team: "Red 4414", auto: 14, teleop_coral: 21, teleop_algae: 9, endgame: 26},
                {team: "Red 1690", auto: 12, teleop_coral: 23, teleop_algae: 10, endgame: 22},
                {team: "Red 2054", auto: 13, teleop_coral: 17, teleop_algae: 13, endgame: 19},
                {team: "Blue 5406", auto: 10, teleop_coral: 15, teleop_algae: 12, endgame: 18},
                {team: "Blue 111", auto: 11, teleop_coral: 19, teleop_algae: 11, endgame: 20},
                {team: "Blue 148", auto: 13, teleop_coral: 18, teleop_algae: 14, endgame: 21},
            ],
        },
        sf: {},
        f: {},
    };

    const accuracyMapTESTDATA: Record<number, // team number
        Array<{
            match: number;
            level: string;
            accuracy: number;
            attempts: number;
        }>
    > = {
        1323: [
            {match: 1, level: "l1", accuracy: 0.9, attempts: 6},
            {match: 1, level: "l2", accuracy: 0.7, attempts: 3},
            {match: 1, level: "l3", accuracy: 0.65, attempts: 5},
            {match: 1, level: "l4", accuracy: 0.5, attempts: 2},
            {match: 1, level: "barge", accuracy: 0.4, attempts: 4},

            {match: 2, level: "l1", accuracy: 0.85, attempts: 7},
            {match: 2, level: "l2", accuracy: 0.6, attempts: 3},
            {match: 2, level: "l3", accuracy: 0.55, attempts: 4},
            {match: 2, level: "l4", accuracy: 0.45, attempts: 2},
            {match: 2, level: "barge", accuracy: 0.3, attempts: 3},

            {match: 3, level: "l1", accuracy: 0.88, attempts: 5},
            {match: 3, level: "l2", accuracy: 0.65, attempts: 3},
            {match: 3, level: "l3", accuracy: 0.6, attempts: 4},
            {match: 3, level: "l4", accuracy: 0.5, attempts: 2},
            {match: 3, level: "barge", accuracy: 0.25, attempts: 2},
        ],
        254: [
            {match: 1, level: "l1", accuracy: 0.92, attempts: 6},
            {match: 1, level: "l2", accuracy: 0.8, attempts: 5},
            {match: 1, level: "l3", accuracy: 0.7, attempts: 4},
            {match: 1, level: "l4", accuracy: 0.6, attempts: 2},
            {match: 1, level: "barge", accuracy: 0.5, attempts: 3},

            {match: 2, level: "l1", accuracy: 0.87, attempts: 5},
            {match: 2, level: "l2", accuracy: 0.75, attempts: 4},
            {match: 2, level: "l3", accuracy: 0.6, attempts: 3},
            {match: 2, level: "l4", accuracy: 0.5, attempts: 2},
            {match: 2, level: "barge", accuracy: 0.4, attempts: 2},

            {match: 3, level: "l1", accuracy: 0.9, attempts: 6},
            {match: 3, level: "l2", accuracy: 0.78, attempts: 4},
            {match: 3, level: "l3", accuracy: 0.65, attempts: 3},
            {match: 3, level: "l4", accuracy: 0.55, attempts: 2},
            {match: 3, level: "barge", accuracy: 0.35, attempts: 2},
        ],
    };

    const headToHeadTESTDATA: Record<number, Record<string, number>> = {
        254: {
            auto: 18,
            teleop_coral: 56,
            teleop_algae: 12,
            climb: 12,
            auto_reliability: 6,
        },
        1323: {
            auto: 48,
            teleop_coral: 100,
            teleop_algae: 8,
            climb: 7,
            auto_reliability: 2,
        },
        2910: {
            auto: 16,
            teleop_coral: 143,
            teleop_algae: 16,
            climb: 7,
            auto_reliability: 5,
        },
        1678: {
            auto: 19,
            teleop_coral: 96,
            teleop_algae: 8,
            climb: 12,
            auto_reliability: 7,
        },
    };


    const graphConfig: Record<GraphType, GraphConfigEntry> = {
            matchTimeline: {
                label: "Match Timeline",

                controls: (
                    <Select
                        onValueChange={(v) => {
                            const teamId = Number(v);
                            graphHooks.matchTimeline.setSelectedTeam(teamId);
                        }}
                    >
                        <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Select a team"/>
                        </SelectTrigger>
                        <SelectContent>
                            {Object.entries(matchTimelineTESTDATA).map(([idStr]) => {
                                const id = Number(idStr);
                                return (
                                    <SelectItem key={id} value={idStr}>
                                        Team {id}
                                    </SelectItem>
                                );
                            })}
                        </SelectContent>
                    </Select>
                ),

                chart: () => (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={matchTimelineTESTDATA[graphHooks.matchTimeline.selectedTeam ?? -1] ?? []}>
                            <CartesianGrid strokeDasharray="3 3"/>
                            <XAxis dataKey="match"/>
                            <YAxis/>
                            <Tooltip/>
                            <Legend/>
                            {
                                (() => {
                                    const data = matchTimelineTESTDATA[graphHooks.matchTimeline.selectedTeam ?? -1];
                                    if (!data || data.length === 0) return null;
                                    return Object.keys(data[0])
                                        .filter((key) => key !== "match")
                                        .map((key, i) => (
                                            <Line
                                                key={key}
                                                dataKey={key}
                                                stroke={COLOR_PALETTE[i % COLOR_PALETTE.length]}
                                                name={key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                                            />
                                        ));
                                })()
                            }
                        </LineChart>
                    </ResponsiveContainer>
                )
            },

            scoreBreakdown: {
                label: "Score Breakdown",

                controls: (
                    <div className="flex gap-4 items-center">
                        {/* Match Type Selector */}
                        <Select
                            value={graphHooks.scoreBreakdown.matchType as string}
                            onValueChange={(v) => graphHooks.scoreBreakdown.setMatchType(v as "qm" | "sf" | "f")}
                        >
                            <SelectTrigger className="w-[160px]">
                                <SelectValue placeholder="Match Type"/>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="qm">Qualification</SelectItem>
                                <SelectItem value="sf">Playoff</SelectItem>
                                <SelectItem value="f">Final</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Match Number Input */}
                        <Input
                            type="number"
                            placeholder="Match #"
                            value={graphHooks.scoreBreakdown.match ?? ""}
                            onChange={(e) => {
                                const val = e.target.value;
                                graphHooks.scoreBreakdown.setMatch(val === "" ? undefined : Number(val));
                            }}
                            className="w-[100px]"
                        />

                        {/* Normalization Toggle */}
                        <label className="flex items-center gap-2 text-sm font-medium">
                            <Switch
                                checked={graphHooks.scoreBreakdown.norm}
                                onCheckedChange={graphHooks.scoreBreakdown.setNorm}
                            />
                            Normalize
                        </label>
                    </div>
                ),

                chart: () => {
                    const matchType = graphHooks.scoreBreakdown.matchType ?? "qm";
                    const matchNum = graphHooks.scoreBreakdown.match ?? -1;
                    const raw =
                        scoreBreakdownTESTDATA[matchType]?.[matchNum] ?? [];

                    const data = graphHooks.scoreBreakdown.norm
                        ? raw.map((entry) => {
                            const total = Object.entries(entry as Record<string, number>)
                                .filter(([k]) => k !== "team")
                                .reduce((acc, [, v]) => acc + v, 0);
                            return {
                                ...entry,
                                ...Object.fromEntries(
                                    Object.entries(entry)
                                        .filter(([k]) => k !== "team")
                                        .map(([k, v]) => [k, (v as number) / total * 100])
                                ),
                            };
                        })
                        : raw;

                    const keys = data.length > 0
                        ? Object.keys(data[0]).filter((k) => k !== "team")
                        : [];

                    return (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                layout="horizontal"
                                data={data}
                                margin={{top: 20, right: 20, left: 40, bottom: 20}}
                            >
                                <CartesianGrid strokeDasharray="3 3"/>
                                <XAxis dataKey="team" type="category" interval={0} angle={0} height={60}/>
                                <YAxis
                                    type="number"
                                    domain={[0, graphHooks.scoreBreakdown.norm ? 100 : "auto"]}
                                />
                                <Tooltip/>
                                <Legend/>
                                {keys.map((key, i) => (
                                    <Bar
                                        key={key}
                                        dataKey={key}
                                        stackId="a"
                                        fill={COLOR_PALETTE[i % COLOR_PALETTE.length]}
                                        name={key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                                    />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    );
                }
            },

            cycleEfficiency: {
                label: "Cycle Efficiency",
                controls:
                    null,
                chart: () => (
                    <div className="h-full w-full border rounded bg-gray-100 flex items-center justify-center">
                        Plot of coral cycles to algae cycles per match
                    </div>
                )

            },

            objectiveContribution: {
                label: "Objective Contribution",
                controls:
                    (
                        <div className="flex gap-4 items-center">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="min-w-[200px] justify-start">
                                        {graphHooks.objectiveContribution.selectedTeams?.length
                                            ? `Teams: ${graphHooks.objectiveContribution.selectedTeams.join(", ")}`
                                            : "Select Teams"}
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-56">
                                    <DropdownMenuLabel>Select Teams</DropdownMenuLabel>
                                    <DropdownMenuSeparator/>
                                    {[254, 1323, 2910, 1678].map((id) => (
                                        <DropdownMenuCheckboxItem
                                            key={id}
                                            checked={graphHooks.objectiveContribution.selectedTeams?.includes(id)}
                                            onCheckedChange={(checked) => {
                                                const current = graphHooks.objectiveContribution.selectedTeams ?? [];
                                                graphHooks.objectiveContribution.setSelectedTeams(
                                                    checked
                                                        ? [...current, id]
                                                        : current.filter((x) => x !== id)
                                                );
                                            }}
                                        >
                                            Team {id}
                                        </DropdownMenuCheckboxItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    ),
                chart:
                    () => (
                        <div className="h-full w-full border rounded bg-gray-100 p-4 overflow-auto">
                            <div className="grid grid-cols-6 gap-2 min-w-[500px] text-sm">
                                {/* Header Row */}
                                <div className="font-semibold">Team</div>
                                <div className="font-semibold text-center">Algae</div>
                                <div className="font-semibold text-center">Climb</div>
                                <div className="font-semibold text-center">Auto</div>
                                <div className="font-semibold text-center">Coral</div>
                                <div className="font-semibold text-center">Levels</div>

                                {/* Team Rows */}
                                {[
                                    {team: 1323, algae: 7, climb: 5, autoGoal: true, coral: 4, levels: 2},
                                    {team: 2910, algae: 9, climb: 14, autoGoal: true, coral: 6, levels: 3},
                                    {team: 1690, algae: 5, climb: 0, autoGoal: false, coral: 3, levels: 1},
                                    {team: 1678, algae: 8, climb: 14, autoGoal: true, coral: 5, levels: 3},
                                ].map((data) => (
                                    <React.Fragment key={data.team}>
                                        <div className="font-medium">{data.team}</div>
                                        <div className="text-center">{data.algae}</div>
                                        <div className="text-center">{data.climb}</div>
                                        <div className="text-center">{data.autoGoal ? "YES" : "NO"}</div>
                                        <div className="text-center">{data.coral}</div>
                                        <div className="text-center">{data.levels}</div>
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>
                    ),
            },

            accuracyMap: {
                label: "Accuracy Map",
                controls:
                    (
                        <Select
                            onValueChange={(v) => {
                                graphHooks.accuracyMap.setSelectedTeam(Number(v));
                            }}
                        >
                            <SelectTrigger className="w-[200px]">
                                <SelectValue placeholder="Select a team"/>
                            </SelectTrigger>
                            <SelectContent>
                                {[{id: 1323, name: "MadTown Robotics"}, {id: 254, name: "Cheesy Poofs"}].map((t) => (
                                    <SelectItem key={t.id} value={t.id.toString()}>
                                        {t.name} ({t.id})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ),
                chart: () => {
                    const selectedTeam = graphHooks.accuracyMap.selectedTeam ?? 0;
                    const rawData = accuracyMapTESTDATA[selectedTeam] ?? [];

                    const LEVELS = ["l1", "l2", "l3", "l4", "barge"];

                    return (
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{top: 20, right: 20, bottom: 20, left: 20}}>
                                <CartesianGrid/>
                                <XAxis
                                    dataKey="x"
                                    type="number"
                                    name="Match"
                                    domain={["dataMin", "dataMax"]}
                                />
                                <YAxis
                                    type="number"
                                    dataKey="y"
                                    name="Accuracy"
                                    domain={[0, 100]}
                                    tickFormatter={(v) => `${v}%`}
                                />
                                <ZAxis dataKey="size" range={[60, 400]} name="Attempts"/>
                                <Tooltip
                                    cursor={{strokeDasharray: "3 3"}}
                                    formatter={(value, name) => {
                                        if (name === "y") return [`${(value as number).toFixed(0)}%`, "Accuracy"];
                                        if (name === "size") return [value, "Attempts"];
                                        return [value, name];
                                    }}
                                />
                                <Legend/>
                                {LEVELS.map((level, i) => (
                                    <Scatter
                                        key={level}
                                        name={level}
                                        fill={COLOR_PALETTE[i % COLOR_PALETTE.length]}
                                        data={rawData
                                            .filter((d) => d.level === level)
                                            .map((d) => ({
                                                x: d.match,
                                                y: d.accuracy * 100,
                                                size: d.attempts,
                                            }))
                                        }
                                    />
                                ))}
                            </ScatterChart>
                        </ResponsiveContainer>
                    );
                }

            },

            correlationMatrix: {
                label: "Correlation Matrix",
                controls:
                    null,
                chart:
                    () => (
                        <div className="h-full w-full border rounded bg-gray-100 flex items-center justify-center">
                            Correlation Matrix Chart Placeholder
                        </div>
                    ),
            },

            performanceDistribution: {
                label: "Performance Distribution",
                controls:
                    null,
                chart:
                    () => (
                        <div className="h-full w-full border rounded bg-gray-100 flex items-center justify-center">
                            Performance Distribution Chart Placeholder
                        </div>
                    ),
            },

            rankingProgression: {
                label: "Ranking Progression",
                controls:
                    null,
                chart:
                    () => (
                        <div className="h-full w-full border rounded bg-gray-100 flex items-center justify-center">
                            Ranking Progression Chart Placeholder
                        </div>
                    ),
            },

            headToHead: {
                label: "Head-to-Head",

                controls:
                    (
                        <div className="flex gap-4 items-center">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="min-w-[200px] justify-start">
                                        {graphHooks.headToHead.selectedTeams?.length
                                            ? `Teams: ${graphHooks.headToHead.selectedTeams.join(", ")}`
                                            : "Select Teams"}
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-56">
                                    <DropdownMenuLabel>Select Teams</DropdownMenuLabel>
                                    <DropdownMenuSeparator/>
                                    {[254, 1323, 2910, 1678].map((id) => (
                                        <DropdownMenuCheckboxItem
                                            key={id}
                                            checked={graphHooks.headToHead.selectedTeams?.includes(id)}
                                            onCheckedChange={(checked) => {
                                                const current = graphHooks.headToHead.selectedTeams ?? [];
                                                graphHooks.headToHead.setSelectedTeams(
                                                    checked
                                                        ? [...current, id]
                                                        : current.filter((x) => x !== id)
                                                );
                                            }}
                                        >
                                            Team {id}
                                        </DropdownMenuCheckboxItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                            {/* Normalize Switch */}
                            <label className="flex items-center gap-2 text-sm font-medium">
                                <Switch
                                    checked={graphHooks.headToHead.norm}
                                    onCheckedChange={graphHooks.headToHead.setNorm}
                                />
                                Normalize
                            </label>
                        </div>
                    ),

                chart: () => {
                    const selected = graphHooks.headToHead.selectedTeams ?? [];
                    const norm = graphHooks.headToHead.norm;
                    const teamStats = headToHeadTESTDATA;

                    const metricKeys = Object.keys(teamStats[selected[0] ?? 254] ?? {});

                    const data = metricKeys.map((metric) => {
                        const max = norm
                            ? Math.max(...selected.map((id) => teamStats[id]?.[metric] ?? 0)) || 1
                            : 1;

                        return Object.fromEntries([
                            [
                                "metric",
                                metric.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                            ],
                            ...selected.map((id) => [
                                id.toString(),
                                norm
                                    ? ((teamStats[id]?.[metric] ?? 0) / max) * 100
                                    : teamStats[id]?.[metric] ?? 0,
                            ]),
                        ]);
                    });

                    return (
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart outerRadius="80%" data={data}>
                                <PolarGrid/>
                                <PolarAngleAxis dataKey="metric"/>
                                <PolarRadiusAxis angle={30} domain={[0, norm ? 100 : "auto"]}/>
                                {selected.map((id, i) => (
                                    <Radar
                                        key={id}
                                        name={`Team ${id}`}
                                        dataKey={id.toString()}
                                        stroke={COLOR_PALETTE[i % COLOR_PALETTE.length]}
                                        fill={COLOR_PALETTE[i % COLOR_PALETTE.length]}
                                        fillOpacity={0.4}
                                    />
                                ))}
                                <Legend/>
                                <Tooltip/>
                            </RadarChart>
                        </ResponsiveContainer>
                    );
                }
            },

            autonClustering: {
                label: "Auton Clustering",
                controls:
                    null,
                chart:
                    () => (
                        <div className="h-full w-full border rounded bg-gray-100 flex items-center justify-center">
                            graph of all auto routines
                        </div>
                    ),
            },
        }
    ;


    const [tableType, setTableType] = useState<TableType>("matchData");

    const tableConfig: Record<TableType, {
        label: string;
        rowData: any[];
        columnDefs: any[];
    }> = {
        matchData: {
            label: "Match Data",
            rowData: [
                {
                    id: 1,
                    team: "1323",
                    matchType: "qm",
                    matchNo: 15,
                    teammates: ["254", "971"],
                    autonPoints: 18,
                    autonMissed: 6,
                    teleopCoral: 7,
                    teleopCoralAccuracy: "78%",
                    teleopBarge: 2,
                    teleopBargeMissed: 1,
                    teleopProcessor: 4,
                    climb: "Mid",
                    driverSkill: "High",
                    faults: 0,
                    notes: "Strong coral cyclesStrong coral cyclesStrong coral cyclesStrong coral cyclesStrong coral cycles",
                },
            ],
            columnDefs: [
                {
                    headerName: "Match Info",
                    children: [
                        {
                            headerName: "Team",
                            field: "team",
                            sortable: true,
                            filter: true,
                            onCellClicked: (params: { value: any; }) => {
                                const teamNumber = Number(params.value);
                                if (!isNaN(teamNumber)) setTeamNum(teamNumber);
                            },
                            cellStyle: {cursor: "pointer"}
                        },
                        {
                            headerName: "Match Type",
                            field: "matchType",
                            sortable: true,
                            filter: true,
                            valueFormatter: (params: { value: string; }) => {
                                const map: Record<string, string> = {
                                    qm: "Qualifications",
                                    sf: "Playoffs",
                                    f: "Finals",
                                };
                                return map[params.value] ?? params.value;
                            },
                        },
                        {headerName: "Match No.", field: "matchNo", sortable: true, filter: true},
                        {
                            headerName: "Teammates",
                            field: "teammates",
                            sortable: true,
                            filter: true,
                            cellRenderer: (params: any) => {
                                return (
                                    <div className="flex gap-1 flex-wrap">
                                        {params.value.map((num: number) => (
                                            <span
                                                key={num}
                                                className="cursor-pointer"
                                                onClick={(e) => {
                                                    e.stopPropagation(); // Prevent cell click from firing
                                                    setTeamNum(num);
                                                }}
                                            >
                                                {num}
                                            </span>
                                        ))}
                                    </div>
                                );
                            },
                        }

                    ],
                },
                {
                    headerName: "Auton",
                    children: [
                        {headerName: "Points", field: "autonPoints", sortable: true, filter: true},
                        {headerName: "Missed", field: "autonMissed", sortable: true, filter: true},
                    ],
                },
                {
                    headerName: "Teleop",
                    children: [
                        {headerName: "Coral Cycles", field: "teleopCoral", sortable: true, filter: true},
                        {headerName: "Coral Accuracy", field: "teleopCoralAccuracy", sortable: true, filter: true},
                        {headerName: "Barge", field: "teleopBarge", sortable: true, filter: true},
                        {headerName: "Barge Missed", field: "teleopBargeMissed", sortable: true, filter: true},
                        {headerName: "Processor", field: "teleopProcessor", sortable: true, filter: true},
                    ],
                },
                {
                    headerName: "Endgame",
                    children: [
                        {headerName: "Climb", field: "climb", sortable: true, filter: true},
                    ],
                },
                {
                    headerName: "Misc",
                    children: [
                        {headerName: "Driver Skill", field: "driverSkill", sortable: true, filter: true},
                        {headerName: "Faults", field: "faults", sortable: true, filter: true},
                        {headerName: "Notes", field: "notes", sortable: true, filter: true},
                    ],
                },
            ],
        },
        pitData: {
            label: "Pit Data",
            rowData: [
                {
                    id: 1,
                    team: "1323",
                    matchType: "qm",
                    matchNo: 15,
                    teammates: ["254", "971"],
                    autonPoints: 18,
                    autonMissed: 6,
                    teleopCoral: 7,
                    teleopCoralAccuracy: "78%",
                    teleopBarge: 2,
                    teleopBargeMissed: 1,
                    teleopProcessor: 4,
                    climb: "Mid",
                    driverSkill: "High",
                    faults: 0,
                    notes: "Strong coral cyclesStrong coral cyclesStrong coral cyclesStrong coral cyclesStrong coral cycles",
                },
            ],
            columnDefs: [
                {
                    headerName: "Match Info",
                    children: [
                        {headerName: "Team", field: "team", sortable: true, filter: true},
                        {
                            headerName: "Match Type",
                            field: "matchType",
                            sortable: true,
                            filter: true,
                            valueFormatter: (params: { value: string; }) => {
                                const map: Record<string, string> = {
                                    qm: "Qualifications",
                                    sf: "Playoffs",
                                    f: "Finals",
                                };
                                return map[params.value] ?? params.value;
                            },
                        },
                        {headerName: "Match No.", field: "matchNo", sortable: true, filter: true},
                        {
                            headerName: "Teammates",
                            field: "teammates",
                            sortable: true,
                            filter: true,
                            valueFormatter: (params: any) => params.value.join(", "),
                        },
                    ],
                },
                {
                    headerName: "Auton",
                    children: [
                        {headerName: "Points", field: "autonPoints", sortable: true, filter: true},
                        {headerName: "Missed", field: "autonMissed", sortable: true, filter: true},
                    ],
                },
                {
                    headerName: "Teleop",
                    children: [
                        {headerName: "Coral Cycles", field: "teleopCoral", sortable: true, filter: true},
                        {headerName: "Coral Accuracy", field: "teleopCoralAccuracy", sortable: true, filter: true},
                        {headerName: "Barge", field: "teleopBarge", sortable: true, filter: true},
                        {headerName: "Barge Missed", field: "teleopBargeMissed", sortable: true, filter: true},
                        {headerName: "Processor", field: "teleopProcessor", sortable: true, filter: true},
                    ],
                },
                {
                    headerName: "Endgame",
                    children: [
                        {headerName: "Climb", field: "climb", sortable: true, filter: true},
                    ],
                },
                {
                    headerName: "Misc",
                    children: [
                        {headerName: "Driver Skill", field: "driverSkill", sortable: true, filter: true},
                        {headerName: "Faults", field: "faults", sortable: true, filter: true},
                        {headerName: "Notes", field: "notes", sortable: true, filter: true},
                    ],
                },
            ],
        },
        rankings: {
            label: "Team Rankings",
            rowData: [
                {
                    team: "973",
                    rpRank: 1,
                    avgScore: 136.5,
                    hRank: 2,
                    aiRank: 1,
                    winRate: "92%",
                    avgAuton: 26,
                    avgAutonPiece: 5.3,
                    autonStdDev: 1.2,
                    avgTeleopCycle: 9.4,
                    teleopAccL4: "83%",
                    teleopAccL3: "78%",
                    teleopAccL2: "65%",
                    teleopAccL1: "90%",
                    avgTeleopAlgae: 3.2,
                    teleopAlgaeAcc: "88%",
                    climbRate: "96%",
                    stdDevScore: 4.8,
                    faults: 0,
                },
                {
                    team: "1323",
                    rpRank: 3,
                    avgScore: 128.7,
                    hRank: 4,
                    aiRank: 3,
                    winRate: "85%",
                    avgAuton: 24,
                    avgAutonPiece: 4.9,
                    autonStdDev: 1.6,
                    avgTeleopCycle: 8.7,
                    teleopAccL4: "79%",
                    teleopAccL3: "74%",
                    teleopAccL2: "68%",
                    teleopAccL1: "92%",
                    avgTeleopAlgae: 2.8,
                    teleopAlgaeAcc: "83%",
                    climbRate: "91%",
                    stdDevScore: 5.2,
                    faults: 1,
                },
            ],
            columnDefs: [
                {
                    headerName: "Team Info",
                    children: [
                        {
                            headerName: "Team",
                            field: "team",
                            sortable: true,
                            filter: true,
                            onCellClicked: (params: { value: any; }) => {
                                const teamNumber = Number(params.value);
                                if (!isNaN(teamNumber)) setTeamNum(teamNumber);
                            },
                            cellStyle: {cursor: "pointer"}
                        },
                        {headerName: "RP Rank", field: "rpRank", sortable: true, filter: true},
                    ],
                },
                {
                    headerName: "Summary",
                    children: [
                        {headerName: "Avg Score", field: "avgScore", sortable: true, filter: true},
                        {headerName: "H Rank", field: "hRank", sortable: true, filter: true},
                        {headerName: "AI Rank", field: "aiRank", sortable: true, filter: true},
                        {headerName: "Win Rate", field: "winRate", sortable: true, filter: true},
                        {headerName: "Score Std Dev", field: "stdDevScore", sortable: true, filter: true},
                        {headerName: "Faults", field: "faults", sortable: true, filter: true},
                    ],
                },
                {
                    headerName: "Autonomous",
                    children: [
                        {headerName: "Avg Auton", field: "avgAuton", sortable: true, filter: true},
                        {headerName: "Auton Pieces", field: "avgAutonPiece", sortable: true, filter: true},
                        {headerName: "Auton Std Dev", field: "autonStdDev", sortable: true, filter: true},
                    ],
                },
                {
                    headerName: "Tele-operated",
                    children: [
                        {headerName: "Avg Cycle", field: "avgTeleopCycle", sortable: true, filter: true},
                        {headerName: "L4 Acc", field: "teleopAccL4", sortable: true, filter: true},
                        {headerName: "L3 Acc", field: "teleopAccL3", sortable: true, filter: true},
                        {headerName: "L2 Acc", field: "teleopAccL2", sortable: true, filter: true},
                        {headerName: "L1 Acc", field: "teleopAccL1", sortable: true, filter: true},
                        {headerName: "Algae Cycles", field: "avgTeleopAlgae", sortable: true, filter: true},
                        {headerName: "Algae Acc", field: "teleopAlgaeAcc", sortable: true, filter: true},
                    ],
                },
                {
                    headerName: "Endgame",
                    children: [
                        {headerName: "Climb Rate", field: "climbRate", sortable: true, filter: true},
                    ],
                },
            ],

        },
    };


    const gridContainerRef = useRef<HTMLDivElement>(null);

    const gridRef = useRef<AgGridReact>(null);

    const handleGridReady = (params: GridReadyEvent) => {
        const originalWidth = gridContainerRef.current?.style.width;

        // Temporarily expand container to render all columns
        if (gridContainerRef.current) {
            gridContainerRef.current.style.width = "5000px";
        }

        // Wait for paint
        requestAnimationFrame(() => {
            const allCols = params.api.getColumns() ?? [];
            const allIds = allCols.map(col => col.getColId());
            params.api.autoSizeColumns(allIds);

            // Restore container width
            if (gridContainerRef.current) {
                gridContainerRef.current.style.width = originalWidth || "100%";
            }
        });

    };

    const handleAutosize = () => {
        if (!gridRef.current || !gridContainerRef.current) return;

        const originalWidth = gridContainerRef.current.style.width;
        gridContainerRef.current.style.width = "5000px";

        const allCols = gridRef.current.api.getColumns() ?? [];
        const colIds = allCols.map((c) => c.getColId());
        gridRef.current.api.autoSizeColumns(colIds);

        gridContainerRef.current.style.width = originalWidth || "100%";
    };

    const setTableTypeResized = (type: TableType) => {
        setTableType(type);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (!gridRef.current || !gridContainerRef.current) return;

                const originalWidth = gridContainerRef.current.style.width;
                gridContainerRef.current.style.width = "5000px";

                const allCols = gridRef.current.api.getColumns() ?? [];
                const colIds = allCols.map((c) => c.getColId());
                gridRef.current.api.autoSizeColumns(colIds);

                gridContainerRef.current.style.width = originalWidth || "100%";

            });

        });
    };


    return (
        <div className="h-screen flex flex-col">
            {/* Top Split */}
            <div className="flex-1 flex overflow-hidden select-none border-b-3 border-zinc-400 h-full">
                <Resizable axis="x" initial={1000} min={300}>
                    {({position, separatorProps}) => (
                        <>
                            <div className="bg-white p-4" style={{width: position}}>
                                <div className="mb-2 text-lg flex flex-row space-x-3">
                                    <div className="font-semibold">
                                        {tableConfig[tableType].label} Table
                                    </div>

                                    <Select value={tableType}
                                            onValueChange={(value: string) => setTableTypeResized(value as TableType)}>
                                        <SelectTrigger className="w-[200px]">
                                            <SelectValue placeholder="Select table type"/>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {Object.entries(tableConfig).map(([key, cfg]) => (
                                                <SelectItem key={key} value={key}>
                                                    {cfg.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>


                                </div>
                                <div ref={gridContainerRef}
                                     className="ag-theme-alpine p-2 w-[100%] h-[calc(100%-36px)]">
                                    <AgGridReact
                                        ref={gridRef}
                                        rowData={tableConfig[tableType].rowData}
                                        columnDefs={tableConfig[tableType].columnDefs}
                                        defaultColDef={{
                                            sortable: true,
                                            filter: true,
                                            resizable: true,
                                        }}
                                        pagination={true}
                                        animateRows={true}
                                        onGridReady={handleGridReady}
                                        onGridColumnsChanged={handleAutosize}
                                    />

                                </div>
                            </div>

                            <div
                                {...separatorProps}
                                className="w-2 bg-gray-400 hover:bg-gray-500 data-[resizing]:bg-gray-600 cursor-col-resize"
                            />

                            <div className="flex-1 bg-white flex flex-col min-h-0 p-4">
                                <div className="font-semibold mb-2 text-lg">
                                    {graphConfig[graphType].label} Graph
                                </div>

                                <div className="flex flex-row flex-wrap space-x-3 space-y-1">
                                    {/* Graph type selector */}
                                    <Select value={graphType} onValueChange={(v) => setGraphType(v as GraphType)}>
                                        <SelectTrigger className="w-[200px]">
                                            <SelectValue placeholder="Select graph type"/>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {Object.entries(graphConfig).map(([key, cfg]) => (
                                                <SelectItem key={key} value={key}>
                                                    {cfg.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    {/* Dynamic controls */}
                                    {graphConfig[graphType].controls}
                                </div>

                                <div className="flex-1 overflow-hidden">
                                    {graphConfig[graphType].chart()}
                                </div>
                            </div>

                        </>
                    )}
                </Resizable>
            </div>
            {/* Bottom Team Detail */}
            <div className="h-[250px] bg-white p-4 @container">
                <div
                    className="flex w-full h-full overflow-x-auto border border-gray-400 h-sm:bg-zinc-600 bg-zinc-100 rounded-xl shadow-sm text-sm">

                    {/* Identity */}
                    <div className="flex flex-col items-center justify-center px-4 w-[160px] border-r border-gray-400">
                        <img src={_teamMap.get(teamNum)?.logoUrl || ""} alt="Team Logo"
                             className="h-12 w-12 object-contain mb-1"/>
                        <div className="font-bold text-base">{teamNum}</div>
                        <div className="text-gray-600">{_teamMap.get(teamNum)?.nickname || "No Nickname"}</div>
                        <div className="text-xs text-gray-500">
                            RP Rank: {_teamMap.get(teamNum)?.rank ?? "N/A"} / {totalTeam}
                        </div>
                    </div>

                    {/* Summary */}
                    <div className="flex flex-col items-start px-4 pt-3 w-[150px] border-r border-gray-400">
                        <div className="font-semibold mb-2">Summary</div>
                        <div className="flex flex-col gap-3">
                            {_teamMap.get(teamNum)?.summary?.length ?? 0 > 0 ? (
                                _teamMap.get(teamNum)?.summary.map((item, idx) => {
                                    const rel = item.reliability;
                                    let r: number, g: number, b: number;

                                    if (rel <= 50) {
                                        // Red → Yellow
                                        r = 255;
                                        g = Math.round((rel / 50) * 255);
                                        b = 80;
                                    } else if (rel <= 90) {
                                        // Yellow → Green
                                        r = Math.round(255 - ((rel - 50) / 40) * 255);
                                        g = 255;
                                        b = 80;
                                    } else {
                                        // Green → Blue
                                        const t = (rel - 90) / 10; // 0 to 1
                                        r = 0
                                        g = Math.round((1 - t) * 255 + t * 180);
                                        b = Math.round((1 - t) * 80 + t * 255);
                                    }

                                    const color = `rgb(${r}, ${g}, ${b})`;

                                    return (
                                        <div key={idx} className="flex flex-col">
                                            <div className="flex justify-between text-sm font-semibold">
                                                <span>{item.label}:</span>
                                                <span>{item.summary} {item.unit}</span>
                                            </div>
                                            <div className="w-full h-2 mt-1 rounded-full bg-zinc-200">
                                                <div
                                                    className="h-2 rounded-full transition-all duration-300"
                                                    style={{
                                                        width: `${rel}%`,
                                                        backgroundColor: color
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="text-sm text-gray-400">No summary available</div>
                            )}

                        </div>
                    </div>

                    {/* Capabilities */}
                    <div className="flex flex-col items-start px-4 pt-3 w-[250px] border-r border-gray-400">
                        <div className="font-semibold mb-1">Capabilities</div>
                        <div className="flex flex-wrap gap-1 text-xs">
                            {(_teamMap.get(teamNum)?.capabilities?.length ?? 0) > 0 ? (
                                _teamMap.get(teamNum)?.capabilities.map((cap, i) => (
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
                                <div className="text-sm text-gray-400">No capabilities listed</div>
                            )}
                        </div>
                    </div>

                    {/* Rankings */}
                    <div className="flex flex-col items-start px-4 pt-3 w-[200px] border-r border-gray-400">
                        <div className="font-semibold mb-1">Rankings</div>
                        {(_teamMap.get(teamNum)?.rankings?.length ?? 0) > 0 ? (
                            <div className="flex-1 w-full flex items-center justify-center">
                                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                                    {_teamMap.get(teamNum)?.rankings.map((r, i) => {
                                        const rankRatio = r.rank / totalTeam;
                                        const percentile = r.percentile;

                                        let rankColor;
                                        let percentileColor;

                                        if (rankRatio <= 0.05) rankColor = "text-blue-500";
                                        else if (rankRatio <= 0.25) rankColor = "text-green-500";
                                        else if (rankRatio <= 0.5) rankColor = "text-orange-500";
                                        else if (rankRatio <= 0.75) rankColor = "text-yellow-500";
                                        else rankColor = "text-red-500";

                                        if (percentile <= 5) percentileColor = "text-blue-500";
                                        else if (percentile <= 25) percentileColor = "text-green-500";
                                        else if (percentile <= 50) percentileColor = "text-orange-500";
                                        else if (percentile <= 75) percentileColor = "text-yellow-500";
                                        else percentileColor = "text-red-500";

                                        return (
                                            <React.Fragment key={i}>
                                                <div>{r.label}:</div>
                                                <div>
                                                    <span className={`${rankColor} font-semibold`}>#{r.rank}</span>{" "}
                                                    (<span
                                                    className={`${percentileColor} font-semibold`}>{r.percentile}%</span>)
                                                </div>
                                            </React.Fragment>
                                        );
                                    })}

                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-gray-400">No rankings available</div>
                        )}
                    </div>

                    {/* Match History */}
                    <div className="flex flex-col items-start px-4 pt-3 grow min-w-0">
                        <div className="font-semibold mb-1">Recent Matches</div>
                        <div className="flex gap-4 text-xs overflow-x-auto">
                            {(_teamMap.get(teamNum)?.matches?.length ?? 0) > 0 ? (
                                [..._teamMap.get(teamNum)!.matches].reverse().map((m, i) => {
                                    const color = m.result === "W" ? "text-green-600" : "text-red-600";
                                    return (
                                        <div key={i} className="flex flex-col items-center w-28">
                                            <div className="font-mono">{m.match}</div>
                                            <div className={`font-bold ${color}`}>{m.result}</div>
                                            <div>{m.score} pts</div>
                                            <div className="text-gray-500">AI: {m.pred_ai}</div>
                                            <div className="text-gray-500">H: {m.pred_heur}</div>
                                            <div className="text-gray-500">
                                                w/{" "}
                                                {m.teammates
                                                    .filter((n: number) => n !== teamNum)
                                                    .map((num: number, j: number) => (
                                                        <span
                                                            key={`tm-${j}`}
                                                            className="cursor-pointer"
                                                            onClick={() => setTeamNum(num)}
                                                        >{num}
                                                            {j < m.teammates.length - 2 ? ", " : ""}
                                                        </span>
                                                    ))}
                                            </div>
                                            <div className="text-gray-500">
                                                vs{" "}
                                                {m.opponents.map((num: number, j: number) => (
                                                    <span
                                                        key={`opp-${j}`}
                                                        className="cursor-pointer"
                                                        onClick={() => setTeamNum(num)}
                                                    >{num}
                                                        {j < m.opponents.length - 1 ? ", " : ""}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="text-sm text-gray-400">No match data</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

