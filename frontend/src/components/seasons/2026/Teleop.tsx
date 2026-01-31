import React, {useEffect, useRef, useState} from "react"
import type {MatchScoutingData} from "@/types"
import {getSettingSync} from "@/db/settingsDb"
import type {Shots} from "@/components/seasons/2026/yearConfig.ts";

// Helper component to handle individual pulsing
function PulseButton({
                         onClick,
                         label,
                         activeColor,
                         className = ""
                     }: {
    onClick: () => void,
    label: string | React.ReactNode,
    activeColor: string,
    className?: string
}) {
    const [pulsing, setPulsing] = useState(false);

    const handleClick = () => {
        onClick();
        setPulsing(true);
        setTimeout(() => setPulsing(false), 150);
    };

    return (
        <button
            onClick={handleClick}
            className={`py-2 rounded text-sm transition-colors duration-75 ${className} ${
                pulsing ? activeColor : "bg-zinc-800"
            }`}
        >
            {label}
        </button>
    );
}

const PHASE_TEXT = ["Transition", "Phase 1", "Phase 2", "Phase 3", "Phase 4", "End game"]

export default function TeleopPhase({data, setData}: {
    data: MatchScoutingData
    setData: React.Dispatch<React.SetStateAction<MatchScoutingData>>
}) {
    const fieldRef = useRef<HTMLDivElement>(null)

    const [x1, setX1] = useState(0.5)
    const [y1, setY1] = useState(0.5)
    const [x2, setX2] = useState(0.5)
    const [y2, setY2] = useState(0.5)

    const [fuelShotStack, setFuelShotStack] = useState<number[]>([])
    const [fuelScoredStack, setFuelScoredStack] = useState<number[]>([])
    const fuelShot = fuelShotStack.reduce((a, b) => a + b, 0)
    const fuelScored = fuelScoredStack.reduce((a, b) => a + b, 0)

    const [dragging, setDragging] = useState(false)
    const [shots, setShots] = useState<Shots[]>([])
    const [shotIndex, setShotIndex] = useState<number | null>(null)
    const [inputState, setInputState] = useState<"Shooting" | "Intake">("Shooting")
    const [phase, setPhase] = useState<number>(0)
    const [scoring, setScoring] = useState<boolean>(true)

    const flip = (getSettingSync("field_orientation") === "180") !== (data.alliance === "red")

    function getFieldPos(e: React.PointerEvent) {
        if (!fieldRef.current) return {x: 0, y: 0}
        const rect = fieldRef.current.getBoundingClientRect()
        return {
            x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
            y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
        }
    }

    function handlePointerDown(e: React.PointerEvent) {
        const p = getFieldPos(e)
        if (fuelShot > 0) {
            commitCurrentShot()
            setFuelShotStack([])
            setFuelScoredStack([])
        } else if (shotIndex !== null) {
            setShots(arr => {
                const copy = [...arr]
                copy[shotIndex] = {...copy[shotIndex], x1: p.x, y1: p.y, x2: p.x, y2: p.y}
                return copy
            })
        }
        setX1(p.x);
        setY1(p.y);
        setX2(p.x);
        setY2(p.y);
        setDragging(true)
    }

    function handlePointerMove(e: React.PointerEvent) {
        if (!dragging) return
        const p = getFieldPos(e);
        setX2(p.x);
        setY2(p.y)
    }

    function handlePointerUp(e: React.PointerEvent) {
        if (!dragging) return
        const p = getFieldPos(e);
        setX2(p.x);
        setY2(p.y);
        setDragging(false)
    }

    function commitCurrentShot() {
        if (fuelShot === 0) return
        const s: Shots = {x1, y1, x2, y2, fuelShot, fuelScored}
        setShots(arr => {
            if (shotIndex === null) return [...arr, s]
            const copy = [...arr]
            copy[shotIndex] = s
            return copy
        })
        setShotIndex(null);
        setFuelShotStack([]);
        setFuelScoredStack([])
    }

    const viewX = (v: number) => flip ? 1 - v : v
    const viewY = (v: number) => flip ? 1 - v : v

    useEffect(() => {
        const finalized: Shots[] = [...shots]
        if (fuelShot > 0) {
            finalized.push({x1, y1, x2, y2, fuelShot, fuelScored})
        }
        setData(d => ({
            ...d,
            teleop: {
                ...d.teleop,
                shootLocation: finalized.map(s => ({
                    x1: flip ? 1 - s.x1 : s.x1,
                    y1: flip ? 1 - s.y1 : s.y1,
                    x2: flip ? 1 - s.x2 : s.x2,
                    y2: flip ? 1 - s.y2 : s.y2,
                    fuelShot: s.fuelShot,
                    fuelScored: s.fuelScored
                }))
            }
        }))
    }, [shots, fuelShot, fuelScored])

    return (
        <div className="w-screen h-max flex flex-col p-2 select-none gap-4 text-sm">


            <div className="flex items-center gap-2">
                <div className="text-lg font-semibold shrink-0">Teleop - {PHASE_TEXT[phase]}</div>
                <button
                    onClick={() => {
                        setInputState("Intake")
                    }}
                    className={`text-white text-sm py-2 rounded-xl transition flex-1 ${inputState == "Intake" ? "bg-zinc-600" : "bg-zinc-800"}`}
                >
                    Intake
                </button>
                <button
                    onClick={() => {
                        setInputState("Shooting")
                    }}
                    className={`text-white text-sm py-2 rounded-xl transition flex-1 ${inputState == "Shooting" ? "bg-zinc-600" : "bg-zinc-800"}`}
                >
                    Shooting
                </button>
            </div>

            {/* Field */}
            <div
                ref={fieldRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={() => setDragging(false)}
                className="relative w-full aspect-2/1 bg-gray-800 rounded-xl overflow-hidden touch-none"
                style={{transform: flip ? "rotate(180deg)" : "none"}}
            >
                <img src="/seasons/2026/Field.png"
                     className="absolute inset-0 w-full h-full object-contain pointer-events-none" alt="field"/>
                <div className="absolute w-3 h-3 bg-[#B39EB5] rounded-full -translate-x-1/2 -translate-y-1/2"
                     style={{left: `${viewX(x1) * 100}%`, top: `${viewY(y1) * 100}%`}}
                />
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    <line x1={`${viewX(x1) * 100}%`} y1={`${viewY(y1) * 100}%`} x2={`${viewX(x2) * 100}%`}
                          y2={`${viewY(y2) * 100}%`} stroke="#B39EB5" strokeWidth="3" markerEnd="url(#arrow-pastel)"/>
                    <defs>
                        <marker id="arrow-pastel" markerWidth="5" markerHeight="5" viewBox="0 0 10 10" refX="4" refY="5"
                                orient="teleop">
                            <path d="M0,0 L10,5 L0,10 Z" fill="#B39EB5"/>
                        </marker>
                    </defs>
                </svg>
            </div>

            {/* Fired Section */}
            <div className="grid grid-cols-4 gap-3">
                {[1, 2, 5, 10].map(v => (
                    <PulseButton
                        key={v}
                        label={`+${v}`}
                        activeColor="bg-green-700"
                        onClick={() => setFuelShotStack(s => [...s, v])}
                    />
                ))}
                <div className="grid grid-cols-2 gap-2 col-span-4">
                    <PulseButton
                        label="UNDO"
                        activeColor="bg-red-800"
                        onClick={() => setFuelShotStack(s => s.slice(0, -1))}
                    />
                    <p
                        className="text-center text-sm font-bold py-2">
                        Fired: {fuelShot}
                    </p>
                </div>
            </div>
            <button
                onClick={() => setScoring(prev => !prev)}
                className={`text-white text-sm py-2 rounded-xl transition-colors ${
                scoring ? "bg-green-800" : "bg-red-800"
                }`}>
                Scoring?
            </button>

            {/* Scored Section */}
            <div className="grid grid-cols-4 gap-3">
                {[1, 2, 5, 10].map(v => (
                    <PulseButton
                        key={v}
                        label={`+${v}`}
                        activeColor="bg-green-700"
                        onClick={() => setFuelScoredStack(s => [...s, v])}
                    />
                ))}
                <div className="grid grid-cols-2 gap-2 col-span-4">
                    <PulseButton
                        label="UNDO"
                        activeColor="bg-red-800"
                        onClick={() => setFuelScoredStack(s => s.slice(0, -1))}
                    />
                    <p
                        className="text-center text-sm font-bold py-2">
                        Scored: {fuelScored}
                    </p>
                </div>
            </div>

            {/* Navigation */}
            <div className="grid grid-cols-2 gap-2">
                <button
                    onClick={() => {
                        setShots(arr => {
                            const updated = [...arr]
                            if (fuelShot > 0) {
                                const s: Shots = {x1, y1, x2, y2, fuelShot, fuelScored}
                                if (shotIndex === null) updated.push(s); else updated[shotIndex] = s
                            }
                            if (updated.length === 0) return arr
                            const newIndex = shotIndex === null ? Math.max(0, updated.length - 2) : Math.max(0, shotIndex - 1)
                            const s = updated[newIndex]
                            setShotIndex(newIndex);
                            setX1(s.x1);
                            setY1(s.y1);
                            setX2(s.x2);
                            setY2(s.y2);
                            setFuelShotStack([s.fuelShot]);
                            setFuelScoredStack([s.fuelScored])
                            return updated
                        })
                    }}
                    className="bg-purple-600 text-white text-sm py-2 rounded-xl"
                >
                    Back
                </button>
                <button
                    onClick={() => {
                        setFuelShotStack([]);
                        setFuelScoredStack([])
                    }}
                    className="bg-gray-700 text-white text-sm py-2 rounded-xl"
                >
                    Clear
                </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <PulseButton
                    onClick={() => {setPhase(phase ? phase-1 : phase)}}
                    label="Prev phase"
                    activeColor="bg-red-800"
                    className={`py-2 rounded-xl transition flex-1 ${phase ? "text-white text-sm" : "text-zinc-500"}`}
                >

                </PulseButton>
                <PulseButton
                    onClick={() => {setPhase(phase != 5 ? phase+1 : phase)}}
                    activeColor="bg-green-700"
                    label="Next phase"
                    className={`py-2 rounded-xl transition flex-1 ${phase != 5 ? "text-white text-sm" : "text-zinc-500"}`}
                >

                </PulseButton>
            </div>
        </div>
    )
}