import React, {useEffect, useRef, useState} from "react"
import type {MatchScoutingData} from "@/types"
import {getSettingSync} from "@/db/settingsDb"
import RatingSlider from "@/components/ui/ratingSlider.tsx"
import type {
    Actions,
    ActionClimb,
    ActionIntake,
    ActionShoot,
    ActionStart,
} from "@/components/seasons/2026/yearConfig.ts";

// ---------------------------------------------------------------------------
// PulseButton — unchanged helper
// ---------------------------------------------------------------------------
function PulseButton({
                         onClick,
                         label,
                         activeColor,
                         className = "",
                     }: {
    onClick: () => void
    label: string | React.ReactNode
    activeColor: string
    className?: string
}) {
    const [pulsing, setPulsing] = useState(false)

    const handleClick = () => {
        onClick()
        setPulsing(true)
        setTimeout(() => setPulsing(false), 150)
    }

    return (
        <button
            onClick={handleClick}
            className={`py-2 rounded text-sm transition-colors duration-75 ${className} ${
                pulsing ? activeColor : "bg-zinc-800"
            }`}
        >
            {label}
        </button>
    )
}

// ---------------------------------------------------------------------------
// Tiny SVG mini-map card for the history strip
// ---------------------------------------------------------------------------
function ActionMiniMap({action, flip}: { action: Actions; flip: boolean }) {
    const vx = (v: number) => (flip ? 1 - v : v)
    const vy = (v: number) => (flip ? 1 - v : v)

    const W = 48, H = 24

    if (action.type === "starting") {
        const x = vx(action.x) * W
        const y = vy(action.y) * H
        return (
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full"
                 style={{background: "#1f2937", transform: flip ? "rotate(180deg)" : "none"}}>
                <circle cx={x} cy={y} r="2" fill="#d4d4d8"/>
            </svg>
        )
    }

    if (action.type === "climb") {
        const x = vx(action.x) * W
        const y = vy(action.y) * H
        return (
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full"
                 style={{background: "#1f2937", transform: flip ? "rotate(180deg)" : "none"}}>
                <circle cx={x} cy={y} r="2" fill="#a855f7"/>
            </svg>
        )
    }

    if (action.type === "intake") {
        const x1 = vx(action.x1) * W
        const y1 = vy(action.y1) * H
        const x2 = vx(action.x2) * W
        const y2 = vy(action.y2) * H
        return (
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full"
                 style={{background: "#1f2937", transform: flip ? "rotate(180deg)" : "none"}}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#000" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx={x1} cy={y1} r="2" fill="#d4d4d8"/>
                <circle cx={x2} cy={y2} r="2" fill="#d4d4d8"/>
            </svg>
        )
    }

    // shooting
    const x1 = vx(action.x1) * W
    const y1 = vy(action.y1) * H
    const x2 = vx(action.x2) * W
    const y2 = vy(action.y2) * H
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full"
             style={{background: "#1f2937", transform: flip ? "rotate(180deg)" : "none"}}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#a3e635" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx={x1} cy={y1} r="2" fill="#d4d4d8"/>
            <circle cx={x2} cy={y2} r="1.5" fill="#facc15"/>
        </svg>
    )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function AutoPhase({
                                      data,
                                      setData,
                                  }: {
    data: MatchScoutingData
    setData: React.Dispatch<React.SetStateAction<MatchScoutingData>>
}) {
    const deviceType = getSettingSync("match_scouting_device_type") ?? "mobile"
    const fieldRef = useRef<HTMLDivElement>(null)
    const stripRef = useRef<HTMLDivElement>(null)

    // ---------------------------------------------------------------------------
    // Core state — actions is the single source of truth.
    // activeIndex always points to the action currently loaded in the editor.
    // Climb is always the last action in the array.
    // ---------------------------------------------------------------------------
    const [actions, setActions] = useState<Actions[]>([
        {type: "starting", x: 0.5, y: 0.5},
        {type: "climb", x: 0.5, y: 0.5, attempted: false, success: false, time: 0},
    ])
    const [activeIndex, setActiveIndex] = useState(0)

    // Derived from the active action
    const active = actions[activeIndex] ?? {type: "starting", x: 0.5, y: 0.5}

    // Derive the current phase directly from the active action
    const inputState = (active.type.charAt(0).toUpperCase() + active.type.slice(1)) as "Starting" | "Shooting" | "Intake" | "Climb"

    // ---------------------------------------------------------------------------
    // Field drag - supports dragging for all action types
    // ---------------------------------------------------------------------------
    const [dragging, setDragging] = useState(false)

    const flip = (getSettingSync("field_orientation") === "180") !== (data.alliance === "red")

    function getFieldPos(e: React.PointerEvent) {
        if (!fieldRef.current) return {x: 0, y: 0}
        const rect = fieldRef.current.getBoundingClientRect()
        return {
            x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
            y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
        }
    }

    function handlePointerDown(e: React.PointerEvent) {
        const p = getFieldPos(e)
        const current = actions[activeIndex]

        if (current.type === 'starting') {
            setActions(prev => {
                const copy = [...prev]
                copy[activeIndex] = {type: 'starting', x: p.x, y: p.y}
                return copy
            })
            setDragging(true)
        } else if (current.type === 'climb') {
            setActions(prev => {
                const copy = [...prev]
                copy[activeIndex] = {...copy[activeIndex] as ActionClimb, x: p.x, y: p.y}
                return copy
            })
            setDragging(true)
        } else if (current.type === 'intake') {
            setActions(prev => {
                const copy = [...prev]
                copy[activeIndex] = {...copy[activeIndex] as ActionIntake, x1: p.x, y1: p.y, x2: p.x, y2: p.y}
                return copy
            })
            setDragging(true)
        } else if (current.type === 'shooting') {
            setActions(prev => {
                const copy = [...prev]
                copy[activeIndex] = {...copy[activeIndex] as ActionShoot, x1: p.x, y1: p.y, x2: p.x, y2: p.y}
                return copy
            })
            setDragging(true)
        }
    }

    function handlePointerMove(e: React.PointerEvent) {
        if (!dragging) return
        const p = getFieldPos(e)
        const current = actions[activeIndex]

        if (current.type === 'intake' || current.type === 'shooting') {
            setActions(prev => {
                const copy = [...prev]
                copy[activeIndex] = {...copy[activeIndex] as ActionIntake | ActionShoot, x2: p.x, y2: p.y}
                return copy
            })
        } else if (current.type === "starting") {
            setActions(prev => {
                const copy = [...prev]
                copy[activeIndex] = {type: 'starting', x: p.x, y: p.y}
                return copy
            })
        } else if (current.type === "climb") {
            setActions(prev => {
                const copy = [...prev]
                copy[activeIndex] = {...copy[activeIndex] as ActionClimb, x: p.x, y: p.y}
                return copy
            })
        }
    }

    function handlePointerUp(e: React.PointerEvent) {
        if (!dragging) return
        const p = getFieldPos(e)
        const current = actions[activeIndex]

        if (current.type === 'intake' || current.type === 'shooting') {
            setActions(prev => {
                const copy = [...prev]
                copy[activeIndex] = {...copy[activeIndex] as ActionIntake | ActionShoot, x2: p.x, y2: p.y}
                return copy
            })
        } else if (current.type === "starting") {
            setActions(prev => {
                const copy = [...prev]
                copy[activeIndex] = {type: 'starting', x: p.x, y: p.y}
                return copy
            })
        } else if (current.type === "climb") {
            setActions(prev => {
                const copy = [...prev]
                copy[activeIndex] = {...copy[activeIndex] as ActionClimb, x: p.x, y: p.y}
                return copy
            })
        }
        setDragging(false)
    }

    // ---------------------------------------------------------------------------
    // "Save" = commit current + append a fresh action before climb, move active to it
    // ---------------------------------------------------------------------------
    function handleSave() {
        const isFirstStart = activeIndex === 0 && active.type === "starting"

        let fresh: Actions
        if (isFirstStart || active.type === "shooting") {
            fresh = {
                type: "shooting",
                x1: 0.5,
                y1: 0.5,
                x2: 0.5,
                y2: 0.5,
                shot: 0,
                scoring: true,
                scored: 0,
                _shot: [],
                _scored: []
            }
        } else if (active.type === "intake") {
            fresh = {type: "intake", x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5, amount: 0, _amount: []}
        } else {
            fresh = {
                type: "shooting",
                x1: 0.5,
                y1: 0.5,
                x2: 0.5,
                y2: 0.5,
                shot: 0,
                scoring: true,
                scored: 0,
                _shot: [],
                _scored: []
            }
        }

        const insertIndex = actions.length - 1

        setActions(prev => {
            const newActions = [...prev]
            newActions.splice(prev.length - 1, 0, fresh)
            return newActions
        })

        setActiveIndex(insertIndex)
    }

    // ---------------------------------------------------------------------------
    // "Delete" = remove active shot, land on previous (but never delete Starting or Climb)
    // ---------------------------------------------------------------------------
    function handleDelete() {
        if (activeIndex === 0 || activeIndex === actions.length - 1) return

        setActions(prev => {
            const next = prev.filter((_, i) => i !== activeIndex)
            setActiveIndex(Math.max(0, activeIndex - 1))
            return next
        })
    }

    // ---------------------------------------------------------------------------
    // Scroll the strip so the active card is visible whenever activeIndex changes
    // ---------------------------------------------------------------------------
    useEffect(() => {
        if (!stripRef.current) return
        const cards = stripRef.current.querySelectorAll("[data-shot-card]")
        if (cards[activeIndex]) {
            cards[activeIndex].scrollIntoView({behavior: "smooth", block: "nearest", inline: "center"})
        }
    }, [activeIndex, actions.length])

    // ---------------------------------------------------------------------------
    // Sync to parent data
    // ---------------------------------------------------------------------------
    useEffect(() => {
        setData(d => ({
            ...d,
            auto: {
                ...d.auto,
                shootLocation: actions as Actions[],
            },
        }))
        console.log(data.auto.shootLocation)
    }, [actions, setData])

    // ---------------------------------------------------------------------------
    // View helpers
    // ---------------------------------------------------------------------------
    const viewX = (v: number) => (flip ? 1 - v : v)
    const viewY = (v: number) => (flip ? 1 - v : v)

    const getAngle = () => {
        const current = active
        if (current.type !== 'intake' && current.type !== 'shooting') return 0
        return Math.atan2(viewY(current.y2) - viewY(current.y1), (viewX(current.x2) - viewX(current.x1)) * 2) * (180 / Math.PI)
    }
    const angle = getAngle()

    // ---------------------------------------------------------------------------
    // Tab click handler — converts the active action to the selected type
    // ---------------------------------------------------------------------------
    const handleTabClick = (phase: "Starting" | "Shooting" | "Intake" | "Climb") => {
        const current = actions[activeIndex]
        if (!current) return

        const targetType = phase.toLowerCase() as Actions['type']
        if (current.type === targetType) return

        // Don't convert starting or climb actions, and don't convert to starting or climb
        if (current.type === 'starting' || current.type === 'climb') return
        if (targetType === 'starting' || targetType === 'climb') return

        setActions(prev => {
            const copy = [...prev]
            if (targetType === 'intake') {
                const old = copy[activeIndex] as ActionShoot
                copy[activeIndex] = {
                    type: 'intake',
                    x1: old.x1,
                    y1: old.y1,
                    x2: old.x2,
                    y2: old.y2,
                    amount: 0,
                    _amount: []
                }
            } else if (targetType === 'shooting') {
                const old = copy[activeIndex] as ActionIntake
                copy[activeIndex] = {
                    type: 'shooting',
                    x1: old.x1, y1: old.y1,
                    x2: old.x2, y2: old.y2,
                    shot: 0, scoring: true, scored: 0,
                    _shot: [], _scored: []
                }
            }
            return copy
        })
    }

    const isTabDisabled = (phase: "Starting" | "Intake" | "Shooting" | "Climb") => {
        if (phase === "Starting") return activeIndex !== 0
        if (phase === "Climb") return activeIndex !== actions.length - 1
        return activeIndex === 0 || activeIndex === actions.length - 1
    }

    // ---------------------------------------------------------------------------
    // Helper to update action in array
    // ---------------------------------------------------------------------------
    const updateAction = (updater: (action: Actions) => Actions) => {
        setActions(prev => {
            const copy = [...prev]
            copy[activeIndex] = updater(copy[activeIndex])
            return copy
        })
    }

    // ---------------------------------------------------------------------------
    // Render field component (shared between layouts)
    // ---------------------------------------------------------------------------
    const renderField = () => {
        const current = active

        return (
            <div
                ref={fieldRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={() => setDragging(false)}
                className="relative w-full aspect-2/1 bg-gray-800 rounded-xl overflow-hidden touch-none"
                style={{transform: flip ? "rotate(180deg)" : "none"}}
            >
                <img
                    src="/seasons/2026/Field.png"
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    alt="field"
                />

                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    {current.type === "intake" && (
                        <line
                            x1={`${viewX(current.x1) * 100}%`} y1={`${viewY(current.y1) * 100}%`}
                            x2={`${viewX(current.x2) * 100}%`} y2={`${viewY(current.y2) * 100}%`}
                            stroke="#000" strokeWidth="3" strokeLinecap="round"
                        />
                    )}
                </svg>

                {current.type === "starting" && (
                    <div
                        className="absolute"
                        style={{
                            width: "3.75%",
                            height: "7.5%",
                            left: `${viewX(current.x) * 100}%`,
                            top: `${viewY(current.y) * 100}%`,
                            transform: `translate(-50%, -50%)`,
                        }}
                    >
                        <div className="absolute inset-0 bg-zinc-600/50 border-2 rounded-xs border-zinc-800"/>
                    </div>
                )}

                {current.type === "climb" && (
                    <div
                        className="absolute"
                        style={{
                            width: "3.75%",
                            height: "7.5%",
                            left: `${viewX(current.x) * 100}%`,
                            top: `${viewY(current.y) * 100}%`,
                            transform: `translate(-50%, -50%)`,
                        }}
                    >
                        <div className="absolute inset-0 bg-purple-600/50 border-2 rounded-xs border-purple-800"/>
                    </div>
                )}

                {current.type === "intake" && (
                    <div
                        className="absolute"
                        style={{
                            width: "3.75%",
                            height: "7.5%",
                            left: `${viewX(current.x1) * 100}%`,
                            top: `${viewY(current.y1) * 100}%`,
                            transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                        }}
                    >
                        <div className="absolute inset-0 bg-zinc-600/50 border-2 rounded-xs border-zinc-800"/>
                    </div>
                )}

                {current.type === "intake" && (
                    <div
                        className="absolute"
                        style={{
                            width: "3.75%",
                            height: "7.5%",
                            left: `${viewX(current.x2) * 100}%`,
                            top: `${viewY(current.y2) * 100}%`,
                            transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                        }}
                    >
                        <div className="absolute inset-0 bg-zinc-600/50 border-2 rounded-xs border-zinc-800"/>
                    </div>
                )}

                {current.type === "shooting" && (
                    <div
                        className="absolute"
                        style={{
                            width: "3.75%",
                            height: "7.5%",
                            left: `${viewX(current.x1) * 100}%`,
                            top: `${viewY(current.y1) * 100}%`,
                            transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                        }}
                    >
                        <div className="absolute inset-0 bg-zinc-600/50 border-2 rounded-xs border-zinc-800"/>
                    </div>
                )}

                {current.type === "shooting" && (() => {
                    const dx = viewX(current.x2) - viewX(current.x1)
                    const dy = viewY(current.y2) - viewY(current.y1)
                    const dist = Math.sqrt((dx * 2) ** 2 + dy ** 2)
                    const ballDiameter = 0.0167 * 1.5
                    const count = Math.max(0, Math.floor(dist / ballDiameter))
                    const balls: React.ReactNode[] = []
                    for (let i = 0; i < count; i++) {
                        const t = 1 - (i * ballDiameter) / dist
                        if (t <= 0) break
                        balls.push(
                            <div
                                key={i}
                                className="absolute rounded-full bg-yellow-400 border border-black/30"
                                style={{
                                    width: "0.833%",
                                    height: "1.67%",
                                    left: `${(viewX(current.x1) + dx * t) * 100}%`,
                                    top: `${(viewY(current.y1) + dy * t) * 100}%`,
                                    transform: "translate(-50%, -50%)",
                                }}
                            />
                        )
                    }
                    return balls
                })()}
            </div>
        )
    }

    // ---------------------------------------------------------------------------
    // Render controls component - different for each action type
    // ---------------------------------------------------------------------------
    const renderControls = () => {
        const current = active

        return (
            <>
                {/* Phase tabs */}
                <div className="flex items-center gap-2">
                    {(["Starting", "Intake", "Shooting", "Climb"] as const).map(phase => {
                        const disabled = isTabDisabled(phase)
                        return (
                            <button
                                key={phase}
                                disabled={disabled}
                                onClick={() => handleTabClick(phase)}
                                className={`text-white text-sm py-2 rounded-xl transition flex-1 ${
                                    inputState === phase ? "bg-zinc-600"
                                        : disabled ? "bg-zinc-900 opacity-40"
                                            : "bg-zinc-800"
                                }`}
                            >
                                {phase}
                            </button>
                        )
                    })}
                </div>

                {/* Starting: No controls */}
                {current.type === "starting" && (
                    <div className="text-zinc-500 text-center py-8 text-sm">
                        Set starting position on field
                    </div>
                )}

                {/* Intake: Fuel Picked Up only */}
                {current.type === "intake" && (
                    <div>
                        <div className="grid grid-cols-4 gap-2">
                            {[1, 2, 5, 10].map(v => (
                                <PulseButton
                                    key={v}
                                    label={`+${v}`}
                                    activeColor="bg-green-700"
                                    onClick={() => {
                                        setActions(prev => {
                                            const copy = [...prev]
                                            const c = copy[activeIndex] as ActionIntake

                                            copy[activeIndex] = {
                                                ...c,
                                                amount: c.amount + v,
                                                _amount: [...c._amount, v],
                                            }

                                            return copy
                                        })

                                    }}
                                />
                            ))}
                            <div className="grid grid-cols-2 gap-2 col-span-4">
                                <PulseButton
                                    label="UNDO"
                                    activeColor="bg-red-800"
                                    onClick={() => {
                                        setActions(prev => {
                                            const copy = [...prev]
                                            const c = copy[activeIndex] as ActionIntake
                                            if (c._amount.length === 0) return prev

                                            const last = c._amount[c._amount.length - 1]

                                            copy[activeIndex] = {
                                                ...c,
                                                amount: c.amount - last,
                                                _amount: c._amount.slice(0, -1),
                                            }

                                            return copy
                                        })

                                    }}
                                />
                                <p className="text-center text-sm font-bold py-2 bg-zinc-800 rounded">
                                    Picked Up: {current.amount}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Shooting: Fuel Shot + Fuel Scored */}
                {current.type === "shooting" && (
                    <div className="flex flex-col gap-3">
                        {/* Fuel Shot */}
                        <div>
                            <div className="grid grid-cols-4 gap-2">
                                {[1, 2, 5, 10].map(v => (
                                    <PulseButton
                                        key={v}
                                        label={`+${v}`}
                                        activeColor="bg-green-700"
                                        onClick={() => {
                                            setActions(prev => {
                                                const copy = [...prev]
                                                const c = copy[activeIndex] as ActionShoot

                                                copy[activeIndex] = {
                                                    ...c,
                                                    shot: c.shot + v,
                                                    _shot: [...c._shot, v],
                                                }

                                                return copy
                                            })

                                        }}
                                    />
                                ))}
                                <div className="grid grid-cols-2 gap-2 col-span-4">
                                    <PulseButton
                                        label="UNDO"
                                        activeColor="bg-red-800"
                                        onClick={() => {
                                            setActions(prev => {
                                                const copy = [...prev]
                                                const c = copy[activeIndex] as ActionShoot
                                                if (c._shot.length === 0) return prev

                                                const last = c._shot[c._shot.length - 1]

                                                copy[activeIndex] = {
                                                    ...c,
                                                    shot: c.shot - last,
                                                    _shot: c._shot.slice(0, -1),
                                                }

                                                return copy
                                            })

                                        }}
                                    />
                                    <p className="text-center text-sm font-bold py-2 bg-zinc-800 rounded">
                                        Total Shot: {current.shot}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Scoring toggle */}
                        <button
                            onClick={() => updateAction(a => ({...a as ActionShoot, scoring: !current.scoring}))}
                            className={`text-white text-sm py-2 rounded-xl transition-colors ${
                                current.scoring ? "bg-green-800" : "bg-red-800"
                            }`}
                        >
                            Scoring?
                        </button>

                        {/* Fuel Scored */}
                        <div>
                            <div className="grid grid-cols-4 gap-2">
                                {[1, 2, 5, 10].map(v => (
                                    <PulseButton
                                        key={v}
                                        label={`+${v}`}
                                        activeColor="bg-green-700"
                                        onClick={() => {
                                            setActions(prev => {
                                                const copy = [...prev]
                                                const c = copy[activeIndex] as ActionShoot

                                                copy[activeIndex] = {
                                                    ...c,
                                                    scored: c.scored + v,
                                                    _scored: [...c._scored, v],
                                                }

                                                return copy
                                            })

                                        }}
                                    />
                                ))}
                                <div className="grid grid-cols-2 gap-2 col-span-4">
                                    <PulseButton
                                        label="UNDO"
                                        activeColor="bg-red-800"
                                        onClick={() => {
                                            setActions(prev => {
                                                const copy = [...prev]
                                                const c = copy[activeIndex] as ActionShoot
                                                if (c._scored.length === 0) return prev

                                                const last = c._scored[c._scored.length - 1]

                                                copy[activeIndex] = {
                                                    ...c,
                                                    scored: c.scored - last,
                                                    _scored: c._scored.slice(0, -1),
                                                }

                                                return copy
                                            })
                                        }}
                                    />
                                    <p className="text-center text-sm font-bold py-2 bg-zinc-800 rounded">
                                        Scored: {current.scored}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Climb: Attempted toggle, Success toggle, Speed slider */}
                {current.type === "climb" && (
                    <div className="flex flex-col gap-3">
                        <button
                            onClick={() => updateAction(a => ({...a as ActionClimb, attempted: !current.attempted}))}
                            className={`text-white text-sm py-2 rounded-xl transition-colors ${
                                current.attempted ? "bg-green-800" : "bg-red-800"
                            }`}
                        >
                            Attempted?
                        </button>

                        <button
                            onClick={() => updateAction(a => ({...a as ActionClimb, success: !current.success}))}
                            className={`text-white text-sm py-2 rounded-xl transition-colors ${
                                current.success ? "bg-green-800" : "bg-red-800"
                            }`}
                        >
                            Success?
                        </button>

                        <RatingSlider
                            value={current.time}
                            onChange={v => updateAction(a => ({...a as ActionClimb, time: v}))}
                            title={`Climb Time: ${(current.time * 10).toFixed(1)}s`}
                            leftLabel="0s"
                            rightLabel="10s+"
                            step={0.01}
                            invertColor={true}
                        />
                    </div>
                )}
            </>
        )
    }

    // ---------------------------------------------------------------------------
    // Render history strip (shared between layouts)
    // ---------------------------------------------------------------------------
    const renderHistoryStrip = () => (
        <div
            ref={stripRef}
            className="flex gap-2 overflow-x-auto pb-1"
            style={{
                scrollSnapType: "x mandatory",
                WebkitOverflowScrolling: "touch",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
            }}
        >
            {actions.map((action, i) => {
                const isActive = i === activeIndex
                return (
                    <button
                        key={i}
                        data-shot-card=""
                        onClick={() => setActiveIndex(i)}
                        className={`
                            shrink-0 w-24 rounded-lg overflow-hidden border-2 transition-colors duration-150
                            ${isActive ? "border-lime-400" : "border-zinc-700"}
                        `}
                        style={{scrollSnapAlign: "start"}}
                    >
                        <div className="w-full aspect-2/1">
                            <ActionMiniMap action={action} flip={flip}/>
                        </div>
                        <div
                            className={`flex justify-between px-1.5 py-0.5 text-xs font-bold ${
                                isActive ? "bg-zinc-700" : "bg-zinc-800"
                            }`}
                        >
                            {action.type === "starting" ? (
                                <span className="text-zinc-400 w-full text-center">Start</span>
                            ) : action.type === "climb" ? (
                                <span className="text-purple-400 w-full text-center">
                                    {action.attempted ? (action.success ? "✓" : "✗") : "—"}
                                </span>
                            ) : action.type === "intake" ? (
                                <span className="text-yellow-300">🔥 {action.amount}</span>
                            ) : (
                                <>
                                    <span className="text-yellow-300">🔥 {action.shot}</span>
                                    <span className="text-green-300">✓ {action.scored}</span>
                                </>
                            )}
                        </div>
                    </button>
                )
            })}
        </div>
    )

    // ---------------------------------------------------------------------------
    // Main render - conditional layout based on device type
    // ---------------------------------------------------------------------------
    if (deviceType === "tablet") {
        return (
            <div className="w-screen flex flex-col gap-3 p-3 select-none text-sm">
                <div className="flex gap-3">
                    <div className="flex-3 flex flex-col gap-3">
                        {renderField()}
                    </div>

                    <div className="flex-1 flex flex-col gap-3">
                        {renderControls()}

                        <div className="grid grid-cols-2 gap-2 mt-auto">
                            <button
                                onClick={handleDelete}
                                disabled={activeIndex === 0 || activeIndex === actions.length - 1}
                                className={`text-white text-sm py-2 rounded-xl transition-colors ${
                                    activeIndex === 0 || activeIndex === actions.length - 1
                                        ? "bg-zinc-900 opacity-40 cursor-not-allowed"
                                        : "bg-red-800"
                                }`}
                            >
                                Delete
                            </button>
                            <button
                                onClick={handleSave}
                                className="bg-green-800 text-white text-sm py-2 rounded-xl"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>

                {renderHistoryStrip()}
            </div>
        )
    }

    // Mobile layout
    return (
        <div className="w-screen h-max flex flex-col p-2 select-none gap-4 text-sm">
            {renderField()}
            {renderControls()}

            <div className="grid grid-cols-2 gap-2">
                <button
                    onClick={handleDelete}
                    disabled={activeIndex === 0 || activeIndex === actions.length - 1}
                    className={`text-white text-sm py-2 rounded-xl transition-colors ${
                        activeIndex === 0 || activeIndex === actions.length - 1
                            ? "bg-zinc-900 opacity-40 cursor-not-allowed"
                            : "bg-red-800"
                    }`}
                >
                    Delete
                </button>
                <button
                    onClick={handleSave}
                    className="bg-green-800 text-white text-sm py-2 rounded-xl"
                >
                    Save
                </button>
            </div>

            {renderHistoryStrip()}
        </div>
    )
}