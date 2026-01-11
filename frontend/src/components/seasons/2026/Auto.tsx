import React, {useEffect, useRef, useState} from "react"
import type {MatchScoutingData} from "@/types"
import {getSettingSync} from "@/db/settingsDb"
import type {Shots} from "@/components/seasons/2026/yearConfig.ts";

export default function AutoPhase({data, setData}: {
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

    const [shotPulse, setShotPulse] = useState<'' | 'up' | 'down'>('')
    const [scorePulse, setScorePulse] = useState<'' | 'up' | 'down'>('')

    function pulse(setter: (v: any) => void, type: 'up' | 'down') {
        setter(type)
        setTimeout(() => setter(''), 150)
    }

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

        // If current shot has fuel, lock it in
        if (fuelShot > 0) {
            commitCurrentShot()
            setFuelShotStack([])
            setFuelScoredStack([])
        }

        // Otherwise override previous shot
        else if (shotIndex !== null) {
            setShots(arr => {
                const copy = [...arr]
                copy[shotIndex] = {...copy[shotIndex], x1: p.x, y1: p.y, x2: p.x, y2: p.y}
                return copy
            })
        }

        setX1(p.x)
        setY1(p.y)
        setX2(p.x)
        setY2(p.y)
        setDragging(true)
    }

    function handlePointerMove(e: React.PointerEvent) {
        if (!dragging) return
        const p = getFieldPos(e)
        setX2(p.x)
        setY2(p.y)
    }

    function handlePointerUp(e: React.PointerEvent) {
        if (!dragging) return
        const p = getFieldPos(e)
        setX2(p.x)
        setY2(p.y)
        setDragging(false)
    }

    function addFuelShot(v: number) {
        setFuelShotStack(s => [...s, v])
    }

    function undoFuelShot() {
        setFuelShotStack(s => s.slice(0, -1))
    }

    function addFuelScored(v: number) {
        setFuelScoredStack(s => [...s, v])
    }

    function undoFuelScored() {
        setFuelScoredStack(s => s.slice(0, -1))
    }

    function commitCurrentShot() {
        if (fuelShot === 0) return

        const s: Shots = {
            x1,
            y1,
            x2,
            y2,
            fuelShot,
            fuelScored
        }

        setShots(arr => {
            if (shotIndex === null) return [...arr, s]
            const copy = [...arr]
            copy[shotIndex] = s
            return copy
        })

        setShotIndex(null)
        setFuelShotStack([])
        setFuelScoredStack([])
    }

    function viewX(v: number) {
        return flip ? 1 - v : v
    }

    function viewY(v: number) {
        return flip ? 1 - v : v
    }

    useEffect(() => {
        const finalized: Shots[] = [...shots]

        if (fuelShot > 0) {
            finalized.push({
                x1: x1,
                y1: y1,
                x2: x2,
                y2: y2,
                fuelShot: fuelShot,
                fuelScored: fuelScored
            })
        }

        setData(d => ({
            ...d,
            auto: {
                ...d.auto,
                shootLocation: finalized.map(s => {
                    const sx = flip ? 1 - s.x1 : s.x1
                    const sy = flip ? 1 - s.y1 : s.y1
                    const ex = flip ? 1 - s.x2 : s.x2
                    const ey = flip ? 1 - s.y2 : s.y2

                    return {
                        x1: sx,
                        y1: sy,
                        x2: ex,
                        y2: ey,
                        fuelShot: s.fuelShot,
                        fuelScored: s.fuelScored
                    }
                })
            }
        }))
    }, [shots])


    return (
        <div className="w-screen h-max flex flex-col p-2 select-none gap-4 text-sm">
            <div className="text-sm font-semibold">Auto</div>

            {/* Field */}
            <div
                ref={fieldRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={() => setDragging(false)}
                className="relative w-full aspect-2/1 bg-gray-800 rounded-xl overflow-hidden touch-none"
                style={{
                    transform: flip ? "rotate(180deg)" : "none"
                }}
            >
                <img
                    src="/seasons/2026/FieldMatchScout.png"
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    alt="field img"
                />

                {/* Start point */}
                <div
                    className="absolute w-4 h-4 bg-red-500 rounded-full -translate-x-1/2 -translate-y-1/2"
                    style={{
                        left: `${viewX(x1) * 100}%`,
                        top: `${viewY(y1) * 100}%`
                    }}
                />

                {/* Arrow */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none"
                >
                    <line
                        x1={`${viewX(x1) * 100}%`}
                        y1={`${viewY(y1) * 100}%`}
                        x2={`${viewX(x2) * 100}%`}
                        y2={`${viewY(y2) * 100}%`}
                        stroke="red"
                        strokeWidth="3"
                        markerEnd="url(#arrow)"
                    />
                    <defs>
                        <marker
                            id="arrow"
                            markerWidth="10"
                            markerHeight="10"
                            refX="8"
                            refY="5"
                            orient="auto"
                        >
                            <path d="M0,0 L10,5 L0,10 Z" fill="red"/>
                        </marker>
                    </defs>
                </svg>
            </div>

            {/* Buttons */}
            <div className="grid grid-cols-4 gap-3">
                {[1, 2, 5, 10].map(v => (
                    <button
                        key={v}
                        onClick={() => {
                            addFuelShot(v)
                            pulse(setShotPulse, 'up')
                        }}
                        className={`py-2 rounded text-sm ${
                            shotPulse === 'up'
                                ? "bg-green-700"
                                : "bg-zinc-800"
                        }`}
                    >
                        +{v}
                    </button>
                ))}

                <button
                    onClick={() => {
                        undoFuelShot()
                        pulse(setShotPulse, 'down')
                    }}
                    className={`col-span-4 py-2 rounded ${
                        shotPulse === 'down'
                            ? "bg-red-700"
                            : "bg-zinc-800"
                    }`}
                >
                    UNDO
                </button>
            </div>

            <div className="text-center text-sm font-bold">
                Fired: {fuelShot}
            </div>

            <div className="grid grid-cols-4 gap-3">
                {[1, 2, 5, 10].map(v => (
                    <button
                        key={v}
                        onClick={() => {
                            addFuelScored(v)
                            pulse(setScorePulse, 'up')
                        }}
                        className={`py-2 rounded text-sm ${
                            scorePulse === 'up'
                                ? "bg-green-700"
                                : "bg-zinc-800"
                        }`}
                    >
                        +{v}
                    </button>
                ))}

                <button
                    onClick={() => {
                        undoFuelScored()
                        pulse(setScorePulse, 'down')
                    }}
                    className={`col-span-4 py-2 rounded ${
                        scorePulse === 'down'
                            ? "bg-red-700"
                            : "bg-zinc-800"
                    }`}
                >
                    UNDO
                </button>
            </div>


            <div className="text-center text-sm font-bold">
                Scored: {fuelScored}
            </div>

            <div className="grid grid-cols-2 gap-2">
                <button
                    onClick={() => {
                        setShots(arr => {
                            const updated = [...arr]

                            // If current shot exists, commit it first
                            if (fuelShot > 0) {
                                const s: Shots = {
                                    x1: x1,
                                    y1: y1,
                                    x2: x2,
                                    y2: y2,
                                    fuelShot: fuelShot,
                                    fuelScored: fuelScored
                                }

                                if (shotIndex === null) updated.push(s)
                                else updated[shotIndex] = s
                            }

                            if (updated.length === 0) return arr

                            const newIndex =
                                shotIndex === null
                                    ? Math.max(0, updated.length - 2)
                                    : Math.max(0, shotIndex - 1)

                            const s = updated[newIndex]

                            setShotIndex(newIndex)
                            setX1(s.x1)
                            setY1(s.y1)
                            setX2(s.x2)
                            setY2(s.y2)
                            setFuelShotStack([s.fuelShot])
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
                        setFuelShotStack([])
                        setFuelScoredStack([])
                    }}
                    className="bg-gray-700 text-white text-sm py-2 rounded-xl"
                >
                    Clear
                </button>
            </div>
        </div>
    )
}