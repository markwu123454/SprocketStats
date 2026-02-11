import React, {useEffect, useRef, useState, useCallback} from "react"
import {getSettingSync} from "@/db/settingsDb"

// ---------------------------------------------------------------------------
// Decoupled Types
// ---------------------------------------------------------------------------
export type Alliance = "red" | "blue"

export interface StartingAction {
    type: "starting"
    x: number
    y: number
}

export interface ZoneAction {
    type: "zone_change"
    zone: string
    timestamp: number
    phase: MatchPhase
    subPhase: SubPhaseName | null
}

export interface ScoreAction {
    type: "score"
    x: number
    y: number
    score: number
    timestamp: number
    phase: MatchPhase
    subPhase: SubPhaseName | null
}

export interface ClimbAction {
    type: "climb"
    timestamp: number
    level: "L1" | "L2" | "L3"
    success: boolean
    phase: MatchPhase
    subPhase: SubPhaseName | null
}

export type MatchAction = StartingAction | ZoneAction | ScoreAction | ClimbAction

export interface MatchScoutingState {
    alliance: Alliance
    teamNumber: string
    matchNumber: string
    startPosition: { x: number; y: number } | null
    actions: MatchAction[]
}

type MatchPhase = "prestart" | "auto" | "between" | "teleop" | "post"

type SubPhaseName =
    | "auto"
    | "transition"
    | "shift_1"
    | "shift_2"
    | "shift_3"
    | "shift_4"
    | "endgame"

interface SubPhaseConfig {
    phase: SubPhaseName
    duration: number
}

// ---------------------------------------------------------------------------
// Sub-phase sequence for teleop
// ---------------------------------------------------------------------------
const TELEOP_SEQUENCE: SubPhaseConfig[] = [
    {phase: "transition", duration: 10000},
    {phase: "shift_1", duration: 25000},
    {phase: "shift_2", duration: 2500000},
    {phase: "shift_3", duration: 25000},
    {phase: "shift_4", duration: 25000},
    {phase: "endgame", duration: 30000},
]

// ---------------------------------------------------------------------------
// Zone definitions (normalized 0..1 coordinates)
// ---------------------------------------------------------------------------
type Rect = { x1: number; y1: number; x2: number; y2: number }

const ZONES = {
    neutral: {x1: 0.322, y1: 0.020, x2: 0.674, y2: 0.978},
    transitionLeft: {x1: 0.247, y1: 0.020, x2: 0.323, y2: 0.978},
    transitionRight: {x1: 0.673, y1: 0.020, x2: 0.756, y2: 0.978},
    shootingFull: {x1: 0.013, y1: 0.020, x2: 0.246, y2: 0.978},
} as const

// Flip a rect both axes (180° rotation around center)
function flipRect(r: Rect): Rect {
    return {x1: 1 - r.x2, y1: 1 - r.y2, x2: 1 - r.x1, y2: 1 - r.y1}
}


// ---------------------------------------------------------------------------
// Field button zones — padded 2×2 grid of visually square buttons
// Field is 2:1 aspect, so width = size/2 in normalized coords for squares.
// ---------------------------------------------------------------------------
const _FB_PAD   = 0.025  // outer padding from region edges
const _FB_GAP   = 0.015  // gap between buttons (normalized)
const _FB_REGION = { x1: 0.498, y1: 0.020, x2: 0.987, y2: 0.978 }
// Available inner space
const _FB_INNER_W = (_FB_REGION.x2 - _FB_REGION.x1) - _FB_PAD * 2
const _FB_INNER_H = (_FB_REGION.y2 - _FB_REGION.y1) - _FB_PAD * 2
// Each button size: use the smaller dimension so they fit as squares
// Visual square: btnH (norm) = btnW (norm) * 2 (because field is 2:1)
// Two buttons + gap in each direction:
// Horizontal: 2 * btnW + gap = innerW → btnW = (innerW - gap) / 2
// Vertical:   2 * btnH + gap = innerH → btnH = (innerH - gap) / 2
// For visual square: btnH = btnW * 2
// Pick the limiting axis:
const _FB_BTN_W_from_x = (_FB_INNER_W - _FB_GAP) / 2
const _FB_BTN_H_from_x = _FB_BTN_W_from_x * 2
const _FB_BTN_H_from_y = (_FB_INNER_H - _FB_GAP) / 2
const _FB_BTN_W_from_y = _FB_BTN_H_from_y / 2
// Use whichever fits
const _FB_BTN_W = Math.min(_FB_BTN_W_from_x, _FB_BTN_W_from_y)
const _FB_BTN_H = _FB_BTN_W * 2
// Center the grid in the region
const _FB_GRID_W = _FB_BTN_W * 2 + _FB_GAP
const _FB_GRID_H = _FB_BTN_H * 2 + _FB_GAP
const _FB_OX = _FB_REGION.x1 + (_FB_REGION.x2 - _FB_REGION.x1 - _FB_GRID_W) / 2
const _FB_OY = _FB_REGION.y1 + (_FB_REGION.y2 - _FB_REGION.y1 - _FB_GRID_H) / 2

const FIELD_BUTTONS = {
    defense:     { x1: _FB_OX,                       y1: _FB_OY,                       x2: _FB_OX + _FB_BTN_W,               y2: _FB_OY + _FB_BTN_H               } as Rect,
    transversal: { x1: _FB_OX + _FB_BTN_W + _FB_GAP, y1: _FB_OY,                       x2: _FB_OX + _FB_BTN_W * 2 + _FB_GAP, y2: _FB_OY + _FB_BTN_H               } as Rect,
    climb:       { x1: _FB_OX,                       y1: _FB_OY + _FB_BTN_H + _FB_GAP, x2: _FB_OX + _FB_BTN_W,               y2: _FB_OY + _FB_BTN_H * 2 + _FB_GAP } as Rect,
    intake:      { x1: _FB_OX + _FB_BTN_W + _FB_GAP, y1: _FB_OY + _FB_BTN_H + _FB_GAP, x2: _FB_OX + _FB_BTN_W * 2 + _FB_GAP, y2: _FB_OY + _FB_BTN_H * 2 + _FB_GAP } as Rect,
} as const

// ---------------------------------------------------------------------------
// Phase duration helper
// ---------------------------------------------------------------------------
function getPhaseDuration(phase: MatchPhase): number {
    if (phase === "auto") return 20000
    if (phase === "between") return 5000
    if (phase === "teleop") return TELEOP_SEQUENCE.reduce((s, c) => s + c.duration, 0)
    return 0
}

// ---------------------------------------------------------------------------
// Header Strip
// ---------------------------------------------------------------------------
function HeaderStrip({
                         phase,
                         subPhase,
                         subPhaseElapsed,
                         subPhaseTotal,
                         phaseRemaining,
                         flashing,
                     }: {
    phase: MatchPhase
    subPhase: SubPhaseConfig | null
    subPhaseElapsed: number
    subPhaseTotal: number
    phaseRemaining: number
    flashing: boolean
}) {
    const getPhaseColor = () => {
        if (phase === "prestart") return "bg-zinc-700"
        if (phase === "auto") return "bg-blue-700"
        if (phase === "between") return "bg-yellow-700 animate-pulse"
        if (phase === "teleop") {
            if (subPhase?.phase === "endgame") return "bg-red-700"
            return "bg-green-700"
        }
        if (phase === "post") return "bg-zinc-700"
        return "bg-zinc-800"
    }

    const getPhaseLabel = () => {
        if (phase === "prestart") return "PRE-MATCH"
        if (phase === "auto") return "AUTONOMOUS"
        if (phase === "between") return "TRANSITION"
        if (phase === "teleop") {
            if (!subPhase) return "TELEOP"
            const labels: Record<SubPhaseName, string> = {
                auto: "AUTO",
                transition: "TELEOP — TRANSITION",
                shift_1: "TELEOP — SHIFT 1",
                shift_2: "TELEOP — SHIFT 2",
                shift_3: "TELEOP — SHIFT 3",
                shift_4: "TELEOP — SHIFT 4",
                endgame: "TELEOP — ENDGAME",
            }
            return labels[subPhase.phase] ?? "TELEOP"
        }
        if (phase === "post") return "POST-MATCH"
        return ""
    }

    const fmt = (ms: number) => {
        const s = Math.floor(ms / 1000)
        const t = Math.floor((ms % 1000) / 100)
        return `${s}.${t}s`
    }

    return (
        <div
            className={`w-full p-3 transition-colors duration-300 ${getPhaseColor()}`}
            style={{
                transition: "filter 0.15s ease-out, background-color 0.3s",
                filter: flashing ? "brightness(1.6)" : "brightness(1)",
            }}
        >
            <div className="flex justify-between items-center">
                <span className="text-white font-bold text-lg">{getPhaseLabel()}</span>
                {phase !== "prestart" && phase !== "post" && (
                    <div className="flex gap-4 items-center">
                        <span className="text-white font-mono text-base">
                            {fmt(subPhaseElapsed)} / {fmt(subPhaseTotal)}
                        </span>
                        <span className="text-white font-mono text-xl font-bold">
                            {fmt(phaseRemaining)}
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function MatchScouting({
                                          data,
                                          setData,
                                      }: {
    data: MatchScoutingState
    setData: React.Dispatch<React.SetStateAction<MatchScoutingState>>
}) {
    const deviceType = getSettingSync("match_scouting_device_type") ?? "mobile"
    const fieldRef = useRef<HTMLDivElement>(null)

    // Phase & timing
    const [matchPhase, setMatchPhase] = useState<MatchPhase>("prestart")
    const [subPhase, setSubPhase] = useState<SubPhaseConfig | null>(null)
    const [subPhaseStartTime, setSubPhaseStartTime] = useState(0)
    const [phaseStartTime, setPhaseStartTime] = useState(0)
    const [matchStartTime, setMatchStartTime] = useState(0)
    const [, forceUpdate] = useState(0)

    // Flash state
    const [flashing, setFlashing] = useState(false)
    const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Actions
    const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(data.startPosition)
    const [actions, setActions] = useState<MatchAction[]>(data.actions)
    const [currentZone, setCurrentZone] = useState<string | null>(null)

    // Score slider
    const [shot, setShot] = useState(0)
    const sliderRef = useRef<HTMLDivElement>(null)
    const [sliderActive, setSliderActive] = useState(false)
    const [sliderY, setSliderY] = useState(0.5) // 0=top(max add), 1=bottom(max subtract), 0.5=neutral
    const sliderYRef = useRef(0.5)             // ref mirror so rAF loop reads live value
    const shotRafRaf = useRef<number | null>(null)

    // Field interaction
    const [dragging, setDragging] = useState(false)

    // Shooting zone click — robot rectangle + yellow dot trail to reef hexagon
    const [shootClickPos, setShootClickPos] = useState<{ x: number; y: number } | null>(null)
    const [draggingShootRobot, setDraggingShootRobot] = useState(false)

    // Shot lifecycle: each click on → off the shooting zone = one "shot"
    const [shotPendingReset, setShotPendingReset] = useState(false)
    const [shotEditHint, setShotEditHint] = useState(false)

    // Reef hexagon center in normalized field coords (blue-side / unflipped)
    const REEF_CENTER = { x: 0.285, y: 0.500 }

    // Flip is ONLY based on the setting, NOT alliance
    const flip = getSettingSync("field_orientation") === "180"

    // ---------------------------------------------------------------------------
    // Flash trigger
    // ---------------------------------------------------------------------------
    const triggerFlash = useCallback(() => {
        if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
        setFlashing(true)
        flashTimeoutRef.current = setTimeout(() => setFlashing(false), 350)
    }, [])

    useEffect(() => {
        return () => {
            if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
        }
    }, [])

    // ---------------------------------------------------------------------------
    // Logarithmic ms/point curve
    // magnitude 0 → MAX_MS (slow), magnitude 1 → MIN_MS (fast)
    // Uses exponential interpolation so the *perceived* speed change is even.
    // ---------------------------------------------------------------------------
    const SLIDER_MAX_MS = 300
    const SLIDER_MIN_MS = 30
    const SLIDER_DEAD_ZONE = 0.05

    const msFromMagnitude = (magnitude: number): number => {
        // Clamp just in case
        const m = Math.min(1, Math.max(0, magnitude))
        // Exponential: MIN * (MAX/MIN)^(1-m)
        // At m=0 → MAX_MS, at m=1 → MIN_MS, logarithmic curve in between
        return SLIDER_MIN_MS * Math.pow(SLIDER_MAX_MS / SLIDER_MIN_MS, 1 - m)
    }

    // ---------------------------------------------------------------------------
    // Score slider — rAF accumulator loop
    // Reads sliderYRef every frame so dragging never interrupts scoring.
    // ---------------------------------------------------------------------------
    useEffect(() => {
        if (!sliderActive) {
            if (shotRafRaf.current) {
                cancelAnimationFrame(shotRafRaf.current)
                shotRafRaf.current = null
            }
            console.log("[ScoreSlider] Slider released, loop stopped. Current score via state.")
            return
        }

        const DEAD_ZONE = SLIDER_DEAD_ZONE
        let accumulator = 0
        let lastTime = performance.now()

        const loop = (now: number) => {
            const dt = now - lastTime
            lastTime = now

            const y = sliderYRef.current
            const displacement = y - 0.5

            if (Math.abs(displacement) > DEAD_ZONE) {
                const direction = displacement < 0 ? 1 : -1
                const magnitude = (Math.abs(displacement) - DEAD_ZONE) / (0.5 - DEAD_ZONE)
                const msPerPoint = msFromMagnitude(magnitude)

                accumulator += dt

                // Drain as many whole ticks as accumulated
                let ticks = 0
                while (accumulator >= msPerPoint) {
                    accumulator -= msPerPoint
                    ticks += direction
                }

                if (ticks !== 0) {
                    setShot((prev) => {
                        const next = prev + ticks
                        console.log(
                            `[ScoreSlider] Tick | ${ticks > 0 ? "+" : ""}${ticks} → score: ${next} ` +
                            `(msPerPoint: ${msPerPoint.toFixed(0)}ms, y: ${y.toFixed(3)})`
                        )
                        return next
                    })
                }
            } else {
                // In dead zone — reset accumulator so we don't burst when leaving it
                accumulator = 0
            }

            shotRafRaf.current = requestAnimationFrame(loop)
        }

        console.log("[ScoreSlider] Loop started")
        shotRafRaf.current = requestAnimationFrame(loop)

        return () => {
            if (shotRafRaf.current) {
                cancelAnimationFrame(shotRafRaf.current)
                shotRafRaf.current = null
            }
        }
    }, [sliderActive])

    // ---------------------------------------------------------------------------
    // Field pointer handlers
    // ---------------------------------------------------------------------------
    function getFieldPos(e: React.PointerEvent) {
        if (!fieldRef.current) return {x: 0, y: 0}
        const rect = fieldRef.current.getBoundingClientRect()
        let x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
        let y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
        // Convert screen coords back to un-flipped normalized coords
        if (flip) {
            x = 1 - x
            y = 1 - y
        }
        return {x, y}
    }

    function handlePointerDown(e: React.PointerEvent) {
        if (matchPhase === "prestart") {
            setStartPos(getFieldPos(e))
            setDragging(true)
            return
        }
        // During auto/teleop, clicking anywhere in the shooting zone snaps the robot there
        if (matchPhase === "auto" || matchPhase === "teleop") {
            const pos = getFieldPos(e)
            const zone = ZONES.shootingFull
            if (pos.x >= zone.x1 && pos.x <= zone.x2 && pos.y >= zone.y1 && pos.y <= zone.y2) {
                // If returning to shooting zone after visiting another zone, reset shot for new cycle
                if (shotPendingReset) {
                    setShot(0)
                    setShotPendingReset(false)
                    setShotEditHint(false)
                }
                setShootClickPos({ x: pos.x, y: pos.y })
                handleZoneClick("shooting")
                setDraggingShootRobot(true)
                ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
                return
            }
        }
    }

    function handlePointerMove(e: React.PointerEvent) {
        if (dragging && matchPhase === "prestart") {
            setStartPos(getFieldPos(e))
            return
        }
        if (draggingShootRobot) {
            const pos = getFieldPos(e)
            // Clamp to shooting zone bounds
            const zone = ZONES.shootingFull
            const clampedX = Math.min(zone.x2, Math.max(zone.x1, pos.x))
            const clampedY = Math.min(zone.y2, Math.max(zone.y1, pos.y))
            setShootClickPos({x: clampedX, y: clampedY})
        }
    }

    function handlePointerUp() {
        setDragging(false)
        setDraggingShootRobot(false)
    }

    // ---------------------------------------------------------------------------
    // Zone click handler
    // ---------------------------------------------------------------------------
    const handleZoneClick = useCallback(
        (zoneName: string) => {
            setCurrentZone(zoneName)
            const now = Date.now()
            setActions((prev) => [
                ...prev,
                {
                    type: "zone_change",
                    zone: zoneName,
                    timestamp: matchStartTime > 0 ? now - matchStartTime : 0,
                    phase: matchPhase,
                    subPhase: subPhase?.phase ?? null,
                },
            ])
        },
        [matchStartTime, matchPhase, subPhase],
    )

    // ---------------------------------------------------------------------------
    // Smooth timer (60 fps)
    // ---------------------------------------------------------------------------
    useEffect(() => {
        if (matchPhase === "prestart" || matchPhase === "post") return
        const id = setInterval(() => forceUpdate((n) => n + 1), 1000 / 60)
        return () => clearInterval(id)
    }, [matchPhase])

    // ---------------------------------------------------------------------------
    // Phase transition logic
    // ---------------------------------------------------------------------------
    useEffect(() => {
        if (matchPhase === "prestart" || matchPhase === "post") return

        const id = setInterval(() => {
            const now = Date.now()
            const elapsed = now - subPhaseStartTime

            if (matchPhase === "auto" && elapsed >= 20000) {
                setMatchPhase("between")
                setPhaseStartTime(now)
                setSubPhaseStartTime(now)
                setSubPhase(null)
                triggerFlash()
                return
            }

            if (matchPhase === "between" && elapsed >= 5000) {
                setMatchPhase("teleop")
                setPhaseStartTime(now)
                setSubPhaseStartTime(now)
                setSubPhase(TELEOP_SEQUENCE[0])
                triggerFlash()
                return
            }

            if (matchPhase === "teleop" && subPhase && elapsed >= subPhase.duration) {
                const idx = TELEOP_SEQUENCE.findIndex((s) => s.phase === subPhase.phase)
                if (idx >= 0 && idx < TELEOP_SEQUENCE.length - 1) {
                    setSubPhase(TELEOP_SEQUENCE[idx + 1])
                    setSubPhaseStartTime(now)
                    triggerFlash()
                } else {
                    setMatchPhase("post")
                    setSubPhase(null)
                    triggerFlash()
                }
            }
        }, 100)

        return () => clearInterval(id)
    }, [matchPhase, subPhase, subPhaseStartTime, triggerFlash])

    // ---------------------------------------------------------------------------
    // Start match
    // ---------------------------------------------------------------------------
    const handleStartMatch = () => {
        const now = Date.now()
        setMatchStartTime(now)
        setPhaseStartTime(now)
        setSubPhaseStartTime(now)
        setMatchPhase("auto")
        setSubPhase({phase: "auto", duration: 20000})
        if (startPos) {
            setActions([{type: "starting", x: startPos.x, y: startPos.y}])
        }
    }

    // ---------------------------------------------------------------------------
    // Sync to parent
    // ---------------------------------------------------------------------------
    useEffect(() => {
        setData((d) => ({...d, startPosition: startPos, actions}))
    }, [startPos, actions, setData])

    // ---------------------------------------------------------------------------
    // Keep the last ScoreAction in sync when shot is edited during hint period
    // ---------------------------------------------------------------------------
    useEffect(() => {
        if (!shotEditHint) return
        setActions((prev) => {
            const lastScoreIdx = prev.findLastIndex((a) => a.type === "score")
            if (lastScoreIdx === -1) return prev
            const updated = [...prev]
            const action = updated[lastScoreIdx] as ScoreAction
            if (action.score === shot) return prev
            updated[lastScoreIdx] = { ...action, score: shot }
            return updated
        })
    }, [shot, shotEditHint])

    // ---------------------------------------------------------------------------
    // Timer calculations
    // ---------------------------------------------------------------------------
    const now = Date.now()
    const subPhaseElapsed = subPhaseStartTime > 0 ? now - subPhaseStartTime : 0
    const subPhaseTotal = subPhase?.duration ?? (matchPhase === "between" ? 5000 : 0)
    const phaseElapsed = phaseStartTime > 0 ? now - phaseStartTime : 0
    const phaseDuration = getPhaseDuration(matchPhase)
    const phaseRemaining = Math.max(0, phaseDuration - phaseElapsed)

    // View helpers — convert normalized coords to screen coords for the start dot
    const viewX = (v: number) => (flip ? 1 - v : v)
    const viewY = (v: number) => (flip ? 1 - v : v)

    const showZones = matchPhase === "auto" || matchPhase === "teleop"

    // ---------------------------------------------------------------------------
    // Render: Field
    // ---------------------------------------------------------------------------
    const renderField = () => (
        <div
            ref={fieldRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => { setDragging(false); setDraggingShootRobot(false) }}
            className="relative w-full aspect-2/1 rounded-xl overflow-hidden touch-none"
            // Container is NEVER rotated — only the image and zone positions flip
        >
            {/* Field image flips via CSS when setting says 180 */}
            <img
                src="/seasons/2026/field-lovat.png"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                alt="field"
                style={{transform: flip ? "rotate(180deg)" : "none"}}
            />

            {/* Zone overlays — positions computed with flip, text always upright */}
            {showZones && (
                <>
                    {/* Shooting zone — green-bordered rectangle, captures click position */}
                    {(() => {
                        const zone = ZONES.shootingFull
                        const displayed = flip ? flipRect(zone) : zone
                        const left = displayed.x1
                        const top = displayed.y1
                        const width = displayed.x2 - displayed.x1
                        const height = displayed.y2 - displayed.y1
                        const isActive = currentZone === "shooting"
                        return (
                            <button
                                onClick={(e) => {
                                    // If returning to shooting zone after visiting another zone, reset shot for new cycle
                                    if (shotPendingReset) {
                                        setShot(0)
                                        setShotPendingReset(false)
                                        setShotEditHint(false)
                                    }
                                    handleZoneClick("shooting")
                                    if (!fieldRef.current) return
                                    const rect = fieldRef.current.getBoundingClientRect()
                                    let nx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
                                    let ny = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
                                    if (flip) { nx = 1 - nx; ny = 1 - ny }
                                    setShootClickPos({ x: nx, y: ny })
                                }}
                                className="absolute rounded transition-all duration-200"
                                style={{
                                    left: `${left * 100}%`,
                                    top: `${top * 100}%`,
                                    width: `${width * 100}%`,
                                    height: `${height * 100}%`,
                                    border: "2px solid rgb(34 197 94)",
                                    background: isActive ? "rgba(34, 197, 94, 0.15)" : "transparent",
                                }}
                            />
                        )
                    })()}

                    {/* 4 Field Buttons — card-style with icons */}
                    {(
                        [
                            {
                                key: "transversal",
                                rect: FIELD_BUTTONS.transversal,
                                label: "Transversal",
                                borderColor: "#a855f7",
                                bgActive: "rgba(168, 85, 247, 0.25)",
                                bgIdle: "rgba(39, 39, 42, 0.85)",
                                icon: (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M5 12h14" /><path d="M12 5l7 7-7 7" />
                                    </svg>
                                ),
                            },
                            {
                                key: "intake",
                                rect: FIELD_BUTTONS.intake,
                                label: "Intake",
                                borderColor: "#38bdf8",
                                bgActive: "rgba(56, 189, 248, 0.25)",
                                bgIdle: "rgba(39, 39, 42, 0.85)",
                                icon: (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 2v20" /><path d="M17 7l-5-5-5 5" />
                                        <rect x="8" y="10" width="8" height="8" rx="1" />
                                    </svg>
                                ),
                            },
                            {
                                key: "defense",
                                rect: FIELD_BUTTONS.defense,
                                label: "Defense",
                                borderColor: "#f87171",
                                bgActive: "rgba(248, 113, 113, 0.25)",
                                bgIdle: "rgba(39, 39, 42, 0.85)",
                                icon: (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                    </svg>
                                ),
                            },
                            {
                                key: "climb",
                                rect: FIELD_BUTTONS.climb,
                                label: "Climb",
                                borderColor: "#fb923c",
                                bgActive: "rgba(251, 146, 60, 0.25)",
                                bgIdle: "rgba(39, 39, 42, 0.85)",
                                icon: (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 17V3" /><path d="M7 8l5-5 5 5" />
                                        <path d="M4 21h16" />
                                    </svg>
                                ),
                            },
                        ] as {
                            key: string
                            rect: Rect
                            label: string
                            borderColor: string
                            bgActive: string
                            bgIdle: string
                            icon: React.ReactNode
                        }[]
                    ).map(({ key, rect, label, borderColor, bgActive, bgIdle, icon }) => {
                        const displayed: Rect = flip
                            ? { x1: 1 - rect.x2, y1: 1 - rect.y2, x2: 1 - rect.x1, y2: 1 - rect.y1 }
                            : rect
                        const left = displayed.x1
                        const top = displayed.y1
                        const width = displayed.x2 - displayed.x1
                        const height = displayed.y2 - displayed.y1
                        const isActive = currentZone === key
                        return (
                            <button
                                key={key}
                                onClick={() => {
                                    console.log(`[FieldButton] ${label} clicked | zone: ${key} | phase: ${matchPhase} | subPhase: ${subPhase?.phase ?? "none"} | time: ${Date.now() - matchStartTime}ms`)
                                    // If there's a shot recorded and we haven't already saved it, finalize it
                                    if (shot !== 0 && !shotPendingReset) {
                                        const now = Date.now()
                                        setActions((prev) => [
                                            ...prev,
                                            {
                                                type: "score",
                                                x: shootClickPos?.x ?? 0,
                                                y: shootClickPos?.y ?? 0,
                                                score: shot,
                                                timestamp: matchStartTime > 0 ? now - matchStartTime : 0,
                                                phase: matchPhase,
                                                subPhase: subPhase?.phase ?? null,
                                            },
                                        ])
                                        setShotEditHint(true)
                                    }
                                    setShotPendingReset(true)
                                    handleZoneClick(key)
                                }}
                                className="absolute rounded-xl transition-all duration-200 flex flex-col items-center justify-center gap-1"
                                style={{
                                    left: `${left * 100}%`,
                                    top: `${top * 100}%`,
                                    width: `${width * 100}%`,
                                    height: `${height * 100}%`,
                                    background: isActive ? bgActive : bgIdle,
                                    border: `2px solid ${isActive ? borderColor : "rgba(63, 63, 70, 0.7)"}`,
                                    boxShadow: isActive ? `0 0 12px ${borderColor}44, inset 0 0 20px ${borderColor}15` : "none",
                                    backdropFilter: "blur(4px)",
                                }}
                            >
                                <span
                                    className="transition-colors duration-200"
                                    style={{ color: isActive ? borderColor : "rgba(161, 161, 170, 0.9)" }}
                                >
                                    {icon}
                                </span>
                                <span
                                    className="text-xs font-semibold tracking-wide transition-colors duration-200"
                                    style={{ color: isActive ? borderColor : "rgba(212, 212, 216, 0.9)" }}
                                >
                                    {label}
                                </span>
                            </button>
                        )
                    })}
                </>
            )}

            {/* Starting position indicator */}
            {matchPhase === "prestart" && startPos && (
                <div
                    className="absolute"
                    style={{
                        width: "3.75%",
                        height: "7.5%",
                        left: `${viewX(startPos.x) * 100}%`,
                        top: `${viewY(startPos.y) * 100}%`,
                        transform: "translate(-50%, -50%)",
                    }}
                >
                    <div className="absolute inset-0 bg-zinc-600/50 border-2 rounded-xs border-zinc-800"/>
                </div>
            )}

            {/* Shooting zone: yellow dot trail from robot to reef hexagon center */}
            {showZones && shootClickPos && (() => {
                const sx = viewX(shootClickPos.x)
                const sy = viewY(shootClickPos.y)
                const cx = viewX(REEF_CENTER.x)
                const cy = viewY(REEF_CENTER.y)
                const dx = cx - sx
                const dy = cy - sy
                // dist in "visual" space (field is 2:1, so x is doubled)
                const dist = Math.sqrt((dx * 2) ** 2 + dy ** 2)
                const ballDiameter = 0.0167 * 1.5
                const count = Math.max(0, Math.floor(dist / ballDiameter))
                const balls: React.ReactNode[] = []
                // Determine if a non-shooting zone is active (ball trail goes B&W)
                const nonShootingActive = currentZone !== null && currentZone !== "shooting"
                for (let i = 0; i < count; i++) {
                    const t = 1 - (i * ballDiameter) / dist
                    if (t <= 0) break
                    balls.push(
                        <div
                            key={i}
                            className={`absolute rounded-full pointer-events-none ${
                                nonShootingActive
                                    ? "bg-zinc-600"
                                    : "bg-yellow-400 border border-black/30"
                            }`}
                            style={{
                                width: "0.833%",
                                height: "1.67%",
                                left: `${(sx + dx * t) * 100}%`,
                                top: `${(sy + dy * t) * 100}%`,
                                transform: "translate(-50%, -50%)",
                                transition: "background-color 0.2s, border-color 0.2s",
                            }}
                        />
                    )
                }

                // Angle from robot toward reef center
                const angle = Math.atan2(dy, dx * 2) * (180 / Math.PI)

                return (
                    <>
                        {balls}
                        {/* Robot rectangle at click position — draggable */}
                        <div
                            className="absolute"
                            style={{
                                width: "3.75%",
                                height: "7.5%",
                                left: `${sx * 100}%`,
                                top: `${sy * 100}%`,
                                transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                                cursor: "grab",
                                touchAction: "none",
                            }}
                        >
                            <div className={`absolute inset-0 border-2 rounded-xs ${
                                draggingShootRobot
                                    ? "bg-zinc-500/60 border-zinc-600"
                                    : "bg-zinc-600/50 border-zinc-800"
                            }`}/>
                        </div>
                    </>
                )
            })()}
        </div>
    )

    // ---------------------------------------------------------------------------
    // Render: Controls
    // ---------------------------------------------------------------------------
    const renderControls = () => {
        if (matchPhase === "prestart") {
            return (
                <div className="flex flex-col gap-4">
                    <div className="text-zinc-500 text-center py-4 text-sm">
                        Set starting position on field
                    </div>
                    <button
                        onClick={handleStartMatch}
                        disabled={!startPos}
                        className={`h-20 rounded-xl text-2xl font-bold transition-colors ${
                            startPos
                                ? "bg-green-700 hover:bg-green-600"
                                : "bg-zinc-800 opacity-40 cursor-not-allowed"
                        }`}
                    >
                        {startPos ? "START MATCH ▶" : "Set starting position first"}
                    </button>
                </div>
            )
        }

        if (matchPhase === "post") {
            return (
                <div className="flex flex-col gap-4">
                    <div className="text-zinc-400 text-center py-8">
                        Match complete! Review and submit data.
                    </div>
                    <button
                        onClick={() => {/* Navigate to post-match */
                        }}
                        className="h-16 bg-green-700 rounded-xl text-xl font-bold"
                    >
                        FINISH & SUBMIT →
                    </button>
                </div>
            )
        }

        return (
            <div className="flex flex-col gap-3 items-center h-full">
                {/* Score display */}
                <div className="text-white text-3xl font-bold font-mono">
                    Shot: {shot}
                </div>

                {/* Edit hint when shot was recorded but can still be adjusted */}

                    <div className="text-yellow-400 text-xs text-center px-2">
                        This shot can still be edited until you press inside the shooting box again
                    </div>


                {/* Slider container */}
                <div className="relative flex flex-col items-center select-none flex-1 w-full max-w-[16rem]">
                    {/* Labels */}
                    <span className="text-green-400 text-xs font-bold mb-1">+ ADD</span>

                    <div
                        ref={sliderRef}
                        className="relative w-full flex-1 bg-zinc-800 rounded-2xl border-2 border-zinc-600 overflow-hidden touch-none"
                        onPointerDown={(e) => {
                            e.preventDefault()
                            ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
                            const rect = sliderRef.current!.getBoundingClientRect()
                            const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
                            sliderYRef.current = y
                            setSliderY(y)

                            // Instant score change based on initial direction
                            const displacement = y - 0.5
                            if (Math.abs(displacement) > 0.05) { // Outside dead zone
                                const direction = displacement < 0 ? 1 : -1
                                setShot((prev) => {
                                    const next = prev + direction
                                    console.log(`[ScoreSlider] INSTANT ${direction > 0 ? '+' : ''}${direction} → score: ${next}`)
                                    return next
                                })
                            }

                            setSliderActive(true)
                            console.log("[ScoreSlider] Pointer down at y:", y.toFixed(3))
                        }}
                        onPointerMove={(e) => {
                            if (!sliderActive) return
                            const rect = sliderRef.current!.getBoundingClientRect()
                            const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
                            sliderYRef.current = y   // ref updates instantly for the rAF loop
                            setSliderY(y)             // state updates for visual rendering
                        }}
                        onPointerUp={() => {
                            setSliderActive(false)
                            sliderYRef.current = 0.5
                            setSliderY(0.5)
                            console.log("[ScoreSlider] Pointer up — reset to center")
                        }}
                        onPointerLeave={() => {
                            if (sliderActive) {
                                setSliderActive(false)
                                sliderYRef.current = 0.5
                                setSliderY(0.5)
                                console.log("[ScoreSlider] Pointer left — reset to center")
                            }
                        }}
                    >

                        {/* Center dead zone line */}
                        <div
                            className="absolute left-0 right-0 border-t-2 border-dashed border-zinc-400/50"
                            style={{top: "50%"}}
                        />

                        {/* Thumb */}
                        <div
                            className={`absolute left-1 right-1 h-10 rounded-xl transition-colors duration-100 flex items-center justify-center ${
                                sliderActive
                                    ? sliderY < 0.45
                                        ? "bg-green-500 shadow-lg shadow-green-500/30"
                                        : sliderY > 0.55
                                            ? "bg-red-500 shadow-lg shadow-red-500/30"
                                            : "bg-zinc-400"
                                    : "bg-zinc-500"
                            }`}
                            style={{
                                top: `${sliderY * 100}%`,
                                transform: "translateY(-50%)",
                                pointerEvents: "none",
                            }}
                        >
                            <span className="text-white text-xs font-bold">
                                {(() => {
                                    if (!sliderActive) return "▲▼"
                                    const disp = Math.abs(sliderY - 0.5)
                                    if (disp < SLIDER_DEAD_ZONE) return "—"
                                    const mag = (disp - SLIDER_DEAD_ZONE) / (0.5 - SLIDER_DEAD_ZONE)
                                    const ms = Math.round(msFromMagnitude(mag))
                                    return sliderY < 0.5 ? `+${ms}ms` : `−${ms}ms`
                                })()}
                            </span>
                        </div>
                    </div>

                    <span className="text-red-400 text-xs font-bold mt-1">− SUB</span>
                </div>

                {/* Current zone indicator */}
                <span className="text-xs text-zinc-500">
                    Current zone: {currentZone || "none"}
                </span>
            </div>
        )
    }

    // ---------------------------------------------------------------------------
    // Layout
    // ---------------------------------------------------------------------------
    if (deviceType === "tablet") {
        return (
            <div className="w-screen h-max flex flex-col select-none text-sm">
                <HeaderStrip
                    phase={matchPhase}
                    subPhase={subPhase}
                    subPhaseElapsed={subPhaseElapsed}
                    subPhaseTotal={subPhaseTotal}
                    phaseRemaining={phaseRemaining}
                    flashing={flashing}
                />
                <div className="flex-1 flex gap-3 p-3 overflow-hidden">
                    <div className="flex-3 flex flex-col gap-3">{renderField()}</div>
                    <div className="flex-1 flex flex-col gap-3 overflow-y-auto">{renderControls()}</div>
                </div>
            </div>
        )
    }

    return (
        <div className="w-screen h-max flex flex-col select-none text-sm">
            <HeaderStrip
                phase={matchPhase}
                subPhase={subPhase}
                subPhaseElapsed={subPhaseElapsed}
                subPhaseTotal={subPhaseTotal}
                phaseRemaining={phaseRemaining}
                flashing={flashing}
            />
            <div className="flex-1 flex flex-col p-2 gap-4 overflow-y-auto">
                {renderField()}
                {renderControls()}
            </div>
        </div>
    )
}