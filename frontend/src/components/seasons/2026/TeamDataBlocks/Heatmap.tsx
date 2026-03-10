import type {TeamData, TeamShotData} from "@/components/wrappers/DataWrapper.tsx"

const FIELD_IMG = "/seasons/2026/field-lovat.png"

type ShotCluster = { cx: number; cy: number; fuelShot: number; fuelScored: number }

function clusterShots(shots: TeamShotData[], threshold = 30): ShotCluster[] {
    const clusters: ShotCluster[] = []

    for (const shot of shots) {
        const cx = shot.x1 * 1000
        const cy = shot.y1 * 500

        let merged = false
        for (const cluster of clusters) {
            const dx = cluster.cx - cx
            const dy = cluster.cy - cy
            if (Math.sqrt(dx * dx + dy * dy) < threshold) {
                const total = cluster.fuelShot + shot.fuelShot
                cluster.cx = (cluster.cx * cluster.fuelShot + cx * shot.fuelShot) / total
                cluster.cy = (cluster.cy * cluster.fuelShot + cy * shot.fuelShot) / total
                cluster.fuelShot += shot.fuelShot
                cluster.fuelScored += shot.fuelScored
                merged = true
                break
            }
        }

        if (!merged) {
            clusters.push({ cx, cy, fuelShot: shot.fuelShot, fuelScored: shot.fuelScored })
        }
    }

    return clusters
}

function accuracyColor(cluster: ShotCluster): string {
    if (cluster.fuelShot === 0) return "rgba(156,163,175,0.7)"
    const ratio = Math.min(1, Math.max(0, cluster.fuelScored / cluster.fuelShot))
    const r = Math.round(239 + (34 - 239) * ratio)
    const g = Math.round(68 + (197 - 68) * ratio)
    const b = Math.round(68 + (94 - 68) * ratio)
    return `rgba(${r},${g},${b},0.8)`
}

function shotRadius(cluster: ShotCluster): number {
    const fuel = cluster.fuelShot
    if (fuel === 0) return 6
    if (fuel <= 3) return 8
    if (fuel <= 8) return 11
    if (fuel <= 15) return 14
    return 17
}

export default function HeatmapBlock({data}: {data: TeamData}) {
    const shots = data.shots ?? []
    const viewBox = "0 0 1000 500"

    if (shots.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-gray-400 text-xs">
                No shot data available
            </div>
        )
    }

    const clusters = clusterShots(shots)

    return (
        <div className="flex flex-col p-3 gap-2">
            <span className="text-[11px] text-gray-400">
                {shots.length} shot{shots.length !== 1 ? "s" : ""} · {clusters.length} location{clusters.length !== 1 ? "s" : ""}
            </span>
            <div className="relative w-full max-w-xs mx-auto">
                <svg
                    className="w-full"
                    viewBox={viewBox}
                    preserveAspectRatio="xMidYMid meet"
                >
                    <image
                        href={FIELD_IMG}
                        x="0"
                        y="0"
                        width="1000"
                        height="500"
                        preserveAspectRatio="none"
                    />
                    {clusters.map((cluster, i) => {
                        const r = shotRadius(cluster)
                        return (
                            <g key={i}>
                                <circle
                                    cx={cluster.cx}
                                    cy={cluster.cy}
                                    r={r}
                                    fill={accuracyColor(cluster)}
                                    stroke="rgba(0,0,0,0.3)"
                                    strokeWidth={1}
                                />
                                {cluster.fuelShot >= 3 && (
                                    <text
                                        x={cluster.cx}
                                        y={cluster.cy}
                                        textAnchor="middle"
                                        dominantBaseline="central"
                                        fontSize={r * 0.9}
                                        fontWeight="bold"
                                        fill="white"
                                        stroke="rgba(0,0,0,0.5)"
                                        strokeWidth={0.5}
                                        style={{pointerEvents: "none"}}
                                    >
                                        {cluster.fuelShot}
                                    </text>
                                )}
                            </g>
                        )
                    })}
                </svg>
            </div>
        </div>
    )
}
