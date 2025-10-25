/* Subset of pages for displaying each team's data
Can use guest perms to view

get all data from useAPI: getProcessedData
Need to include:
team nickname(fetch using useAPI: getTeamBasicInfo), team number, team logo(in public/teams/team_icons)
Team current rp, team current ranking, team predicted rp, team predicted ranking
list of matches(past and future) with links to the match page.
rp source breakdown(pie chart)

include for 2025(future data should all be derived from data dict format):
team average l1, l2, l3, l4, barge, processor(count, and accuracy, and for auto and teleop), climb preference and success
team average score composition(pie chart)
team scores over time(line graph)
*/


// src/pages/TeamData.tsx
import React, {useEffect, useMemo, useState} from "react"
import {useParams} from "react-router-dom"
import {ResponsiveSunburst} from "@nivo/sunburst"
import {ResponsiveBar} from "@nivo/bar"

interface SunburstNode {
    id: string
    label: string
    value?: number
    color?: string
    children?: SunburstNode[]
    sumValue?: number
}

type Data = {
    ranking: {
        auto: number
        teleop: number
        endgame: number
        rp: number
        rp_pred: number
        rp_avg: number
        rp_avg_pred: number
    }
}


export default function TeamData() {
    const {team} = useParams<{ team: string }>()
    const teamNum = team ? parseInt(team, 10) : NaN

    const [teamNames, setTeamNames] = useState<Record<string, string>>({})
    const [currentRank] = useState(3)
    const [predRank] = useState(2)
    const [currentRP] = useState(2.43)
    const [predRP] = useState(2.61)
    const tags = useMemo(() => ["High Auto", "Fast Climb", "Reliable"], [])

    useEffect(() => {
        fetch("/teams/team_names.json")
            .then((res) => res.json())
            .then((data) => setTeamNames(data))
            .catch(() => setTeamNames({}))
    }, [])

    // ---------- Sample Hierarchical Score Composition ----------
    const scoreComposition = useMemo(() => {
        const data: SunburstNode = {
            id: "total",
            label: "Total",
            value: 0,
            children: [
                {
                    id: "auto",
                    label: "Auto",
                    children: [
                        {
                            id: "auto_coral",
                            label: "Coral",
                            children: [{id: "auto_l4", label: "L4", value: 21}],
                        },
                        {id: "auto_other", label: "Other", value: 3},
                    ],
                },
                {
                    id: "teleop",
                    label: "Teleop",
                    children: [
                        {
                            id: "teleop_coral",
                            label: "Coral",
                            children: [
                                {id: "teleop_l1", label: "L1", value: 12},
                                {id: "teleop_l2", label: "L2", value: 8},
                                {id: "teleop_l3", label: "L3", value: 12},
                                {id: "teleop_l4", label: "L4", value: 30},
                            ],
                        },
                        {
                            id: "teleop_algae",
                            label: "Algae",
                            children: [{id: "teleop_barge", label: "Barge", value: 16}],
                        },
                    ],
                },
                {
                    id: "endgame",
                    label: "Endgame",
                    children: [{id: "climb", label: "Climb", value: 12}],
                },
            ],
        };

        normalizeSunburst(data);
        annotateTotals(data);

        return data;
    }, []);


    // ---------- Score Over Time ----------
    const scoreTimeline = [
        {match: "QM1", auto: 45, teleop: 75, endgame: 22},
        {match: "QM2", auto: 30, teleop: 60, endgame: 22},
        {match: "QM3", auto: 42, teleop: 70, endgame: 18},
        {match: "QF1", auto: 47, teleop: 78, endgame: 20},
    ]
    const keys = Object.keys(scoreTimeline[0]).filter(k => k !== "match")

    return (
        <div className="h-screen w-screen overflow-hidden bg-gray-50 flex flex-col">
            {/* ===== Compact Single-Line Header ===== */}
            <header
                className="flex-none border-b bg-white/90 backdrop-blur px-4 py-2 flex items-center justify-between h-[3.5rem]">
                <div className="flex items-center gap-3 min-w-0">
                    <img
                        src={`/teams/team_icons/${teamNum}.png`}
                        alt="logo"
                        className="h-8 w-8 rounded bg-white object-contain ring-1 ring-gray-200"
                        onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                    />
                    <div className="truncate font-semibold text-base">
                        #{teamNum} {teamNames[teamNum]}
                    </div>
                </div>

                <div className="flex items-center gap-6 text-sm text-gray-700">
                    <div>
                        Auto Rank: #<span className="font-medium">{currentRank}</span>
                    </div>
                    <div>
                        Teleop Rank: #<span className="font-medium">{currentRP}</span>
                    </div>
                    <div>
                        Endgame Rank: #<span className="font-medium">{currentRank}</span>
                    </div>
                    <div>
                        RP Rank: #<span className="font-medium">{currentRank}</span> (pred #{predRank})
                    </div>
                    <div>
                        RP avg: <span className="font-medium">{currentRP}</span> (pred {predRP})
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {tags.map((t) => (
                            <span
                                key={t}
                                className="rounded-full border px-2 py-0.5 text-[10px] text-gray-700 bg-gray-100"
                            >
                {t}
              </span>
                        ))}
                    </div>
                </div>
            </header>

            {/* ===== 2×2 Matrix Dashboard ===== */}
            <main className="grow grid grid-cols-2 grid-rows-2 gap-2 p-2">
                <Quadrant title="Metrics Overview">
                    <Placeholder label="Metric tables (General / Auto / Endgame / Reliability)"/>
                </Quadrant>

                <Quadrant title="RP Contribution">
                    <div className="grid grid-cols-2 gap-2 h-full">
                        <Placeholder label="RP Contribution Chart (pie / bar)"/>
                        <Placeholder label="RP Contribution Details Table"/>
                    </div>
                </Quadrant>

                <Quadrant title="Match History">
                    <Placeholder label="Match History Table (6–8 rows)"/>
                </Quadrant>

                {/* D. Scoring & Trends (Sunburst + Bar Chart) */}
                <Quadrant title="Scoring & Trends">
                    <div className="grid grid-cols-2 gap-2 h-full">
                        {/* Sunburst Score Composition */}
                        <div className="h-full w-full">
                            <ResponsiveSunburst
                                data={scoreComposition}
                                margin={{top: 10, right: 10, bottom: 10, left: 10}}
                                id="id"
                                value="value"
                                cornerRadius={3}
                                borderWidth={2}
                                borderColor={{from: "color", modifiers: [["brighter", 0.2]]}}
                                colors={{scheme: "paired"}}
                                childColor={{from: "color"}}

                                // === Label Settings ===
                                enableArcLabels
                                arcLabel={(d) => (d.depth <= 3 ? d.data.label : "")}
                                arcLabelsRadiusOffset={0.65}
                                arcLabelsSkipAngle={0}
                                arcLabelsTextColor={{from: "color", modifiers: [["darker", 2]]}}

                                theme={{
                                    labels: {
                                        text: {
                                            fontSize: 12,
                                            fontWeight: 600,
                                        },
                                    },
                                }}

                                tooltip={({data, color}) => (
                                    <div style={{background: color}} className="px-2 py-1 text-xs text-white rounded">
                                        {data.label}: {data.value ?? data.sumValue ?? 0}
                                    </div>
                                )}
                            />
                        </div>

                        {/* Score Over Time */}
                        <div className="h-full w-full">
                            <ResponsiveBar
                                data={scoreTimeline}
                                keys={keys}
                                indexBy="match"
                                margin={{top: 10, right: 10, bottom: 30, left: 40}}
                                padding={0.3}
                                groupMode="stacked"
                                colors={{scheme: "set2"}}
                                axisBottom={{
                                    tickRotation: -25,
                                    tickPadding: 4,
                                    legend: "Match",
                                    legendOffset: 28,
                                }}
                                axisLeft={{
                                    legend: "Points",
                                    legendOffset: -32,
                                    legendPosition: "middle",
                                }}
                                labelSkipWidth={16}
                                labelSkipHeight={12}
                                labelTextColor={{from: "color", modifiers: [["darker", 2]]}}
                                tooltip={({id, value, color}) => (
                                    <div
                                        className="px-2 py-1 text-xs text-white rounded"
                                        style={{background: color}}
                                    >
                                        {id}: {value}
                                    </div>
                                )}
                            />
                        </div>
                    </div>
                </Quadrant>
            </main>
        </div>
    )
}

/* ============= Helpers ============= */

function Quadrant({title, children}: { title: string; children: React.ReactNode }) {
    return (
        <section
            className="rounded-lg border bg-white shadow-sm overflow-hidden flex flex-col"
            style={{height: "calc((100vh - 5rem) / 2)"}}
        >
            <div className="border-b px-3 py-1.5 text-sm font-semibold text-gray-800 shrink-0">
                {title}
            </div>
            <div className="flex-1 overflow-hidden p-2">{children}</div>
        </section>
    )
}

function Placeholder({label}: { label: string }) {
    return (
        <div
            className="h-full w-full border border-dashed rounded-lg flex items-center justify-center text-xs text-gray-500 text-center px-4">
            {label}
        </div>
    )
}

function normalizeSunburst(node: SunburstNode): number {
    // Leaf node → return its value directly
    if (!node.children || node.children.length === 0) {
        return node.value ?? 0;
    }

    // Recursively normalize children first
    const total = node.children.map(normalizeSunburst).reduce((a, b) => a + b, 0);

    // Remove parent value to avoid double-counting
    delete node.value;

    // Return summed total for parent's computation
    return total;
}

function annotateTotals(node: SunburstNode): number {
    // Leaf → return its value
    if (!node.children || node.children.length === 0) {
        return node.value ?? 0;
    }

    // Recursively compute children's totals
    const total = node.children.map(annotateTotals).reduce((a, b) => a + b, 0);

    // Store total for tooltip/reference use
    node.sumValue = total;

    return total;
}
