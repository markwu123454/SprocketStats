import {useEffect, useState} from "react"
import type {MatchScoutingData} from "@/types"
import ScoreBox from "@/components/ui/scoreBox.tsx"
import * as React from "react";
import {getSettingSync} from "@/db/settingsDb.ts";

const coralLevels = ['l2', 'l3', 'l4'] as const

export default function AutoPhase({data, setData}: {
    data: MatchScoutingData,
    setData: React.Dispatch<React.SetStateAction<MatchScoutingData>>
}) {
    const [selectedBranch, setSelectedBranch] = useState<string | null>(null)

    const [flash, setFlash] = useState<{ level: (typeof coralLevels)[number]; type: "add" | "remove" } | null>(null)

    const [missedMode, setMissedMode] = useState<"inc" | "dec">("inc")

    const [regions, setRegions] = useState<{
        label: string;
        points: { x: number; y: number }[];
    }[]>([]);

    useEffect(() => {
        fetch("/seasons/2025/reef_button_regions.json")
            .then((res) => res.json())
            .then((data) => setRegions(data));
    }, []);

    const handleLevelSelect = (level: (typeof coralLevels)[number]): "add" | "remove" => {
        let flashType: "add" | "remove" = "add"

        if (!selectedBranch) return flashType
        if (navigator.vibrate) navigator.vibrate(50)

        const updated = {...data.auto}

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
            updated.moved = true
            flashType = current ? "remove" : "add"
        }

        setData(prev => ({...prev, auto: updated}))
        // Add patchsave

        return flashType
    }

    const toggleMoved = () => {
        const updated = {...data.auto, moved: !data.auto.moved}
        setData(prev => ({...prev, auto: updated}))
        // Add patchsave
    }

    const renderCoralHexGrid = () => {
        const imageWidth = 567;
        const imageHeight = 655;

        const fieldImage =
            data.alliance === "blue"
                ? "/seasons/2025/Reef_Transparent_No-Tape_Blue.png"
                : data.alliance === "red"
                    ? "/seasons/2025/Reef_Transparent_No-Tape_Red.png"
                    : undefined;

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
                    {/* Field + layout rotation */}
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
                                    {/* Keep text upright */}
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
                                    {(["l2", "l3", "l4"] as const).map((level) => {
                                        const active = data.auto.branchPlacement?.[label]?.[level];
                                        const offset =
                                            levelOffsets[label]?.[level] ?? {x: 0, y: 0};
                                        const tx = centroid.x + offset.x;
                                        const ty = centroid.y + offset.y;
                                        return (
                                            active && (
                                                <text
                                                    key={level}
                                                    x={tx}
                                                    y={ty}
                                                    textAnchor="middle"
                                                    dominantBaseline="middle"
                                                    transform={
                                                        flip
                                                            ? `rotate(180 ${tx} ${ty})`
                                                            : undefined
                                                    }
                                                    className="fill-white text-md pointer-events-none select-none"
                                                >
                                                    {level}
                                                </text>
                                            )
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

                    {/* Driver station label — fixed orientation */}
                    <text
                        x={flip ? imageWidth * 0.95 : imageWidth * 0.05}
                        y={imageHeight * 0.05}
                        textAnchor={flip ? "end" : "start"}
                        dominantBaseline="middle"
                        className="fill-white text-sm select-none pointer-events-none"
                    >
                        {flip ? "driver station →" : "← driver station"}
                    </text>

                    {/* Static centered text (upright) */}
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
                        {`l2:${data.auto.missed.l2}, l3:${data.auto.missed.l3}, l4:${data.auto.missed.l4}`}
                    </text>
                </svg>
            </div>
        );
    };


    return (
        <div className="w-screen h-max flex flex-col p-4 select-none">
            {/* Top: fixed height */}
            <div className="text-xl font-semibold">
                Auto
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
                    id="auto-l1"
                    label="L1"
                    value={data.auto.l1}
                    onChange={(v) => {
                        const updated = {...data.auto, l1: v, moved: true}
                        setData((prev) => ({...prev, auto: updated}))
                    }}
                />
                <ScoreBox
                    id="auto-missed-l1"
                    label="Missed L1"
                    value={data.auto.missed.l1}
                    onChange={(v) => {
                        const updated = {
                            ...data.auto,
                            missed: {...data.auto.missed, l1: v}
                        }
                        setData((prev) => ({...prev, auto: updated}))
                    }}
                />
                <ScoreBox
                    id="auto-Processor"
                    label="Processor"
                    value={data.auto.processor}
                    onChange={(v) => {
                        const updated = {...data.auto, processor: v, moved: true}
                        setData((prev) => ({...prev, auto: updated}))
                    }}
                />
                <ScoreBox
                    id="auto-barge"
                    label="Barge"
                    value={data.auto.barge}
                    onChange={(v) => {
                        const updated = {...data.auto, barge: v, moved: true}
                        setData((prev) => ({...prev, auto: updated}))
                    }}
                />
                <ScoreBox
                    id="auto-missAlgae"
                    label="Barge miss"
                    value={data.auto.missAlgae}
                    onChange={(v) => {
                        const updated = {
                            ...data.auto,
                            missAlgae: v,
                            moved: true
                        }
                        setData((prev) => ({...prev, auto: updated}))
                    }}
                />
                <button
                    onClick={toggleMoved}
                    className={`text-sm h-full px-2 py-0.5 rounded text-white ${
                        data.auto.moved ? "bg-green-600" : "bg-red-600"
                    }`}
                >
                    LEFT START: {data.auto.moved ? "YES" : "NO"}
                </button>
            </div>
        </div>
    )
}
