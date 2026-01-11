import React, {useEffect, useRef, useState} from "react"
import type {MatchScoutingData} from "@/types"
import {getSettingSync} from "@/db/settingsDb"
import type {Shots} from "@/components/seasons/2026/yearConfig.ts";

export default function AutoPhase({data, setData}: {
    data: MatchScoutingData
    setData: React.Dispatch<React.SetStateAction<MatchScoutingData>>
}) {
    const fieldRef = useRef<HTMLDivElement>(null)

    const [x, setX] = useState(0.5)
    const [y, setY] = useState(0.5)
    const [xPrime, setXPrime] = useState(0.5)
    const [yPrime, setYPrime] = useState(0.5)

    const [fuel, setFuel] = useState(0)
    const [dragging, setDragging] = useState(false)

    const [shots, setShots] = useState<Shots[]>([])
    const [shotIndex, setShotIndex] = useState<number | null>(null)

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
        if (fuel > 0) {
            commitCurrentShot()
            setFuel(0)
        }
        // Otherwise override previous shot
        else if (shotIndex !== null) {
            setShots(arr => {
                const copy = [...arr]
                copy[shotIndex] = {...copy[shotIndex], x: p.x, y: p.y, xPrime: p.x, yPrime: p.y}
                return copy
            })
        }

        setX(p.x)
        setY(p.y)
        setXPrime(p.x)
        setYPrime(p.y)
        setDragging(true)
    }

    function handlePointerMove(e: React.PointerEvent) {
        if (!dragging) return
        const p = getFieldPos(e)
        setXPrime(p.x)
        setYPrime(p.y)
    }

    function handlePointerUp(e: React.PointerEvent) {
        if (!dragging) return
        const p = getFieldPos(e)
        setXPrime(p.x)
        setYPrime(p.y)
        setDragging(false)
    }

    function addFuel(v: number) {
        setFuel(f => Math.max(0, f + v))
    }

    function commitCurrentShot() {
        if (fuel === 0) return

        const s: Shots = {
            x,
            y,
            xPrime,
            yPrime,
            fuelShot: fuel,
            fuelScored: 0
        }

        setShots(arr => {
            if (shotIndex === null) return [...arr, s]

            const copy = [...arr]
            copy[shotIndex] = s
            return copy
        })

        setShotIndex(null)
    }

    function viewX(v: number) {
        return flip ? 1 - v : v
    }

    function viewY(v: number) {
        return flip ? 1 - v : v
    }

    useEffect(() => {
        const finalized: Shots[] = [...shots]

        if (fuel > 0) {
            finalized.push({
                x,
                y,
                xPrime,
                yPrime,
                fuelShot: fuel,
                fuelScored: 0
            })
        }

        setData(d => ({
            ...d,
            auto: {
                ...d.auto,
                shootLocation: finalized.map(s => {
                    const sx = flip ? 1 - s.x : s.x
                    const sy = flip ? 1 - s.y : s.y
                    const ex = flip ? 1 - s.xPrime : s.xPrime
                    const ey = flip ? 1 - s.yPrime : s.yPrime

                    return {
                        x: sx,
                        y: sy,
                        xPrime: ex,
                        yPrime: ey,
                        fuelShot: s.fuelShot,
                        fuelScored: 0
                    }
                })
            }
        }))
    }, [shots])


    return (
        <div className="w-screen h-max flex flex-col p-4 select-none gap-4">
            <div className="text-xl font-semibold">Auto</div>

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
                        left: `${viewX(x) * 100}%`,
                        top: `${viewY(y) * 100}%`
                    }}
                />

                {/* Arrow */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none"
                >
                    <line
                        x1={`${viewX(x) * 100}%`}
                        y1={`${viewY(y) * 100}%`}
                        x2={`${viewX(xPrime) * 100}%`}
                        y2={`${viewY(yPrime) * 100}%`}
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
                        key={`p${v}`}
                        onClick={() => addFuel(v)}
                        className="bg-green-600 text-white text-xl py-4 rounded-lg"
                    >
                        +{v}
                    </button>
                ))}
                {[1, 2, 5, 10].map(v => (
                    <button
                        key={`m${v}`}
                        onClick={() => addFuel(-v)}
                        className="bg-red-600 text-white text-xl py-4 rounded-lg"
                    >
                        -{v}
                    </button>
                ))}
            </div>

            <div className="text-center text-4xl font-bold">{fuel}</div>

            {/* Buttons */}
            <div className="grid grid-cols-4 gap-3">
                {[1, 2, 5, 10].map(v => (
                    <button
                        key={`p${v}`}
                        onClick={() => addFuel(v)}
                        className="bg-green-600 text-white text-xl py-4 rounded-lg"
                    >
                        +{v}
                    </button>
                ))}
                {[1, 2, 5, 10].map(v => (
                    <button
                        key={`m${v}`}
                        onClick={() => addFuel(-v)}
                        className="bg-red-600 text-white text-xl py-4 rounded-lg"
                    >
                        -{v}
                    </button>
                ))}
            </div>

            <div className="text-center text-4xl font-bold">{fuel}</div>

            <div className="grid grid-cols-2 gap-4">
                <button
                    onClick={() => {
                        setShots(arr => {
                            let updated = [...arr]

                            // If current shot exists, commit it first
                            if (fuel > 0) {
                                const s: Shots = {
                                    x,
                                    y,
                                    xPrime,
                                    yPrime,
                                    fuelShot: fuel,
                                    fuelScored: 0
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
                            setX(s.x)
                            setY(s.y)
                            setXPrime(s.xPrime)
                            setYPrime(s.yPrime)
                            setFuel(s.fuelShot)

                            return updated
                        })
                    }}
                    className="bg-purple-600 text-white text-xl py-4 rounded-xl"
                >
                    Back
                </button>

                <button
                    onClick={() => setFuel(0)}
                    className="bg-gray-700 text-white text-xl py-4 rounded-xl"
                >
                    Clear
                </button>
            </div>
        </div>
    )
}