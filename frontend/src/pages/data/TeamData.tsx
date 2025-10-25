// src/pages/TeamData.tsx
import React, {useEffect, useMemo, useState} from "react"
import {useParams} from "react-router-dom"
import {ResponsiveSunburst} from "@nivo/sunburst"
import {ResponsiveBar} from "@nivo/bar"
import {AgGridReact} from "ag-grid-react"

interface SunburstNode {
    id: string
    label: string
    value?: number
    children?: SunburstNode[]
    sumValue?: number
}

interface ScoreBreakdown {
    auto_l4: number
    auto_other: number
    teleop_l1: number
    teleop_l2: number
    teleop_l3: number
    teleop_l4: number
    teleop_barge: number
    climb: number
}

interface TeamDataType {
    basic: {
        number: number
        name: string
        logo: string
        tags: string[]
    }
    ranking: {
        auto: number
        teleop: number
        endgame: number
        rp: number
        rp_pred: number
        rp_avg: number
        rp_avg_pred: number
    }
    matches: {
        match: string
        alliance: "Red" | "Blue"
        score: number
        result: "W" | "L"
        autoPoints: number
        teleopPoints: number
        endgamePoints: number
        rpEarned: number
    }[]
    breakdown: ScoreBreakdown
    timeline: { match: string; [k: string]: number | string }[]
}

export default function TeamData() {
    const {team} = useParams<{ team: string }>()
    const teamNum = team ? parseInt(team, 10) : NaN

    const [data, setData] = useState<TeamDataType | null>(null)

    useEffect(() => {
        setTimeout(() => {
            const placeholder: TeamDataType = {
                basic: {
                    number: teamNum,
                    name: "Placeholder Team",
                    logo: `/teams/team_icons/${teamNum}.png`,
                    tags: ["High Auto", "Fast Climb", "Reliable"],
                },
                ranking: {
                    auto: 5,
                    teleop: 2,
                    endgame: 3,
                    rp: 3,
                    rp_pred: 4,
                    rp_avg: 2.32,
                    rp_avg_pred: 2.1,
                },
                matches: [
                    {
                        match: "QM1",
                        alliance: "Red",
                        score: 132,
                        result: "W",
                        autoPoints: 45,
                        teleopPoints: 75,
                        endgamePoints: 12,
                        rpEarned: 4
                    },
                    {
                        match: "QM2",
                        alliance: "Blue",
                        score: 104,
                        result: "L",
                        autoPoints: 30,
                        teleopPoints: 60,
                        endgamePoints: 14,
                        rpEarned: 1
                    },
                    {
                        match: "QM3",
                        alliance: "Red",
                        score: 119,
                        result: "W",
                        autoPoints: 42,
                        teleopPoints: 70,
                        endgamePoints: 7,
                        rpEarned: 4
                    },
                    {
                        match: "QF1",
                        alliance: "Blue",
                        score: 121,
                        result: "W",
                        autoPoints: 47,
                        teleopPoints: 78,
                        endgamePoints: 12,
                        rpEarned: 4
                    },
                ],
                breakdown: {
                    auto_l4: 21,
                    auto_other: 3,
                    teleop_l1: 12,
                    teleop_l2: 8,
                    teleop_l3: 12,
                    teleop_l4: 30,
                    teleop_barge: 16,
                    climb: 12,
                },
                timeline: [
                    {match: "QM1", auto: 45, teleop: 75, endgame: 12},
                    {match: "QM2", auto: 30, teleop: 60, endgame: 12},
                    {match: "QM3", auto: 42, teleop: 70, endgame: 3},
                    {match: "QF1", auto: 47, teleop: 78, endgame: 12},
                ],
            }
            setData(placeholder)
        }, 1000)
    }, [teamNum])

    const [colDefs] = useState([
        {field: "match", headerName: "Match", width: 90, pinned: "left"},
        {field: "alliance", headerName: "Alliance", width: 100},
        {field: "score", headerName: "Score", width: 100, type: "numericColumn"},
        {field: "result", headerName: "Result", width: 100},
        {field: "autoPoints", headerName: "Auto", width: 80},
        {field: "teleopPoints", headerName: "Teleop", width: 90},
        {field: "endgamePoints", headerName: "Endgame", width: 100},
        {field: "rpEarned", headerName: "RP", width: 70},
    ])

    const scoreComposition = useMemo(
        () => (data ? buildScoreComposition(data.breakdown) : {id: "empty", label: "Empty", value: 0}),
        [data]
    )

    const keys = useMemo(() => (data ? Object.keys(data.timeline[0]).filter(k => k !== "match") : []), [data])

    if (!data)
        return (
            <div className="flex h-screen w-screen items-center justify-center text-gray-500 text-sm">
                Loading team data…
            </div>
        )

    return (
        <div className="h-screen w-screen overflow-hidden bg-gray-50 flex flex-col">
            {/* ===== Header ===== */}
            <header
                className="flex-none border-b bg-white/90 backdrop-blur px-4 py-2 flex items-center justify-between h-[3.5rem]">
                <div className="flex items-center gap-3 min-w-0">
                    <img
                        src={data.basic.logo}
                        alt="logo"
                        className="h-8 w-8 rounded bg-white object-contain ring-1 ring-gray-200"
                        onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                    />
                    <div className="truncate font-semibold text-base">
                        #{data.basic.number} {data.basic.name}
                    </div>
                </div>

                <div className="flex items-center gap-6 text-sm text-gray-700">
                    <div>Auto Rank: #{data.ranking.auto}</div>
                    <div>Teleop Rank: #{data.ranking.teleop}</div>
                    <div>Endgame Rank: #{data.ranking.endgame}</div>
                    <div>RP Rank: #{data.ranking.rp} (pred #{data.ranking.rp_pred})</div>
                    <div>RP avg: {data.ranking.rp_avg} (pred {data.ranking.rp_avg_pred})</div>
                    <div className="flex flex-wrap gap-1">
                        {data.basic.tags.map((t) => (
                            <span key={t}
                                  className="rounded-full border px-2 py-0.5 text-[10px] text-gray-700 bg-gray-100">
                                {t}
                            </span>
                        ))}
                    </div>
                </div>
            </header>

            {/* ===== Main Dashboard ===== */}
            <main className="grow grid grid-cols-2 grid-rows-2 gap-2 p-2">
                <Quadrant title="Metrics Overview">
                    <div className="p-4">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2 text-sm">
                            {Object.entries({
                                "RP": "32",
                                "R": "87%",
                                "score stdev": "3.5",
                                "kmeans stdev": "2.43",
                                "kmeans variance": "0.487",
                                "CPU Load": "64%",
                                "Memory Usage": "1.2 GB",
                                "Stability": "Good",
                                "Mode": "Auto",
                            }).map(([key, val]) => (
                                <div key={key} className="flex justify-between border-b border-gray-100 py-1">
                                    <span className="text-gray-500">{key}</span>
                                    <span className="font-medium text-gray-900">{val}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </Quadrant>

                <Quadrant title="RP Contribution">
                    <div className="grid grid-cols-2 gap-2 h-full">
                        <Placeholder label="RP Contribution Chart (pie / bar)"/>
                        <Placeholder label="RP Contribution Details Table"/>
                    </div>
                </Quadrant>

                <Quadrant title="Match History">
                    <div className="h-full w-full ag-theme-quartz">
                        <AgGridReact rowData={data.matches} columnDefs={colDefs} domLayout="autoHeight" animateRows
                                     pagination={false} suppressCellFocus/>
                    </div>
                </Quadrant>

                <Quadrant title="Scoring & Trends">
                    <div className="grid grid-cols-2 gap-2 h-full">
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
                                enableArcLabels
                                arcLabel={(d) => (d.depth <= 3 ? d.data.label : "")}
                                arcLabelsRadiusOffset={0.65}
                                arcLabelsSkipAngle={0}
                                arcLabelsTextColor={{from: "color", modifiers: [["darker", 2]]}}
                                tooltip={({data, color}) => (
                                    <div style={{background: color}} className="px-2 py-1 text-xs text-white rounded">
                                        {data.label}: {data.value ?? data.sumValue ?? 0}
                                    </div>
                                )}
                            />
                        </div>

                        <div className="h-full w-full">
                            <ResponsiveBar
                                data={data.timeline}
                                keys={keys}
                                indexBy="match"
                                margin={{top: 10, right: 10, bottom: 30, left: 40}}
                                padding={0.3}
                                groupMode="stacked"
                                colors={{scheme: "set2"}}
                                axisBottom={{tickRotation: -25, tickPadding: 4, legend: "Match", legendOffset: 28}}
                                axisLeft={{legend: "Points", legendOffset: -32, legendPosition: "middle"}}
                                labelSkipWidth={16}
                                labelSkipHeight={12}
                                labelTextColor={{from: "color", modifiers: [["darker", 2]]}}
                                tooltip={({id, value, color}) => (
                                    <div className="px-2 py-1 text-xs text-white rounded" style={{background: color}}>
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

/* ===== Helpers ===== */

function Quadrant({title, children}: { title: string; children: React.ReactNode }) {
    return (
        <section className="rounded-lg border bg-white shadow-sm overflow-hidden flex flex-col"
                 style={{height: "calc((100vh - 5rem) / 2)"}}>
            <div className="border-b px-3 py-1.5 text-sm font-semibold text-gray-800 shrink-0">{title}</div>
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

/* ===== Sunburst Builder ===== */

function buildScoreComposition(breakdown: ScoreBreakdown): SunburstNode {
    const data: SunburstNode = {
        id: "total",
        label: "Total",
        children: [
            {
                id: "auto",
                label: "Auto",
                children: [
                    {
                        id: "auto_coral",
                        label: "Coral",
                        children: [{id: "auto_l4", label: "L4", value: breakdown.auto_l4}]
                    },
                    {id: "auto_other", label: "Other", value: breakdown.auto_other},
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
                            {id: "teleop_l1", label: "L1", value: breakdown.teleop_l1},
                            {id: "teleop_l2", label: "L2", value: breakdown.teleop_l2},
                            {id: "teleop_l3", label: "L3", value: breakdown.teleop_l3},
                            {id: "teleop_l4", label: "L4", value: breakdown.teleop_l4},
                        ],
                    },
                    {
                        id: "teleop_algae",
                        label: "Algae",
                        children: [{id: "teleop_barge", label: "Barge", value: breakdown.teleop_barge}],
                    },
                ],
            },
            {id: "endgame", label: "Endgame", children: [{id: "climb", label: "Climb", value: breakdown.climb}]},
        ],
    }
    normalizeSunburst(data)
    annotateTotals(data)
    return data
}

function normalizeSunburst(node: SunburstNode): number {
    if (!node.children || node.children.length === 0) return node.value ?? 0
    const total = node.children.map(normalizeSunburst).reduce((a, b) => a + b, 0)
    delete node.value
    return total
}

function annotateTotals(node: SunburstNode): number {
    if (!node.children || node.children.length === 0) return node.value ?? 0
    const total = node.children.map(annotateTotals).reduce((a, b) => a + b, 0)
    node.sumValue = total
    return total
}
