import React, { useEffect, useRef, useState } from "react"
import type { MatchScoutingData } from "@/types"
import { getSettingSync } from "@/db/settingsDb"
import type { Actions } from "@/components/seasons/2026/yearConfig.ts"
import RatingSlider from "@/components/ui/ratingSlider.tsx"

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
// Draws the robot dot at (x1,y1) and an arrow to (x2,y2)
// ---------------------------------------------------------------------------
function ActionMiniMap({ action, flip }: { action: Actions; flip: boolean }) {
    const vx = (v: number) => (flip ? 1 - v : v)
    const vy = (v: number) => (flip ? 1 - v : v)

    const W = 48, H = 24
    const x1 = vx(action.x1) * W
    const y1 = vy(action.y1) * H
    const x2 = vx(action.x2) * W
    const y2 = vy(action.y2) * H

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" style={{ background: "#1f2937" }}>
            <defs>
                <marker id="mini-arrow" markerWidth="5" markerHeight="5" viewBox="0 0 10 10" refX="4" refY="5" orient="auto">
                    <path d="M0,0 L10,5 L0,10 Z" fill="#d4d4d8" />
                </marker>
            </defs>

            {action.type === "starting" && (
                <>
                    {/* Zinc arrow line */}
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d4d4d8" strokeWidth="1.5" markerEnd="url(#mini-arrow)" />
                    {/* Origin dot */}
                    <circle cx={x1} cy={y1} r="2" fill="#d4d4d8" />
                </>
            )}

            {action.type === "intake" && (
                <>
                    {/* Black connecting line */}
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#000" strokeWidth="1.5" strokeLinecap="round" />
                    {/* Robot at start */}
                    <circle cx={x1} cy={y1} r="2" fill="#d4d4d8" />
                    {/* Robot at end */}
                    <circle cx={x2} cy={y2} r="2" fill="#d4d4d8" />
                </>
            )}

            {action.type === "shooting" && (
                <>
                    {/* Green arrow line to target */}
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#a3e635" strokeWidth="1.5" strokeLinecap="round" />
                    {/* Robot dot */}
                    <circle cx={x1} cy={y1} r="2" fill="#d4d4d8" />
                    {/* Target dot */}
                    <circle cx={x2} cy={y2} r="1.5" fill="#facc15" />
                </>
            )}
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
    const fieldRef = useRef<HTMLDivElement>(null)
    const stripRef = useRef<HTMLDivElement>(null)

    // ---------------------------------------------------------------------------
    // Core state — actions is the single source of truth.
    // activeIndex always points to the action currently loaded in the editor.
    // ---------------------------------------------------------------------------
    const [actions, setActions] = useState<Actions[]>([
        { type: "starting", x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5, fuelMoved: 0, fuelScored: 0 },
    ])
    const [activeIndex, setActiveIndex] = useState(0)

    // Derived from the active action
    const active = actions[activeIndex] ?? { type: "starting", x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5, fuelMoved: 0, fuelScored: 0 }
    const { x1, y1, x2, y2, fuelMoved, fuelScored } = active

    // ---------------------------------------------------------------------------
    // Write helpers — every mutation goes through here so the active shot is
    // always up-to-date in the array (auto-save).
    // ---------------------------------------------------------------------------
    function patchActive(patch: Partial<Actions>) {
        setActions(prev => {
            const copy = [...prev]
            copy[activeIndex] = { ...copy[activeIndex], ...patch }
            return copy
        })
    }

    // ---------------------------------------------------------------------------
    // Fuel stacks — we keep them as derived helpers that push/pop into the
    // integer totals stored on the shot directly.  The "stack" UX (undo pops
    // the last increment) is preserved by keeping a local ephemeral stack that
    // only tracks the *session* increments on top of whatever was already there
    // when the user tapped into this shot.  On activeIndex change we reset it.
    // ---------------------------------------------------------------------------
    const [fuelMovedBase, setFuelMovedBase] = useState(0)
    const [fuelMovedStack, setFuelMovedStack] = useState<number[]>([])
    const [fuelScoredBase, setFuelScoredBase] = useState(0)
    const [fuelScoredStack, setFuelScoredStack] = useState<number[]>([])

    // Sync base + stack → action whenever stacks change
    useEffect(() => {
        patchActive({ fuelMoved: fuelMovedBase + fuelMovedStack.reduce((a, b) => a + b, 0) })
    }, [fuelMovedStack])

    useEffect(() => {
        patchActive({ fuelScored: fuelScoredBase + fuelScoredStack.reduce((a, b) => a + b, 0) })
    }, [fuelScoredStack])

    // When user taps a different action in history, reset stacks AND sync the
    // phase tab to match the action's stored type.
    useEffect(() => {
        const s = actions[activeIndex]
        if (!s) return
        setFuelMovedBase(s.fuelMoved)
        setFuelMovedStack([])
        setFuelScoredBase(s.fuelScored)
        setFuelScoredStack([])
        // Capitalise first letter to match the union type ("starting" → "Starting")
        const capitalised = (s.type.charAt(0).toUpperCase() + s.type.slice(1)) as "Starting" | "Intake" | "Shooting"
        skipStampRef.current = true  // don't let the stamp effect overwrite this action's type
        setInputState(capitalised)
    }, [activeIndex])

    // ---------------------------------------------------------------------------
    // Scoring toggle state (per-shot, but also ephemeral UX state)
    // ---------------------------------------------------------------------------
    const [scoring, setScoring] = useState(true)
    const [scoringManual, setScoringManual] = useState(false)

    // ---------------------------------------------------------------------------
    // Field drag
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
        patchActive({ x1: p.x, y1: p.y, x2: p.x, y2: p.y })
        setDragging(true)
    }

    function handlePointerMove(e: React.PointerEvent) {
        if (!dragging) return
        const p = getFieldPos(e)
        patchActive({ x2: p.x, y2: p.y })
    }

    function handlePointerUp(e: React.PointerEvent) {
        if (!dragging) return
        const p = getFieldPos(e)
        patchActive({ x2: p.x, y2: p.y })
        setDragging(false)
    }

    // ---------------------------------------------------------------------------
    // "Save" = commit current + append a fresh shot, move active to it
    // ---------------------------------------------------------------------------
    function handleSave() {
        const fresh: Actions = { type: inputState.toLowerCase(), x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5, fuelMoved: 0, fuelScored: 0 }
        setActions(prev => [...prev, fresh])
        setActiveIndex(actions.length) // new last index after push
    }

    // ---------------------------------------------------------------------------
    // "Delete" = remove active shot, land on previous (or fresh if empty)
    // ---------------------------------------------------------------------------
    function handleDelete() {
        setActions(prev => {
            const next = prev.filter((_, i) => i !== activeIndex)
            if (next.length === 0) {
                setActiveIndex(0)
                return [{ type: "starting", x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5, fuelMoved: 0, fuelScored: 0 }]
            }
            setActiveIndex(Math.min(activeIndex, next.length - 1))
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
    // Sync to parent data
    // ---------------------------------------------------------------------------
    useEffect(() => {
        setData(d => ({
            ...d,
            auto: {
                ...d.auto,
                shootLocation: actions.map(s => ({
                    type: s.type,
                    x1: flip ? 1 - s.x1 : s.x1,
                    y1: flip ? 1 - s.y1 : s.y1,
                    x2: flip ? 1 - s.x2 : s.x2,
                    y2: flip ? 1 - s.y2 : s.y2,
                    fuelMoved: s.fuelMoved,
                    fuelScored: s.fuelScored,
                })),
            },
        }))
    }, [actions])

    // ---------------------------------------------------------------------------
    // View helpers
    // ---------------------------------------------------------------------------
    const viewX = (v: number) => (flip ? 1 - v : v)
    const viewY = (v: number) => (flip ? 1 - v : v)

    const angle =
        Math.atan2(viewY(y2) - viewY(y1), (viewX(x2) - viewX(x1)) * 2) * (180 / Math.PI)

    // ---------------------------------------------------------------------------
    // Input-phase tabs — also writes `type` onto the active action so switching
    // phase mid-edit stamps the current action correctly.
    // ---------------------------------------------------------------------------
    const [inputState, setInputState] = useState<"Starting" | "Shooting" | "Intake">("Starting")
    // When the activeIndex effect syncs inputState from a tapped history card,
    // we don't want the stamp effect to then overwrite that card's type back.
    // This ref gates that: set true before the programmatic setInputState, cleared
    // by the stamp effect after it skips one round.
    const skipStampRef = useRef(false)

    // Whenever inputState changes AND it was a real user tap (not a history sync),
    // stamp the active action's type.
    useEffect(() => {
        if (skipStampRef.current) {
            skipStampRef.current = false
            return
        }
        patchActive({ type: inputState.toLowerCase() })
    }, [inputState])

    // Per-phase visibility flags
    const isFiredDisabled  = inputState === "Starting"  // Starting has no fuel at all
    const isScoredDisabled = inputState === "Starting" || inputState === "Intake"  // only Shooting scores

    // Per-tab enabled rules: Starting must be first and can only appear once,
    // Intake/Shooting are not available until after Starting.
    const isTabDisabled = (phase: "Starting" | "Intake" | "Shooting") => {
        if (phase === "Starting") return activeIndex !== 0  // only allowed on the very first action
        return activeIndex === 0                            // Intake/Shooting blocked on the first action
    }

    // Climb (unchanged)
    const [climb, setClimb] = useState(false)
    const [climbSpeed, setClimbSpeed] = useState(0)

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------
    return (
        <div className="w-screen h-max flex flex-col p-2 select-none gap-4 text-sm">
            {/* Phase tabs */}
            <div className="flex items-center gap-2">
                {(["Starting", "Intake", "Shooting"] as const).map(phase => {
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

            {/* ----------------------------------------------------------------
                Field
            ---------------------------------------------------------------- */}
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

                {/* SVG overlay — shared across all phases, only the relevant
                    elements are conditionally rendered inside */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    <defs>
                        {/* Arrow marker for Starting orientation */}
                        <marker id="arrow-start" markerWidth="5" markerHeight="5" viewBox="0 0 10 10" refX="4" refY="5" orient="auto">
                            <path d="M0,0 L10,5 L0,10 Z" fill="#d4d4d8" />
                        </marker>
                    </defs>

                    {/* Starting: fixed-length arrow in the direction of (x2,y2) */}
                    {inputState === "Starting" && (() => {
                        const dx = viewX(x2) - viewX(x1)
                        const dy = viewY(y2) - viewY(y1)
                        // Normalize in visually-compensated space (X is 2× wider than tall)
                        // so the unit vector accounts for the aspect ratio.
                        const dist = Math.sqrt((dx * 2) ** 2 + dy ** 2) || 1
                        const ux = (dx * 2) / dist  // compensated unit X
                        const uy = dy / dist         // unit Y
                        // Fixed visual length in % of field height.
                        // Apply ux/uy raw — ux is already half-weight from the *2 above,
                        // so the result is uniform visual length at any angle.
                        const LEN = 12
                        const tipX = viewX(x1) * 100 + ux * LEN * 0.5
                        const tipY = viewY(y1) * 100 + uy * LEN
                        return (
                            <line
                                x1={`${viewX(x1) * 100}%`} y1={`${viewY(y1) * 100}%`}
                                x2={`${tipX}%`}            y2={`${tipY}%`}
                                stroke="#d4d4d8" strokeWidth="3" markerEnd="url(#arrow-start)"
                            />
                        )
                    })()}

                    {/* Intake: black line connecting the two robot positions */}
                    {inputState === "Intake" && (
                        <line
                            x1={`${viewX(x1) * 100}%`} y1={`${viewY(y1) * 100}%`}
                            x2={`${viewX(x2) * 100}%`} y2={`${viewY(y2) * 100}%`}
                            stroke="#000" strokeWidth="3" strokeLinecap="round"
                        />
                    )}
                </svg>

                {/* Starting: robot square at (x1,y1), rotated by heading */}
                {inputState === "Starting" && (
                    <div
                        className="absolute"
                        style={{
                            width: "3.75%",
                            height: "7.5%",
                            left: `${viewX(x1) * 100}%`,
                            top: `${viewY(y1) * 100}%`,
                            transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                        }}
                    >
                        <div className="absolute inset-0 bg-zinc-600/50 border-2 rounded-xs border-zinc-800" />
                    </div>
                )}

                {/* Intake: robot square at start */}
                {inputState === "Intake" && (
                    <div
                        className="absolute"
                        style={{
                            width: "3.75%",
                            height: "7.5%",
                            left: `${viewX(x1) * 100}%`,
                            top: `${viewY(y1) * 100}%`,
                            transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                        }}
                    >
                        <div className="absolute inset-0 bg-zinc-600/50 border-2 rounded-xs border-zinc-800" />
                    </div>
                )}

                {/* Intake: robot square at end */}
                {inputState === "Intake" && (
                    <div
                        className="absolute"
                        style={{
                            width: "3.75%",
                            height: "7.5%",
                            left: `${viewX(x2) * 100}%`,
                            top: `${viewY(y2) * 100}%`,
                            transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                        }}
                    >
                        <div className="absolute inset-0 bg-zinc-600/50 border-2 rounded-xs border-zinc-800" />
                    </div>
                )}

                {/* Shooting: robot square at start */}
                {inputState === "Shooting" && (
                    <div
                        className="absolute"
                        style={{
                            width: "3.75%",
                            height: "7.5%",
                            left: `${viewX(x1) * 100}%`,
                            top: `${viewY(y1) * 100}%`,
                            transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                        }}
                    >
                        <div className="absolute inset-0 bg-zinc-600/50 border-2 rounded-xs border-zinc-800" />
                    </div>
                )}

                {/* Shooting: ball trail from robot to shot location */}
                {inputState === "Shooting" && (() => {
                    const dx = viewX(x2) - viewX(x1)
                    const dy = viewY(y2) - viewY(y1)
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
                                    left: `${(viewX(x1) + dx * t) * 100}%`,
                                    top: `${(viewY(y1) + dy * t) * 100}%`,
                                    transform: "translate(-50%, -50%)",
                                }}
                            />
                        )
                    }
                    return balls
                })()}
            </div>

            {/* ----------------------------------------------------------------
                Fired section  (grayed out when Starting)
            ---------------------------------------------------------------- */}
            <div className={`transition-opacity duration-150 ${isFiredDisabled ? "opacity-30 pointer-events-none" : ""}`}>
                <div className="grid grid-cols-4 gap-3">
                    {[1, 2, 5, 10].map(v => (
                        <PulseButton
                            key={v}
                            label={`+${v}`}
                            activeColor="bg-green-700"
                            onClick={() => setFuelMovedStack(s => [...s, v])}
                        />
                    ))}
                    <div className="grid grid-cols-2 gap-2 col-span-4">
                        <PulseButton
                            label="UNDO"
                            activeColor="bg-red-800"
                            onClick={() => {
                                if (fuelMovedStack.length > 0) {
                                    setFuelMovedStack(s => s.slice(0, -1))
                                } else if (fuelMovedBase > 0) {
                                    setFuelMovedBase(0)
                                    patchActive({ fuelMoved: 0 })
                                }
                            }}
                        />
                        <p className="text-center text-sm font-bold py-2">Moved: {fuelMoved}</p>
                    </div>
                </div>
            </div>

            {/* ----------------------------------------------------------------
                Scoring toggle + Scored section  (grayed out for Starting & Intake)
            ---------------------------------------------------------------- */}
            <div className={`flex flex-col gap-4 transition-opacity duration-150 ${isScoredDisabled ? "opacity-30 pointer-events-none" : ""}`}>
                {/* Scoring toggle */}
                <button
                    onClick={() => {
                        setScoring(prev => !prev)
                        setScoringManual(true)
                    }}
                    className={`text-white text-sm py-2 rounded-xl transition-colors ${
                        scoring ? "bg-green-800" : "bg-red-800"
                    }`}
                >
                    Scoring?
                </button>

                {/* Scored section */}
                <div className="grid grid-cols-4 gap-3">
                    {[1, 2, 5, 10].map(v => (
                        <PulseButton
                            key={v}
                            label={`+${v}`}
                            activeColor="bg-green-700"
                            onClick={() => {
                                setScoringManual(true)
                                setScoring(scoringManual ? scoring : true)
                                setFuelScoredStack(s => [...s, v])
                            }}
                        />
                    ))}
                    <div className="grid grid-cols-2 gap-2 col-span-4">
                        <PulseButton
                            label="UNDO"
                            activeColor="bg-red-800"
                            onClick={() => {
                                if (fuelScoredStack.length > 0) {
                                    setFuelScoredStack(s => s.slice(0, -1))
                                } else if (fuelScoredBase > 0) {
                                    setFuelScoredBase(0)
                                    patchActive({ fuelScored: 0 })
                                }
                            }}
                        />
                        <p className="text-center text-sm font-bold py-2">Scored: {fuelScored}</p>
                    </div>
                </div>
            </div>

            {/* ----------------------------------------------------------------
                Delete / Save buttons
            ---------------------------------------------------------------- */}
            <div className="grid grid-cols-2 gap-2">
                <button
                    onClick={handleDelete}
                    className="bg-red-800 text-white text-sm py-2 rounded-xl"
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

            {/* ----------------------------------------------------------------
                Horizontal history strip  (snap-scroll, pinned +New)
            ---------------------------------------------------------------- */}
            <div className="flex items-end gap-2">
                {/* Scrollable card area */}
                <div
                    ref={stripRef}
                    className="flex-1 flex gap-2 overflow-x-auto pb-1"
                    style={{
                        scrollSnapType: "x mandatory",
                        WebkitOverflowScrolling: "touch",
                        scrollbarWidth: "none",          // Firefox
                        msOverflowStyle: "none",         // IE/Edge
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
                                    flex-shrink-0 w-24 rounded-lg overflow-hidden border-2 transition-colors duration-150
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
                                    ) : action.type === "intake" ? (
                                        <span className="text-yellow-300">🔥 {action.fuelMoved}</span>
                                    ) : (
                                        <>
                                            <span className="text-yellow-300">🔥 {action.fuelMoved}</span>
                                            <span className="text-green-300">✓ {action.fuelScored}</span>
                                        </>
                                    )}
                                </div>
                            </button>
                        )
                    })}
                </div>

                {/* Pinned "+ New" button (does the same thing as Save) */}
                <button
                    onClick={handleSave}
                    className="flex-shrink-0 w-10 h-14 rounded-lg bg-zinc-700 border-2 border-dashed border-zinc-500 flex items-center justify-center text-zinc-400 text-lg font-bold"
                >
                    +
                </button>
            </div>

            {/* ----------------------------------------------------------------
                Climb
            ---------------------------------------------------------------- */}
            <button
                onClick={() => setClimb(prev => !prev)}
                className={`text-white text-sm py-2 rounded-xl transition-colors ${
                    climb ? "bg-green-800" : "bg-red-800"
                }`}
            >
                L1
            </button>
            <RatingSlider
                value={climbSpeed}
                onChange={v => setClimbSpeed(v)}
                title={`Climb Time: ${(climbSpeed * 10).toFixed(1)}s`}
                leftLabel="0s"
                rightLabel="10s+"
                step={0.01}
                invertColor={true}
            />
        </div>
    )
}