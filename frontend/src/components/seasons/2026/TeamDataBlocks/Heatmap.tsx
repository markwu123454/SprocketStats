import {useMemo, useState} from "react"
import type {TeamData, TeamShotData} from "@/components/wrappers/DataWrapper.tsx"

const FIELD_IMG = "/seasons/2026/field-lovat.png"

type ViewMode = "robot" | "target"

function accuracyColor(shot: TeamShotData): string {
    if (shot.fuelShot === 0) return "rgba(156,163,175,0.7)" // gray — no fuel shot
    const ratio = shot.fuelScored / shot.fuelShot
    if (ratio >= 0.7) return "rgba(34,197,94,0.75)"  // green
    if (ratio >= 0.35) return "rgba(250,204,21,0.75)" // yellow
    return "rgba(239,68,68,0.75)"                      // red
}

function accuracyRadius(shot: TeamShotData): number {
    const fuel = shot.fuelShot
    if (fuel === 0) return 6
    if (fuel <= 3) return 7
    if (fuel <= 8) return 9
    return 11
}

export default function HeatmapBlock({data}: {data: TeamData}) {
    const shots = data.shots ?? []
    const fuel = data.fuel ?? {}
    const [viewMode, setViewMode] = useState<ViewMode>("robot")
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

    const phaseStats = useMemo(() => {
        const phase = fuel.phase
        if (!phase || typeof phase !== "object") return []
        return Object.entries(phase).map(([name, val]: [string, any]) => ({
            name: name.replace(/_/g, " "),
            mean: val?.fuel?.mean ?? null,
            total: val?.fuel?.n ?? null,
        }))
    }, [fuel])

    const totalShots = shots.length
    const totalFuelShot = shots.reduce((s, sh) => s + sh.fuelShot, 0)
    const totalFuelScored = shots.reduce((s, sh) => s + sh.fuelScored, 0)
    const overallAccuracy = totalFuelShot > 0 ? ((totalFuelScored / totalFuelShot) * 100).toFixed(1) : "—"

    if (totalShots === 0) {
        return (
            <div className="h-full flex items-center justify-center text-gray-400 text-xs">
                No shot data available
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full p-3 gap-2">
            {/* Controls row */}
            <div className="flex items-center justify-between shrink-0">
                <div className="flex gap-1">
                    <button
                        onClick={() => setViewMode("robot")}
                        className={`px-2 py-0.5 text-xs rounded border ${
                            viewMode === "robot"
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-white text-gray-600 border-gray-300"
                        }`}
                    >
                        Robot Position
                    </button>
                    <button
                        onClick={() => setViewMode("target")}
                        className={`px-2 py-0.5 text-xs rounded border ${
                            viewMode === "target"
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-white text-gray-600 border-gray-300"
                        }`}
                    >
                        Target Position
                    </button>
                </div>
                <div className="flex gap-3 text-[11px] text-gray-500">
                    <span>{totalShots} shots</span>
                    <span>{totalFuelShot} fuel</span>
                    <span>{overallAccuracy}% acc</span>
                </div>
            </div>

            {/* Field + overlay */}
            <div className="relative flex-1 min-h-0">
                <div className="relative w-full h-full">
                    <img
                        src={FIELD_IMG}
                        alt="Field"
                        className="absolute inset-0 w-full h-full object-contain rounded"
                        draggable={false}
                    />
                    <svg
                        className="absolute inset-0 w-full h-full"
                        viewBox="0 0 1000 500"
                        preserveAspectRatio="xMidYMid meet"
                    >
                        {shots.map((shot, i) => {
                            const x = viewMode === "robot" ? shot.x1 : shot.x2
                            const y = viewMode === "robot" ? shot.y1 : shot.y2
                            const cx = x * 1000
                            const cy = y * 500
                            const r = accuracyRadius(shot)
                            const color = accuracyColor(shot)
                            const isHovered = hoveredIdx === i

                            return (
                                <g key={i}>
                                    {/* Trajectory line on hover */}
                                    {isHovered && (
                                        <line
                                            x1={shot.x1 * 1000}
                                            y1={shot.y1 * 500}
                                            x2={shot.x2 * 1000}
                                            y2={shot.y2 * 500}
                                            stroke="rgba(255,255,255,0.6)"
                                            strokeWidth={1.5}
                                            strokeDasharray="4 3"
                                        />
                                    )}
                                    <circle
                                        cx={cx}
                                        cy={cy}
                                        r={isHovered ? r + 3 : r}
                                        fill={color}
                                        stroke={isHovered ? "white" : "rgba(0,0,0,0.3)"}
                                        strokeWidth={isHovered ? 2 : 1}
                                        onMouseEnter={() => setHoveredIdx(i)}
                                        onMouseLeave={() => setHoveredIdx(null)}
                                        className="cursor-pointer"
                                    />
                                </g>
                            )
                        })}
                    </svg>

                    {/* Tooltip */}
                    {hoveredIdx !== null && shots[hoveredIdx] && (
                        <div
                            className="absolute z-10 pointer-events-none bg-gray-900/90 text-white text-[11px] px-2 py-1 rounded shadow-lg whitespace-nowrap"
                            style={{
                                left: `${(viewMode === "robot" ? shots[hoveredIdx].x1 : shots[hoveredIdx].x2) * 100}%`,
                                top: `${(viewMode === "robot" ? shots[hoveredIdx].y1 : shots[hoveredIdx].y2) * 100}%`,
                                transform: "translate(-50%, -130%)",
                            }}
                        >
                            Shot: {shots[hoveredIdx].fuelShot} | Scored: {shots[hoveredIdx].fuelScored}
                            {shots[hoveredIdx].fuelShot > 0 && (
                                <> | {((shots[hoveredIdx].fuelScored / shots[hoveredIdx].fuelShot) * 100).toFixed(0)}%</>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Legend + phase stats */}
            <div className="flex items-center justify-between shrink-0 text-[10px] text-gray-500">
                <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" /> &ge;70%
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400" /> 35-70%
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" /> &lt;35%
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-400" /> no fuel
                    </span>
                </div>
                {phaseStats.length > 0 && (
                    <div className="flex gap-3">
                        {phaseStats.map((p) => (
                            <span key={p.name}>
                                {p.name}: <span className="font-medium text-gray-700">{p.mean?.toFixed(1) ?? "—"}</span> avg
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}