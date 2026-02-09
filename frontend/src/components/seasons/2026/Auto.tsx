import React, { useEffect, useRef, useState } from "react"
import type { MatchScoutingData } from "@/types"
import { getSettingSync } from "@/db/settingsDb"
import RatingSlider from "@/components/ui/ratingSlider.tsx"

// ---------------------------------------------------------------------------
// Action Types - Discriminated Union
// ---------------------------------------------------------------------------
export type Actions = ActionStart | ActionIntake | ActionShoot | ActionClimb

export type ActionStart = {
    type: 'starting'
    x: number
    y: number
}

export type ActionIntake = {
    type: 'intake'
    x1: number
    y1: number
    x2: number
    y2: number
    amount: number
}

export type ActionShoot = {
    type: 'shooting'
    x1: number
    y1: number
    x2: number
    y2: number
    shot: number
    scoring: boolean
    scored: number
}

export type ActionClimb = {
    type: 'climb'
    x: number
    y: number
    attempted: boolean
    success: boolean
    time: number
}

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
function ActionMiniMap({ action, flip }: { action: Actions; flip: boolean }) {
    const vx = (v: number) => (flip ? 1 - v : v)
    const vy = (v: number) => (flip ? 1 - v : v)

    const W = 48, H = 24

    if (action.type === "starting") {
        const x = vx(action.x) * W
        const y = vy(action.y) * H
        return (
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" style={{ background: "#1f2937", transform: flip ? "rotate(180deg)" : "none" }}>
                <circle cx={x} cy={y} r="2" fill="#d4d4d8" />
            </svg>
        )
    }

    if (action.type === "climb") {
        const x = vx(action.x) * W
        const y = vy(action.y) * H
        return (
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" style={{ background: "#1f2937", transform: flip ? "rotate(180deg)" : "none" }}>
                <circle cx={x} cy={y} r="2" fill="#a855f7" />
            </svg>
        )
    }

    if (action.type === "intake") {
        const x1 = vx(action.x1) * W
        const y1 = vy(action.y1) * H
        const x2 = vx(action.x2) * W
        const y2 = vy(action.y2) * H
        return (
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" style={{ background: "#1f2937", transform: flip ? "rotate(180deg)" : "none" }}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#000" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx={x1} cy={y1} r="2" fill="#d4d4d8" />
                <circle cx={x2} cy={y2} r="2" fill="#d4d4d8" />
            </svg>
        )
    }

    // shooting
    const x1 = vx(action.x1) * W
    const y1 = vy(action.y1) * H
    const x2 = vx(action.x2) * W
    const y2 = vy(action.y2) * H
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" style={{ background: "#1f2937", transform: flip ? "rotate(180deg)" : "none" }}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#a3e635" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx={x1} cy={y1} r="2" fill="#d4d4d8" />
            <circle cx={x2} cy={y2} r="1.5" fill="#facc15" />
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
        { type: "starting", x: 0.5, y: 0.5 },
        { type: "climb", x: 0.5, y: 0.5, attempted: false, success: false, time: 0 },
    ])
    const [activeIndex, setActiveIndex] = useState(0)

    // Derived from the active action
    const active = actions[activeIndex] ?? { type: "starting", x: 0.5, y: 0.5 }

    // ---------------------------------------------------------------------------
    // Temporary editing state for number inputs
    // ---------------------------------------------------------------------------
    const [amountStack, setAmountStack] = useState<number[]>([])
    const [shotStack, setShotStack] = useState<number[]>([])
    const [scoredStack, setScoredStack] = useState<number[]>([])

    // When user taps a different action in history, reset stacks AND sync the
    // phase tab to match the action's stored type.
    useEffect(() => {
        const s = actions[activeIndex]
        if (!s) return

        // Reset all stacks
        setAmountStack([])
        setShotStack([])
        setScoredStack([])

        // Capitalize first letter to match the union type
        const capitalised = (s.type.charAt(0).toUpperCase() + s.type.slice(1)) as "Starting" | "Intake" | "Shooting" | "Climb"
        skipStampRef.current = true  // don't let the stamp effect overwrite this action's type
        setInputState(capitalised)
    }, [activeIndex])

    // ---------------------------------------------------------------------------
    // Field drag - for Starting phase, only allow single click (no drag)
    // ---------------------------------------------------------------------------
    const [dragging, setDragging] = useState(false)

    const flip = (getSettingSync("field_orientation") === "180") !== (data.alliance === "red")

    function getFieldPos(e: React.PointerEvent) {
        if (!fieldRef.current) return { x: 0, y: 0 }
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
                copy[activeIndex] = { type: 'starting', x: p.x, y: p.y }
                return copy
            })
        } else if (current.type === 'climb') {
            setActions(prev => {
                const copy = [...prev]
                copy[activeIndex] = { ...copy[activeIndex] as ActionClimb, x: p.x, y: p.y }
                return copy
            })
        } else if (current.type === 'intake') {
            setActions(prev => {
                const copy = [...prev]
                copy[activeIndex] = { ...copy[activeIndex] as ActionIntake, x1: p.x, y1: p.y, x2: p.x, y2: p.y }
                return copy
            })
            setDragging(true)
        } else if (current.type === 'shooting') {
            setActions(prev => {
                const copy = [...prev]
                copy[activeIndex] = { ...copy[activeIndex] as ActionShoot, x1: p.x, y1: p.y, x2: p.x, y2: p.y }
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
                copy[activeIndex] = { ...copy[activeIndex] as ActionIntake | ActionShoot, x2: p.x, y2: p.y }
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
                copy[activeIndex] = { ...copy[activeIndex] as ActionIntake | ActionShoot, x2: p.x, y2: p.y }
                return copy
            })
        }
        setDragging(false)
    }

    // ---------------------------------------------------------------------------
    // "Save" = commit current + append a fresh action before climb, move active to it
    // ---------------------------------------------------------------------------
    function handleSave() {
        // If we just saved the first Starting action, auto-switch to Shooting
        const nextType = (activeIndex === 0 && inputState === "Starting") ? "shooting" : inputState.toLowerCase()

        let fresh: Actions
        if (nextType === "shooting") {
            fresh = { type: "shooting", x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5, shot: 0, scoring: true, scored: 0 }
        } else if (nextType === "intake") {
            fresh = { type: "intake", x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5, amount: 0 }
        } else {
            fresh = { type: "shooting", x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5, shot: 0, scoring: true, scored: 0 }
        }

        setActions(prev => {
            // Insert before the last item (climb)
            const newActions = [...prev]
            newActions.splice(prev.length - 1, 0, fresh)
            return newActions
        })
        setActiveIndex(actions.length - 1) // new index is length - 1 (before climb)

        // Update the input state to match the new action
        if (activeIndex === 0 && inputState === "Starting") {
            setInputState("Shooting")
        }
    }

    // ---------------------------------------------------------------------------
    // "Delete" = remove active shot, land on previous (but never delete Starting or Climb)
    // ---------------------------------------------------------------------------
    function handleDelete() {
        // Can't delete Starting (index 0) or Climb (last index)
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
            cards[activeIndex].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" })
        }
    }, [activeIndex, actions.length])

    // ---------------------------------------------------------------------------
    // Sync stacks to actions (moved from renderControls)
    // ---------------------------------------------------------------------------
    useEffect(() => {
        if (active.type === 'intake' && amountStack.length > 0) {
            setActions(prev => {
                const copy = [...prev]
                const current = copy[activeIndex] as ActionIntake
                copy[activeIndex] = {
                    ...current,
                    amount: current.amount + amountStack.reduce((sum, v) => sum + v, 0)
                }
                return copy
            })
            setAmountStack([])
        }
    }, [amountStack])

    useEffect(() => {
        if (active.type === 'shooting' && shotStack.length > 0) {
            setActions(prev => {
                const copy = [...prev]
                const current = copy[activeIndex] as ActionShoot
                copy[activeIndex] = {
                    ...current,
                    shot: current.shot + shotStack.reduce((sum, v) => sum + v, 0)
                }
                return copy
            })
            setShotStack([])
        }
    }, [shotStack])

    useEffect(() => {
        if (active.type === 'shooting' && scoredStack.length > 0) {
            setActions(prev => {
                const copy = [...prev]
                const current = copy[activeIndex] as ActionShoot
                copy[activeIndex] = {
                    ...current,
                    scored: current.scored + scoredStack.reduce((sum, v) => sum + v, 0)
                }
                return copy
            })
            setScoredStack([])
        }
    }, [scoredStack])

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
    }, [actions, setData])

    // ---------------------------------------------------------------------------
    // View helpers
    // ---------------------------------------------------------------------------
    const viewX = (v: number) => (flip ? 1 - v : v)
    const viewY = (v: number) => (flip ? 1 - v : v)

    // Calculate angle for intake/shooting actions
    const getAngle = () => {
        const current = active
        if (current.type !== 'intake' && current.type !== 'shooting') return 0
        return Math.atan2(viewY(current.y2) - viewY(current.y1), (viewX(current.x2) - viewX(current.x1)) * 2) * (180 / Math.PI)
    }
    const angle = getAngle()

    // ---------------------------------------------------------------------------
    // Input-phase tabs
    // ---------------------------------------------------------------------------
    const [inputState, setInputState] = useState<"Starting" | "Shooting" | "Intake" | "Climb">("Starting")
    const skipStampRef = useRef(false)

    // Per-tab enabled rules: Starting must be first and can only appear once,
    // Intake/Shooting are not available until after Starting.
    // Climb is only available on the last action.
    const isTabDisabled = (phase: "Starting" | "Intake" | "Shooting" | "Climb") => {
        if (phase === "Starting") return activeIndex !== 0  // only allowed on the very first action
        if (phase === "Climb") return activeIndex !== actions.length - 1  // only allowed on the last action
        return activeIndex === 0 || activeIndex === actions.length - 1  // Intake/Shooting blocked on first and last
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
                style={{ transform: flip ? "rotate(180deg)" : "none" }}
            >
                <img
                    src="/seasons/2026/Field.png"
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    alt="field"
                />

                {/* SVG overlay for lines */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    {/* Intake: black line connecting the two robot positions */}
                    {current.type === "intake" && (
                        <line
                            x1={`${viewX(current.x1) * 100}%`} y1={`${viewY(current.y1) * 100}%`}
                            x2={`${viewX(current.x2) * 100}%`} y2={`${viewY(current.y2) * 100}%`}
                            stroke="#000" strokeWidth="3" strokeLinecap="round"
                        />
                    )}
                </svg>

                {/* Starting: robot square at (x,y) ONLY - no arrow, just position */}
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
                        <div className="absolute inset-0 bg-zinc-600/50 border-2 rounded-xs border-zinc-800" />
                    </div>
                )}

                {/* Climb: robot square at (x,y) ONLY - same as Starting */}
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
                        <div className="absolute inset-0 bg-purple-600/50 border-2 rounded-xs border-purple-800" />
                    </div>
                )}

                {/* Intake: robot square at start */}
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
                        <div className="absolute inset-0 bg-zinc-600/50 border-2 rounded-xs border-zinc-800" />
                    </div>
                )}

                {/* Intake: robot square at end */}
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
                        <div className="absolute inset-0 bg-zinc-600/50 border-2 rounded-xs border-zinc-800" />
                    </div>
                )}

                {/* Shooting: robot square at start */}
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
                        <div className="absolute inset-0 bg-zinc-600/50 border-2 rounded-xs border-zinc-800" />
                    </div>
                )}

                {/* Shooting: ball trail from robot to shot location */}
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

        // Helper to update action in array
        const updateAction = (updater: (action: Actions) => Actions) => {
            setActions(prev => {
                const copy = [...prev]
                copy[activeIndex] = updater(copy[activeIndex])
                return copy
            })
        }

        // Calculate current totals including stacks
        const currentAmount = current.type === 'intake' ? current.amount + amountStack.reduce((a, b) => a + b, 0) : 0
        const currentShot = current.type === 'shooting' ? current.shot + shotStack.reduce((a, b) => a + b, 0) : 0
        const currentScored = current.type === 'shooting' ? current.scored + scoredStack.reduce((a, b) => a + b, 0) : 0

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
                                onClick={() => setInputState(phase)}
                                className={`text-white text-sm py-2 rounded-xl transition flex-1 ${
                                    inputState === phase ? "bg-zinc-600"
                                    : disabled           ? "bg-zinc-900 opacity-40"
                                    :                     "bg-zinc-800"
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
                                    onClick={() => setAmountStack(s => [...s, v])}
                                />
                            ))}
                            <div className="grid grid-cols-2 gap-2 col-span-4">
                                <PulseButton
                                    label="UNDO"
                                    activeColor="bg-red-800"
                                    onClick={() => {
                                        if (amountStack.length > 0) {
                                            setAmountStack(s => s.slice(0, -1))
                                        } else if (current.amount > 0) {
                                            updateAction(a => ({ ...a as ActionIntake, amount: 0 }))
                                        }
                                    }}
                                />
                                <p className="text-center text-sm font-bold py-2 bg-zinc-800 rounded">
                                    Picked Up: {currentAmount}
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
                                        onClick={() => setShotStack(s => [...s, v])}
                                    />
                                ))}
                                <div className="grid grid-cols-2 gap-2 col-span-4">
                                    <PulseButton
                                        label="UNDO"
                                        activeColor="bg-red-800"
                                        onClick={() => {
                                            if (shotStack.length > 0) {
                                                setShotStack(s => s.slice(0, -1))
                                            } else if (current.shot > 0) {
                                                updateAction(a => ({ ...a as ActionShoot, shot: 0 }))
                                            }
                                        }}
                                    />
                                    <p className="text-center text-sm font-bold py-2 bg-zinc-800 rounded">
                                        Total Shot: {currentShot}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Scoring toggle */}
                        <button
                            onClick={() => {
                                updateAction(a => ({ ...a as ActionShoot, scoring: !current.scoring }))
                            }}
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
                                        onClick={() => setScoredStack(s => [...s, v])}
                                    />
                                ))}
                                <div className="grid grid-cols-2 gap-2 col-span-4">
                                    <PulseButton
                                        label="UNDO"
                                        activeColor="bg-red-800"
                                        onClick={() => {
                                            if (scoredStack.length > 0) {
                                                setScoredStack(s => s.slice(0, -1))
                                            } else if (current.scored > 0) {
                                                updateAction(a => ({ ...a as ActionShoot, scored: 0 }))
                                            }
                                        }}
                                    />
                                    <p className="text-center text-sm font-bold py-2 bg-zinc-800 rounded">
                                        Scored: {currentScored}
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
                            onClick={() => {
                                updateAction(a => ({ ...a as ActionClimb, attempted: !current.attempted }))
                            }}
                            className={`text-white text-sm py-2 rounded-xl transition-colors ${
                                current.attempted ? "bg-green-800" : "bg-red-800"
                            }`}
                        >
                            Attempted?
                        </button>

                        <button
                            onClick={() => {
                                updateAction(a => ({ ...a as ActionClimb, success: !current.success }))
                            }}
                            className={`text-white text-sm py-2 rounded-xl transition-colors ${
                                current.success ? "bg-green-800" : "bg-red-800"
                            }`}
                        >
                            Success?
                        </button>

                        <RatingSlider
                            value={current.time}
                            onChange={v => updateAction(a => ({ ...a as ActionClimb, time: v }))}
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
                        style={{ scrollSnapAlign: "start" }}
                    >
                        {/* Mini-map */}
                        <div className="w-full aspect-2/1">
                            <ActionMiniMap action={action} flip={flip} />
                        </div>
                        {/* Label row — content depends on action type */}
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
                {/* Top section: Field + Controls */}
                <div className="flex gap-3">
                    {/* Left side: Field */}
                    <div className="flex-3 flex flex-col gap-3">
                        {renderField()}
                    </div>

                    {/* Right side: Controls */}
                    <div className="flex-1 flex flex-col gap-3">
                        {renderControls()}

                        {/* Delete / Save buttons at bottom of controls */}
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

                {/* Bottom section: History strip (full width) */}
                {renderHistoryStrip()}
            </div>
        )
    }

    // Mobile layout (original)
    return (
        <div className="w-screen h-max flex flex-col p-2 select-none gap-4 text-sm">
            {/* Field */}
            {renderField()}

            {/* Controls */}
            {renderControls()}

            {/* Delete / Save buttons */}
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

            {/* Horizontal history strip */}
            {renderHistoryStrip()}
        </div>
    )
}

// TODO: change intake to only 1 number control
