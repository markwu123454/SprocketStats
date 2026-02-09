// src/pages/blocks/ScoringTrendsBlock.tsx
import {useMemo} from "react"
import {ResponsiveSunburst} from "@nivo/sunburst"
import {ResponsiveBar} from "@nivo/bar"

type BreakdownNode = {
    id: string
    label: string
    value?: number
    children?: BreakdownNode[]
    sumValue?: number
}

export default function ScoringTrendsBlock({data}: any) {
    const breakdown = data.breakdown ?? {id: 'root', label: 'Score', children: []}
    const timeline = data.timeline ?? []

    const scoreComposition = useMemo(() => buildScoreComposition(breakdown), [breakdown])
    const keys = useMemo(
        () => (timeline?.length ? Object.keys(timeline[0]).filter((k) => k !== "match") : []),
        [timeline]
    )

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full p-4">
            {/* Sunburst Chart */}
            <div className="h-full min-h-[400px]">
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
                        <div
                            style={{background: color}}
                            className="px-2 py-1 text-xs text-white rounded"
                        >
                            {data.label}: {data.value ?? data.sumValue ?? 0}
                        </div>
                    )}
                    animate={false}
                />
            </div>

            {/* Bar Chart */}
            <div className="h-full min-h-[400px]">
                <ResponsiveBar
                    data={timeline}
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
    annotateTotals(clone)
    return clone
}

function annotateTotals(node: BreakdownNode): number {
    if (!node.children || node.children.length === 0) return node.value ?? 0
    const total = node.children.map(annotateTotals).reduce((a, b) => a + b, 0)
    node.sumValue = total
    return total
}