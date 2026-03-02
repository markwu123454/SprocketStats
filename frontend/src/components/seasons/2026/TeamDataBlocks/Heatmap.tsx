import {useMemo, useState} from "react"
import type {TeamData, TeamShotData} from "@/components/wrappers/DataWrapper.tsx"

const FIELD_IMG = "/seasons/2026/field-lovat.png"

type AllianceSide = "red" | "blue"

// Reef center on the red (left) side of the field
const REEF_CENTER_RED = {x: 0.285, y: 0.500}
// Reef center on the blue (right) side
const REEF_CENTER_BLUE = {x: 1 - 0.285, y: 0.500}

function accuracyColor(shot: TeamShotData): string {
    if (shot.fuelShot === 0) return "rgba(156,163,175,0.7)"
    const ratio = Math.min(1, Math.max(0, shot.fuelScored / shot.fuelShot))
    const r = Math.round(239 + (34 - 239) * ratio)
    const g = Math.round(68 + (197 - 68) * ratio)
    const b = Math.round(68 + (94 - 68) * ratio)
    return `rgba(${r},${g},${b},0.8)`
}

function shotRadius(shot: TeamShotData): number {
    const fuel = shot.fuelShot
    if (fuel === 0) return 6
    if (fuel <= 3) return 8
    if (fuel <= 8) return 11
    if (fuel <= 15) return 14
    return 17
}

function shotAlliance(shot: TeamShotData): AllianceSide {
    return shot.x1 < 0.5 ? "red" : "blue"
}

const ARROW_LEN = 20

export default function HeatmapBlock({data}: {data: TeamData}) {
    const shots = data.shots ?? []
    const [alliance, setAlliance] = useState<AllianceSide>("red")

    const filteredShots = useMemo(
        () => shots.filter((s) => shotAlliance(s) === alliance),
        [shots, alliance]
    )

    const hub = alliance === "red" ? REEF_CENTER_RED : REEF_CENTER_BLUE

    // Show only the relevant half: Red = left (0-500), Blue = right (500-1000)
    const viewBox = alliance === "red" ? "0 0 500 500" : "500 0 500 500"

    if (shots.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-gray-400 text-xs">
                No shot data available
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full p-3 gap-2">
            {/* Alliance toggle */}
            <div className="flex items-center gap-1 shrink-0">
                <button
                    onClick={() => setAlliance("red")}
                    className={`px-2 py-0.5 text-xs rounded border ${
                        alliance === "red"
                            ? "bg-red-600 text-white border-red-600"
                            : "bg-white text-gray-600 border-gray-300"
                    }`}
                >
                    Red
                </button>
                <button
                    onClick={() => setAlliance("blue")}
                    className={`px-2 py-0.5 text-xs rounded border ${
                        alliance === "blue"
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-600 border-gray-300"
                    }`}
                >
                    Blue
                </button>
                <span className="text-[11px] text-gray-400 ml-2">
                    {filteredShots.length} shot{filteredShots.length !== 1 ? "s" : ""}
                </span>
            </div>

            {/* Field + overlay — SVG-only so viewBox crops image and dots together */}
            <div className="relative flex-1 min-h-0">
                <svg
                    className="w-full h-full"
                    viewBox={viewBox}
                    preserveAspectRatio="xMidYMid meet"
                >
                    <defs>
                        <marker
                            id="arrowhead"
                            markerWidth="6"
                            markerHeight="4"
                            refX="5"
                            refY="2"
                            orient="auto"
                        >
                            <polygon
                                points="0 0, 6 2, 0 4"
                                fill="rgba(255,255,255,0.6)"
                            />
                        </marker>
                    </defs>

                    {/* Field background */}
                    <image
                        href={FIELD_IMG}
                        x="0"
                        y="0"
                        width="1000"
                        height="500"
                        preserveAspectRatio="none"
                    />

                    {filteredShots.map((shot, i) => {
                        const cx = shot.x1 * 1000
                        const cy = shot.y1 * 500
                        const r = shotRadius(shot)
                        const color = accuracyColor(shot)

                        // Direction vector from robot to hub
                        const hubX = hub.x * 1000
                        const hubY = hub.y * 500
                        const dx = hubX - cx
                        const dy = hubY - cy
                        const dist = Math.sqrt(dx * dx + dy * dy)
                        const nx = dist > 0 ? dx / dist : 0
                        const ny = dist > 0 ? dy / dist : 0
                        const arrowX1 = cx + nx * (r + 1)
                        const arrowY1 = cy + ny * (r + 1)
                        const arrowX2 = cx + nx * (r + 1 + ARROW_LEN)
                        const arrowY2 = cy + ny * (r + 1 + ARROW_LEN)

                        return (
                            <g key={i}>
                                <line
                                    x1={arrowX1}
                                    y1={arrowY1}
                                    x2={arrowX2}
                                    y2={arrowY2}
                                    stroke="rgba(255,255,255,0.6)"
                                    strokeWidth={2}
                                    markerEnd="url(#arrowhead)"
                                />
                                <circle
                                    cx={cx}
                                    cy={cy}
                                    r={r}
                                    fill={color}
                                    stroke="rgba(0,0,0,0.3)"
                                    strokeWidth={1}
                                />
                            </g>
                        )
                    })}
                </svg>
            </div>
        </div>
    )
}
