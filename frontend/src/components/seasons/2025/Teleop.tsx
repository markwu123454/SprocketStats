import {useState} from "react"
import type {MatchScoutingData} from "@/types"
import ScoreBox from "@/components/ui/scoreBox.tsx"
import blueFieldImage from "@/assets/2025_Reef_Transparent_No-Tape_Blue.png"
import redFieldImage from "@/assets/2025_Reef_Transparent_No-Tape_Red.png"
import * as React from "react";
import regions from "@/assets/reef_button_regions.json"
import {getSettingSync} from "@/db/settingsDb.ts";

const coralLevels = ['l2', 'l3', 'l4'] as const

export default function TeleopPhase({data, setData}: {
    data: MatchScoutingData,
    setData: React.Dispatch<React.SetStateAction<MatchScoutingData>>
}) {
    const [selectedBranch, setSelectedBranch] = useState<string | null>(null)

    const [flash, setFlash] = useState<{ level: (typeof coralLevels)[number]; type: "add" | "remove" } | null>(null)

    const [missedMode, setMissedMode] = useState<"inc" | "dec">("inc")

    const handleLevelSelect = (level: (typeof coralLevels)[number]): "add" | "remove" => {
        let flashType: "add" | "remove" = "add"

        if (!selectedBranch) return flashType
        if (navigator.vibrate) navigator.vibrate(50)

        const updated = {...data.teleop}

        if (selectedBranch === "missed") {
            if (missedMode === "inc") {
                updated.missed[level] += 1
                flashType = "add"
            } else {
                updated.missed[level] = Math.max(0, updated.missed[level] - 1)
                flashType = "remove"
            }
        } else {
            const current = updated.branchPlacement[selectedBranch][level]
            updated.branchPlacement[selectedBranch][level] = !current
            flashType = current ? "remove" : "add"
        }

        setData(prev => ({...prev, teleop: updated}))
        // Add patchsave

        return flashType
    }

    const renderCoralHexGrid = () => {
        const imageWidth = 567;
        const imageHeight = 655;

        const fieldImage =
            data.alliance === "blue"
                ? blueFieldImage
                : data.alliance === "red"
                    ? redFieldImage
                    : null;

        const flip = (getSettingSync("field_orientation", "0") === "180") !== (data.alliance === "red");

        const levelOffsets: Record<string, Record<"l2" | "l3" | "l4", { x: number; y: number }>> = {
            A: {l2: {x: -35, y: 30}, l3: {x: -35, y: 0}, l4: {x: -35, y: -30}},
            B: {l2: {x: -35, y: 30}, l3: {x: -35, y: 0}, l4: {x: -35, y: -30}},
            C: {l2: {x: 10, y: 50}, l3: {x: -20, y: 32}, l4: {x: -50, y: 14}},
            D: {l2: {x: 10, y: 50}, l3: {x: -20, y: 32}, l4: {x: -50, y: 14}},
            E: {l2: {x: -10, y: 50}, l3: {x: 20, y: 32}, l4: {x: 50, y: 14}},
            F: {l2: {x: -10, y: 50}, l3: {x: 20, y: 32}, l4: {x: 50, y: 14}},
            G: {l2: {x: 35, y: 30}, l3: {x: 35, y: 0}, l4: {x: 35, y: -30}},
            H: {l2: {x: 35, y: 30}, l3: {x: 35, y: 0}, l4: {x: 35, y: -30}},
            I: {l2: {x: 50, y: -14}, l3: {x: 20, y: -32}, l4: {x: -10, y: -50}},
            J: {l2: {x: 50, y: -14}, l3: {x: 20, y: -32}, l4: {x: -10, y: -50}},
            K: {l2: {x: -50, y: -14}, l3: {x: -20, y: -32}, l4: {x: 10, y: -50}},
            L: {l2: {x: -50, y: -14}, l3: {x: -20, y: -32}, l4: {x: 10, y: -50}},
        };

        function getCentroid(points: { x: number; y: number }[]) {
            const n = points.length;
            const {x, y} = points.reduce(
                (acc, p) => ({x: acc.x + p.x, y: acc.y + p.y}),
                {x: 0, y: 0}
            );
            return {x: x / n, y: y / n};
        }

        return (
            <div className="relative w-full aspect-[567/655]">
                <svg
                    viewBox={`0 0 ${imageWidth} ${imageHeight}`}
                    className="absolute inset-0 w-full h-full"
                >
                    <g
                        transform={
                            flip
                                ? `rotate(180 ${imageWidth / 2} ${imageHeight / 2})`
                                : undefined
                        }
                    >
                        <image
                            href={fieldImage}
                            width={imageWidth}
                            height={imageHeight}
                            className="pointer-events-none"
                        />

                        {regions.map(({label, points}) => {
                            const centroid = getCentroid(points);
                            return (
                                <g key={label}>
                                    <polygon
                                        points={points.map(p => `${p.x},${p.y}`).join(" ")}
                                        onClick={() => setSelectedBranch(label)}
                                        className={`cursor-pointer ${
                                            selectedBranch === label
                                                ? "fill-white/30"
                                                : "fill-transparent"
                                        } stroke-white stroke-[0.5]`}
                                    />
                                    <text
                                        x={centroid.x}
                                        y={centroid.y}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        transform={
                                            flip
                                                ? `rotate(180 ${centroid.x} ${centroid.y})`
                                                : undefined
                                        }
                                        className="fill-white pointer-events-none select-none"
                                    >
                                        {label}
                                    </text>
                                    {(["l2", "l3", "l4"] as const).map(level => {
                                        const autoActive = data.auto.branchPlacement?.[label]?.[level];
                                        const teleopActive = data.teleop.branchPlacement?.[label]?.[level];
                                        const offset = levelOffsets[label]?.[level] ?? {x: 0, y: 0};

                                        if (!autoActive && !teleopActive) return null;

                                        const fillClass = teleopActive
                                            ? "fill-white"
                                            : autoActive
                                                ? "fill-zinc-400"
                                                : "fill-transparent";

                                        return (
                                            <g
                                                key={level}
                                                transform={flip ? `rotate(180 ${centroid.x + offset.x} ${centroid.y + offset.y})` : undefined}
                                            >
                                                <text
                                                    x={centroid.x + offset.x}
                                                    y={centroid.y + offset.y}
                                                    textAnchor="middle"
                                                    dominantBaseline="middle"
                                                    className={`pointer-events-none select-none ${fillClass}`}
                                                >
                                                    {level}
                                                </text>
                                            </g>
                                        );
                                    })}

                                </g>
                            );
                        })}

                        <circle
                            cx={imageWidth / 2}
                            cy={imageHeight / 2}
                            r={100}
                            onClick={() => {
                                setSelectedBranch("missed");
                                setMissedMode("inc");
                            }}
                            className={`cursor-pointer ${
                                selectedBranch === "missed"
                                    ? "fill-white/30"
                                    : "fill-transparent"
                            } stroke-white stroke-[0.5]`}
                        />
                    </g>

                    <text
                        x={flip ? imageWidth * 0.95 : imageWidth * 0.05}
                        y={imageHeight * 0.05}
                        textAnchor={flip ? "end" : "start"}
                        dominantBaseline="middle"
                        className="fill-white text-sm select-none pointer-events-none"
                    >
                        {flip ? "driver station →" : "← driver station"}
                    </text>

                    <text
                        x={imageWidth / 2}
                        y={imageHeight / 2 * 0.9}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="fill-white pointer-events-none select-none"
                    >
                        Miss
                    </text>
                    <text
                        x={imageWidth / 2}
                        y={imageHeight / 2 * 1.1}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="fill-white pointer-events-none select-none text-lg"
                    >
                        {`l2:${data.teleop.missed.l2}, l3:${data.teleop.missed.l3}, l4:${data.teleop.missed.l4}`}
                    </text>
                </svg>
            </div>
        );
    };


    return (
        <div className="w-screen h-max flex flex-col p-4 select-none">
            {/* Top: fixed height */}
            <div className="text-xl font-semibold">
                teleop
            </div>

            {/* Middle: expands to fill space */}
            <div className="items-center justify-center gap-6 overflow-hidden">
                <div className="flex-1 min-h-0 flex items-center justify-center w-full pb-2">
                    {renderCoralHexGrid()}
                </div>

                <div className="flex gap-4 justify-center items-center shrink-0">
                    {coralLevels.map((level) => (
                        <button
                            key={level}
                            onClick={() => {
                                const type = handleLevelSelect(level)
                                setFlash({level, type})
                                setTimeout(() => setFlash(null), 150)
                            }}
                            className={`px-4 py-2 rounded text-sm transition-colors duration-150 ${
                                flash?.level === level
                                    ? flash.type === "add"
                                        ? "bg-green-600"
                                        : "bg-red-600"
                                    : "bg-zinc-700 hover:bg-zinc-500"
                            }`}
                        >
                            {level.toUpperCase()}
                        </button>
                    ))}

                    {selectedBranch === "missed" && (
                        <button
                            onClick={() =>
                                setMissedMode((prev) => (prev === "inc" ? "dec" : "inc"))
                            }
                            className={`px-3 py-2 rounded text-sm font-medium border ${
                                missedMode === "inc"
                                    ? "bg-green-700 border-green-800"
                                    : "bg-red-700 border-red-800"
                            }`}
                        >
                            {missedMode === "inc" ? "+" : "−"}
                        </button>
                    )}
                </div>
            </div>

            {/* Bottom: pinned to bottom by flex layout */}
            <div className="grid grid-cols-2 gap-4 pt-4">
                <ScoreBox
                    id="teleop-l1"
                    label="L1"
                    value={data.teleop.l1}
                    onChange={(v) => {
                        const updated = {...data.teleop, l1: v, moved: true}
                        setData((prev) => ({...prev, teleop: updated}))
                    }}
                />
                <ScoreBox
                    id="teleop-missed-l1"
                    label="Missed L1"
                    value={data.teleop.missed.l1}
                    onChange={(v) => {
                        const updated = {
                            ...data.teleop,
                            missed: {...data.teleop.missed, l1: v}
                        }
                        setData((prev) => ({...prev, teleop: updated}))
                    }}
                />
                <ScoreBox
                    id="teleop-Processor"
                    label="Processor"
                    value={data.teleop.processor}
                    onChange={(v) => {
                        const updated = {...data.teleop, processor: v, moved: true}
                        setData((prev) => ({...prev, teleop: updated}))
                    }}
                />
                <ScoreBox
                    id="teleop-barge"
                    label="Barge"
                    value={data.teleop.barge}
                    onChange={(v) => {
                        const updated = {...data.teleop, barge: v, moved: true}
                        setData((prev) => ({...prev, teleop: updated}))
                    }}
                />
                <ScoreBox
                    id="teleop-missAlgae"
                    label="Barge miss"
                    value={data.teleop.missAlgae}
                    onChange={(v) => {
                        const updated = {
                            ...data.teleop,
                            missAlgae: v,
                            moved: true
                        }
                        setData((prev) => ({...prev, teleop: updated}))
                    }}
                />
            </div>
        </div>
    )
}
