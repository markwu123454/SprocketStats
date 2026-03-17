// src/pages/blocks/ScoringTrendsBlock.tsx
import {useMemo} from "react"
import {ResponsiveSunburst} from "@nivo/sunburst"
import {ResponsiveBar} from "@nivo/bar"

type BreakdownNode = {
    id: string
    label: string
    value?: number
    actualValue?: number
    children?: BreakdownNode[]
    sumValue?: number
}

const AUTO_PTS: Record<string, number> = {Level1: 15, Level2: 30, Level3: 45, None: 0}
const TELEOP_PTS: Record<string, number> = {Level1: 15, Level2: 15, Level3: 15, None: 0}

const SUNBURST_COLORS: Record<string, string> = {
    auto_climb: "#60a5fa",
    auto_scored: "#2563eb",

    teleop_climb: "#fb923c",

    teleop_phase1: "#fde047",
    teleop_phase2: "#facc15",
    teleop_endgame: "#f59e0b",
    teleop_transition: "#fbbf24",
}

export default function ScoringTrendsBlock({data}: any) {

    const customTimeline = useMemo(() => {
        if (!data?.matches || !data?.fuel) return []

        return data.matches.map((m: any) => {
            const matchKey = m.match
            const fuelData = data.fuel?.[matchKey] || {}

            return {
                match: matchKey,
                "Auto Climb": AUTO_PTS[fuelData.autonclimb || "None"] || 0,
                "Auto Scored": fuelData.auto?.fuel || 0,
                "Teleop Phase 1": fuelData.phase_1?.fuel || 0,
                "Teleop Phase 2": fuelData.phase_2?.fuel || 0,
                "Teleop Endgame": fuelData.endgame?.fuel || 0,
                "Teleop Transition": fuelData.teleop?.fuel ?? fuelData.transition?.fuel ?? 0,
                "Teleop Climb": TELEOP_PTS[fuelData.teleopclimb || "None"] || 0,
            }
        })
    }, [data])

    const customBreakdown = useMemo(() => {

        if (!customTimeline.length) {
            return {id: "total", label: "Total Score", children: []}
        }

        let sumAutoClimb = 0
        let sumAutoScored = 0
        let sumTeleopPhase1 = 0
        let sumTeleopPhase2 = 0
        let sumTeleopEndgame = 0
        let sumTeleopTransition = 0
        let sumTeleopClimb = 0

        customTimeline.forEach((t: any) => {
            sumAutoClimb += t["Auto Climb"]
            sumAutoScored += t["Auto Scored"]
            sumTeleopPhase1 += t["Teleop Phase 1"]
            sumTeleopPhase2 += t["Teleop Phase 2"]
            sumTeleopEndgame += t["Teleop Endgame"]
            sumTeleopTransition += t["Teleop Transition"]
            sumTeleopClimb += t["Teleop Climb"]
        })

        const count = customTimeline.length

        return {
            id: "total",
            label: "Total Score",
            children: [
                {
                    id: "auto",
                    label: "Auto",
                    children: [
                        {
                            id: "auto_climb",
                            label: "Climb",
                            value: Number((sumAutoClimb / count).toFixed(1)),
                            actualValue: Number((sumAutoClimb / count).toFixed(1))
                        },
                        {
                            id: "auto_scored",
                            label: "Scored",
                            value: Number((sumAutoScored / count).toFixed(1)),
                            actualValue: Number((sumAutoScored / count).toFixed(1))
                        }
                    ]
                },
                {
                    id: "teleop",
                    label: "Teleop",
                    children: [
                        {
                            id: "teleop_climb",
                            label: "Climb",
                            value: Number((sumTeleopClimb / count).toFixed(1)),
                            actualValue: Number((sumTeleopClimb / count).toFixed(1))
                        },
                        {
                            id: "teleop_scored",
                            label: "Scored",
                            children: [
                                {
                                    id: "teleop_phase1",
                                    label: "Phase 1",
                                    value: Number((sumTeleopPhase1 / count).toFixed(1)),
                                    actualValue: Number((sumTeleopPhase1 / count).toFixed(1))
                                },
                                {
                                    id: "teleop_phase2",
                                    label: "Phase 2",
                                    value: Number((sumTeleopPhase2 / count).toFixed(1)),
                                    actualValue: Number((sumTeleopPhase2 / count).toFixed(1))
                                },
                                {
                                    id: "teleop_endgame",
                                    label: "Endgame",
                                    value: Number((sumTeleopEndgame / count).toFixed(1)),
                                    actualValue: Number((sumTeleopEndgame / count).toFixed(1))
                                },
                                {
                                    id: "teleop_transition",
                                    label: "Transition",
                                    value: Number((sumTeleopTransition / count).toFixed(1)),
                                    actualValue: Number((sumTeleopTransition / count).toFixed(1))
                                }
                            ]
                        }
                    ]
                }
            ]
        }

    }, [customTimeline])

    const scoreComposition = useMemo(() => {
        if (!customBreakdown?.children) {
            return {id: "empty", label: "Empty", children: []}
        }
        return buildScoreComposition(customBreakdown)
    }, [customBreakdown])

    const keys = useMemo(() => (
        customTimeline.length
            ? Object.keys(customTimeline[0]).filter((k) => k !== "match")
            : []
    ), [customTimeline])

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full p-4">

            {/* Sunburst */}
            <div className="h-full min-h-[400px]">
                {scoreComposition?.children?.length > 0 && (
                    <ResponsiveSunburst
                        data={scoreComposition}
                        margin={{top: 10, right: 10, bottom: 10, left: 10}}
                        id="id"
                        value="value"

                        cornerRadius={4}

                        colors={{scheme: "set2"}}
                        childColor={{
                            from: "color",
                            modifiers: [["brighter", 0.4]]
                        }}

                        borderWidth={4}
                        borderColor="#ffffff"

                        enableArcLabels
                        arcLabel={(d) => (d.depth <= 3 ? d.data.label : "")}
                        arcLabelsRadiusOffset={0.65}
                        arcLabelsSkipAngle={0}

                        arcLabelsTextColor={{
                            from: "color",
                            modifiers: [["darker", 3]]
                        }}

                        tooltip={({data, color}) => (
                            <div
                                style={{background: color}}
                                className="px-2 py-1 text-xs text-white rounded"
                            >
                                {data.label}: {data.actualValue ?? data.sumValue ?? data.value ?? 0}
                            </div>
                        )}

                        animate={false}
                    />
                )}
            </div>

            {/* Bar Chart */}
            <div className="h-full min-h-[400px]">
                <ResponsiveBar
                    data={customTimeline}
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

                    animate={false}
                />
            </div>

        </div>
    )
}

function buildScoreComposition(root: BreakdownNode): BreakdownNode {
    const clone: BreakdownNode = structuredClone(root)

    if (!clone.children) clone.children = []

    annotateTotals(clone)

    const cleaned = removeZeroNodes(clone)

    return cleaned || {id: "empty", label: "Empty", children: []}
}

function annotateTotals(node: BreakdownNode): number {
    if (!node.children || node.children.length === 0) {
        return node.actualValue ?? node.value ?? 0
    }

    const total = node.children
        .map(annotateTotals)
        .reduce((a, b) => a + b, 0)

    node.sumValue = Number(total.toFixed(1))

    return node.sumValue
}

function removeZeroNodes(node: BreakdownNode): BreakdownNode | null {
    if (!node.children || node.children.length === 0) {
        const val = node.actualValue ?? node.value ?? node.sumValue ?? 0
        return val === 0 ? null : node
    }

    const filteredChildren = node.children
        .map(removeZeroNodes)
        .filter(Boolean) as BreakdownNode[]

    if (filteredChildren.length === 0) return null

    return {
        ...node,
        children: filteredChildren
    }
}

