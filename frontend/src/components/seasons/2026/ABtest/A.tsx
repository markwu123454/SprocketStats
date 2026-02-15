import React, {useEffect, useRef, useState, useCallback} from "react"
import {getSettingSync} from "@/db/settingsDb"
import type {
    MatchScoutingData,
    Actions,
    StartingAction,
    ZoneAction,
    ScoreAction,
    ClimbAction,
    MatchPhase,
    SubPhaseName
} from "../yearConfig"

type Alliance = "red" | "blue"

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
    {phase: "shift_2", duration: 25000},
    {phase: "shift_3", duration: 25000},
    {phase: "shift_4", duration: 25000},
    {phase: "endgame", duration: 30000},
]

// ---------------------------------------------------------------------------
// Phase duration constants
// ---------------------------------------------------------------------------
const AUTO_DURATION = 20000
const BETWEEN_DURATION = 3000
const TELEOP_DURATION = TELEOP_SEQUENCE.reduce((s, c) => s + c.duration, 0)

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

// ---------------------------------------------------------------------------
// Field button zones — padded 2×2 grid of visually square buttons
// Field is 2:1 aspect, so width = size/2 in normalized coords for squares.
// ---------------------------------------------------------------------------
const _FB_PAD = 0.015  // outer padding from region edges (reduced)
const _FB_GAP_Y = 0.012  // gap between buttons vertically (normalized, slightly reduced)
const _FB_GAP_X = 0.0075  // gap between buttons horizontally (half of vertical)
const _FB_REGION = {x1: 0.35, y1: 0.020, x2: 0.987, y2: 0.978}
// Available inner space
const _FB_INNER_W = (_FB_REGION.x2 - _FB_REGION.x1) - _FB_PAD * 2
const _FB_INNER_H = (_FB_REGION.y2 - _FB_REGION.y1) - _FB_PAD * 2
// Each button size: use the smaller dimension so they fit as squares
// Visual square: btnH (norm) = btnW (norm) * 2 (because field is 2:1)
// Two buttons + gap in each direction:
// Horizontal: 3 * btnW + 2*gap_x = innerW → btnW = (innerW - 2*gap_x) / 3
// Vertical:   2 * btnH + gap_y = innerH → btnH = (innerH - gap_y) / 2
// For visual square: btnH = btnW * 2
// Pick the limiting axis:
const _FB_BTN_W_from_x = (_FB_INNER_W - _FB_GAP_X * 2) / 3
const _FB_BTN_H_from_x = _FB_BTN_W_from_x * 2
const _FB_BTN_H_from_y = (_FB_INNER_H - _FB_GAP_Y) / 2
const _FB_BTN_W_from_y = _FB_BTN_H_from_y / 2
// Use whichever fits
const _FB_BTN_W = Math.min(_FB_BTN_W_from_x, _FB_BTN_W_from_y)
const _FB_BTN_H = _FB_BTN_W * 2
// Center the grid in the region
const _FB_GRID_W = _FB_BTN_W * 3 + _FB_GAP_X * 2
const _FB_GRID_H = _FB_BTN_H * 2 + _FB_GAP_Y
const _FB_OX = _FB_REGION.x1 + (_FB_REGION.x2 - _FB_REGION.x1 - _FB_GRID_W) / 2
const _FB_OY = _FB_REGION.y1 + (_FB_REGION.y2 - _FB_REGION.y1 - _FB_GRID_H) / 2

const FIELD_BUTTONS = {
    traversal: { // top-left
        x1: _FB_OX,
        y1: _FB_OY,
        x2: _FB_OX + _FB_BTN_W,
        y2: _FB_OY + _FB_BTN_H
    } as Rect,

    intake: { // top-middle
        x1: _FB_OX + _FB_BTN_W + _FB_GAP_X,
        y1: _FB_OY,
        x2: _FB_OX + _FB_BTN_W * 2 + _FB_GAP_X,
        y2: _FB_OY + _FB_BTN_H
    } as Rect,

    passing: { // top-right
        x1: _FB_OX + _FB_BTN_W * 2 + _FB_GAP_X * 2,
        y1: _FB_OY,
        x2: _FB_OX + _FB_BTN_W * 3 + _FB_GAP_X * 2,
        y2: _FB_OY + _FB_BTN_H
    } as Rect,

    climb: { // bottom-left
        x1: _FB_OX,
        y1: _FB_OY + _FB_BTN_H + _FB_GAP_Y,
        x2: _FB_OX + _FB_BTN_W,
        y2: _FB_OY + _FB_BTN_H * 2 + _FB_GAP_Y
    } as Rect,

    defense: { // bottom-middle
        x1: _FB_OX + _FB_BTN_W + _FB_GAP_X,
        y1: _FB_OY + _FB_BTN_H + _FB_GAP_Y,
        x2: _FB_OX + _FB_BTN_W * 2 + _FB_GAP_X,
        y2: _FB_OY + _FB_BTN_H * 2 + _FB_GAP_Y
    } as Rect,

    idle: { // bottom-right
        x1: _FB_OX + _FB_BTN_W * 2 + _FB_GAP_X * 2,
        y1: _FB_OY + _FB_BTN_H + _FB_GAP_Y,
        x2: _FB_OX + _FB_BTN_W * 3 + _FB_GAP_X * 2,
        y2: _FB_OY + _FB_BTN_H * 2 + _FB_GAP_Y
    } as Rect,
} as const


// ---------------------------------------------------------------------------
// Helper: Calculate phase info from match elapsed time
// ---------------------------------------------------------------------------
function getPhaseInfo(matchElapsed: number): {
    phase: MatchPhase
    phaseElapsed: number
    phaseRemaining: number
    subPhase: SubPhaseConfig | null
    subPhaseElapsed: number
    subPhaseTotal: number
} {
    // Auto: 0ms - 20000ms
    if (matchElapsed < AUTO_DURATION) {
        return {
            phase: "auto",
            phaseElapsed: matchElapsed,
            phaseRemaining: AUTO_DURATION - matchElapsed,
            subPhase: {phase: "auto", duration: AUTO_DURATION},
            subPhaseElapsed: matchElapsed,
            subPhaseTotal: AUTO_DURATION,
        }
    }

    // Between: 20000ms - 25000ms
    const betweenStart = AUTO_DURATION
    const betweenEnd = betweenStart + BETWEEN_DURATION
    if (matchElapsed < betweenEnd) {
        const elapsed = matchElapsed - betweenStart
        return {
            phase: "between",
            phaseElapsed: elapsed,
            phaseRemaining: BETWEEN_DURATION - elapsed,
            subPhase: null,
            subPhaseElapsed: elapsed,
            subPhaseTotal: BETWEEN_DURATION,
        }
    }

    // Teleop: 25000ms - 165000ms (140000ms total)
    const teleopStart = betweenEnd
    const teleopEnd = teleopStart + TELEOP_DURATION
    if (matchElapsed < teleopEnd) {
        const teleopElapsed = matchElapsed - teleopStart

        // Find which subphase we're in
        let cumulative = 0
        for (const sp of TELEOP_SEQUENCE) {
            if (teleopElapsed < cumulative + sp.duration) {
                const subElapsed = teleopElapsed - cumulative
                return {
                    phase: "teleop",
                    phaseElapsed: teleopElapsed,
                    phaseRemaining: TELEOP_DURATION - teleopElapsed,
                    subPhase: sp,
                    subPhaseElapsed: subElapsed,
                    subPhaseTotal: sp.duration,
                }
            }
            cumulative += sp.duration
        }

        // Shouldn't reach here, but if we do, we're in the last subphase
        const lastSp = TELEOP_SEQUENCE[TELEOP_SEQUENCE.length - 1]
        return {
            phase: "teleop",
            phaseElapsed: teleopElapsed,
            phaseRemaining: 0,
            subPhase: lastSp,
            subPhaseElapsed: lastSp.duration,
            subPhaseTotal: lastSp.duration,
        }
    }

    // Post: after 165000ms
    return {
        phase: "post",
        phaseElapsed: 0,
        phaseRemaining: 0,
        subPhase: null,
        subPhaseElapsed: 0,
        subPhaseTotal: 0,
    }
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
                                          handleSubmit,
                                          handleBack,
                                          handleNext,
                                          exitToPre
                                      }: {
    data: MatchScoutingData
    setData: React.Dispatch<React.SetStateAction<MatchScoutingData>>
    handleSubmit?: () => void
    handleBack?: () => void
    handleNext?: () => void
    exitToPre?: () => void
}) {
    const deviceType = getSettingSync("match_scouting_device_type") ?? "mobile"
    const debug = getSettingSync("debug") === true
    const fieldRef = useRef<HTMLDivElement>(null)
    const sliderTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // Extract alliance from data, default to "red" if not set
    const alliance = (data.alliance || "red") as Alliance

    // Debug overrides (only used when debug === true)
    const [debugAlliance, setDebugAlliance] = useState<Alliance>(alliance)
    const [debugOrientation, setDebugOrientation] = useState<string>(
        getSettingSync("field_orientation") ?? "0"
    )

    // Effective values: use debug overrides when debug mode is on
    const effectiveAlliance = debug ? debugAlliance : alliance
    const effectiveOrientation = debug ? debugOrientation : (getSettingSync("field_orientation") ?? 0)

    // *** CENTRALIZED TIMING - Single source of truth ***
    const [matchStartTime, setMatchStartTime] = useState(0)
    const [, forceUpdate] = useState(0)

    // Flash state
    const [flashing, setFlashing] = useState(false)
    const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const lastPhaseRef = useRef<MatchPhase>("prestart")
    const lastSubPhaseRef = useRef<SubPhaseName | null>(null)

    // Field flip is controlled by field_orientation setting (0 or 180)
    // When 180, the field image is rotated and coordinates are flipped
    const isRedAlliance = effectiveAlliance === "red"

    // fieldFlip: whether the field IMAGE is rotated 180° (affects coordinate storage)
    const fieldFlip = effectiveOrientation === "180"

    // uiFlip: whether the UI layout is mirrored (shooting zone / buttons swap sides)
    // Logic: orientation 180 flips once, red alliance flips again (XOR)
    const uiFlip = fieldFlip !== isRedAlliance

    // For backward compatibility, "flip" means the combined transform for
    // converting between screen coords and stored (canonical) coords.
    // Screen coords are what the user sees; canonical coords are blue-alliance,
    // 0°-orientation normalized coords.
    // When fieldFlip is true, the image is rotated so screen→canonical needs inversion.
    const flip = fieldFlip

    // Actions
    // Convert field coords from data to screen coords for display
    // Flip coordinates if field is rotated 180°
    const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(
        data.startPosition
            ? {
                x: flip ? 1 - data.startPosition.x : data.startPosition.x,
                y: flip ? 1 - data.startPosition.y : data.startPosition.y,
            }
            : null
    )
    const [actions, setActions] = useState<Actions[]>(data.actions)
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

    const [climbSuccess, setClimbSuccess] = useState(false)

    // Shooting zone click — robot rectangle + yellow dot trail to reef hexagon
    const [shootClickPos, setShootClickPos] = useState<{ x: number; y: number } | null>(null)
    const [draggingShootRobot, setDraggingShootRobot] = useState(false)

    // Shot lifecycle: each click on → off the shooting zone = one "shot"
    const [shotPendingReset, setShotPendingReset] = useState(false)
    const [shotEditHint, setShotEditHint] = useState(false)

    // Reef hexagon center in normalized field coords (blue-side / unflipped)
    const REEF_CENTER = {x: 0.285, y: 0.500}

    // Helper: mirror a Rect horizontally (for uiFlip)
    const mirrorRect = (r: Rect): Rect => ({
        x1: 1 - r.x2,
        y1: r.y1,
        x2: 1 - r.x1,
        y2: r.y2,
    })

    // *** DERIVE ALL TIMING FROM matchStartTime ***
    const now = Date.now()
    const matchElapsed = matchStartTime > 0 ? now - matchStartTime : 0
    const phaseInfo = matchStartTime > 0 ? getPhaseInfo(matchElapsed) : {
        phase: "prestart" as MatchPhase,
        phaseElapsed: 0,
        phaseRemaining: 0,
        subPhase: null,
        subPhaseElapsed: 0,
        subPhaseTotal: 0,
    }

    const matchPhase = phaseInfo.phase
    const subPhase = phaseInfo.subPhase
    const subPhaseElapsed = phaseInfo.subPhaseElapsed
    const subPhaseTotal = phaseInfo.subPhaseTotal
    const phaseRemaining = phaseInfo.phaseRemaining

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
    // Detect phase/subphase transitions and trigger flash
    // ---------------------------------------------------------------------------
    useEffect(() => {
        if (matchPhase !== lastPhaseRef.current) {
            if (lastPhaseRef.current !== "prestart") {
                triggerFlash()
            }
            lastPhaseRef.current = matchPhase
        }

        const currentSubPhaseName = subPhase?.phase ?? null
        if (currentSubPhaseName !== lastSubPhaseRef.current) {
            if (lastSubPhaseRef.current !== null) {
                triggerFlash()
            }
            lastSubPhaseRef.current = currentSubPhaseName
        }
    }, [matchPhase, subPhase, triggerFlash])

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
                        if (next < 0) return 0
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
    // Smooth timer (60 fps) - only force re-render when match is active
    // ---------------------------------------------------------------------------
    useEffect(() => {
        if (matchPhase === "prestart" || matchPhase === "post") return
        const id = setInterval(() => forceUpdate((n) => n + 1), 1000 / 60)
        return () => clearInterval(id)
    }, [matchPhase])

    // ---------------------------------------------------------------------------
    // Field pointer handlers
    // ---------------------------------------------------------------------------
    function getFieldPosScreen(e: React.PointerEvent) {
        if (!fieldRef.current) return {x: 0, y: 0}
        const rect = fieldRef.current.getBoundingClientRect()
        const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
        const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
        return {x, y}
    }

    function getFieldPos(e: React.PointerEvent) {
        const screenPos = getFieldPosScreen(e)
        let x = screenPos.x
        let y = screenPos.y
        // Convert screen coords back to un-flipped normalized coords
        if (flip) {
            x = 1 - x
            y = 1 - y
        }
        return {x, y}
    }

    function handlePointerDown(e: React.PointerEvent) {
        if (matchPhase === "prestart") {
            // Store starting position in screen coords so it always appears where clicked
            const screenPos = getFieldPosScreen(e)

            // Snap x to auto start line based on alliance and orientation
            // Orientation 0°: blue=0.26, red=0.77
            // Orientation 180°: coordinates are flipped, so blue=0.23 (1-0.77), red=0.74 (1-0.26)
            let autoLineX: number
            if (effectiveOrientation === "0") {
                autoLineX = isRedAlliance ? 0.77 : 0.23
            } else {
                autoLineX = isRedAlliance ? 0.225 : 0.77
            }

            setStartPos({x: autoLineX, y: screenPos.y})
            setDragging(true)
            return
        }
        // During auto/between/teleop, clicking anywhere in the shooting zone snaps the robot there
        if (matchPhase === "auto" || matchPhase === "between" || matchPhase === "teleop") {
            const screenPos = getFieldPosScreen(e)
            const zone = uiFlip ? mirrorRect(ZONES.shootingFull) : ZONES.shootingFull
            if (
                screenPos.x >= zone.x1 &&
                screenPos.x <= zone.x2 &&
                screenPos.y >= zone.y1 &&
                screenPos.y <= zone.y2
            ) {
                // If returning to shooting zone after visiting another zone, reset shot for new cycle
                if (shotPendingReset) {
                    setShot(0)
                    setShotPendingReset(false)
                    setShotEditHint(false)
                }
                const pos = getFieldPos(e)
                setShootClickPos({x: pos.x, y: pos.y})
                handleZoneClick("shooting")
                setDraggingShootRobot(true)
                ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
                return
            }
        }
    }

    function handlePointerMove(e: React.PointerEvent) {
        if (dragging && matchPhase === "prestart") {
            // Store starting position in screen coords so it always appears where clicked
            const screenPos = getFieldPosScreen(e)

            // Snap x to auto start line based on alliance and orientation
            let autoLineX: number
            if (effectiveOrientation === "0") {
                autoLineX = isRedAlliance ? 0.77 : 0.23
            } else {
                autoLineX = isRedAlliance ? 0.225 : 0.77
            }

            setStartPos({x: autoLineX, y: screenPos.y})
            return
        }
        if (draggingShootRobot) {
            const screenPos = getFieldPosScreen(e)
            // Clamp to shooting zone bounds (screen-space, uiFlip-aware)
            const zone = uiFlip ? mirrorRect(ZONES.shootingFull) : ZONES.shootingFull
            const clampedX = Math.min(zone.x2, Math.max(zone.x1, screenPos.x))
            const clampedY = Math.min(zone.y2, Math.max(zone.y1, screenPos.y))
            setShootClickPos({
                x: flip ? 1 - clampedX : clampedX,
                y: flip ? 1 - clampedY : clampedY,
            })
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

            // Auto-record L1 climb when entering climb zone during auto
            if (zoneName === "climb" && matchPhase === "auto") {
                setActions((prev) => [...prev,
                    {
                        type: "zone_change",
                        zone: zoneName,
                        timestamp: matchStartTime > 0 ? now - matchStartTime : 0,
                        phase: matchPhase,
                        subPhase: subPhase?.phase ?? null,
                    },
                    {
                        type: "climb",
                        timestamp: matchStartTime > 0 ? now - matchStartTime : 0,
                        level: "L1",
                        success: climbSuccess,
                        phase: matchPhase,
                        subPhase: subPhase?.phase ?? null,
                    }
                ])
            } else {
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
            }
        },
        [matchStartTime, matchPhase, subPhase, climbSuccess],
    )

    // ---------------------------------------------------------------------------
    // Start match
    // ---------------------------------------------------------------------------
    const handleStartMatch = () => {
        const now = Date.now()
        setMatchStartTime(now)
        lastPhaseRef.current = "auto"
        lastSubPhaseRef.current = "auto"
        if (startPos) {
            // Convert screen coords to field coords for storage
            const fieldX = flip ? 1 - startPos.x : startPos.x
            const fieldY = flip ? 1 - startPos.y : startPos.y
            setActions([{type: "starting", x: fieldX, y: fieldY}])
        }
    }

    // ---------------------------------------------------------------------------
    // Sync to parent
    // ---------------------------------------------------------------------------
    useEffect(() => {
        // Convert screen coords to field coords for storage
        const fieldStartPos = startPos
            ? {
                x: flip ? 1 - startPos.x : startPos.x,
                y: flip ? 1 - startPos.y : startPos.y,
            }
            : null

        setData((d) => {
            // Only update if values actually changed to prevent infinite loops
            const posChanged = JSON.stringify(d.startPosition) !== JSON.stringify(fieldStartPos)
            const actionsChanged = JSON.stringify(d.actions) !== JSON.stringify(actions)
            if (posChanged || actionsChanged) {
                return {...d, startPosition: fieldStartPos, actions}
            }
            return d
        })
    }, [startPos, actions, setData, flip])

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
            updated[lastScoreIdx] = {...action, score: shot}
            return updated
        })
    }, [shot, shotEditHint])

    // View helpers — convert normalized coords to screen coords for the start dot
    const viewX = (v: number) => (flip ? 1 - v : v)
    const viewY = (v: number) => (flip ? 1 - v : v)

    const showZones = matchPhase === "auto" || matchPhase === "between" || matchPhase === "teleop"

    // ---------------------------------------------------------------------------
    // Render: Field
    // ---------------------------------------------------------------------------
    const renderField = () => (
        <div
            ref={fieldRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => {
                setDragging(false);
                setDraggingShootRobot(false)
            }}
            className="relative w-full aspect-2/1 rounded-xl overflow-hidden touch-none"
            // Container is NEVER rotated — only the image and zone positions flip
        >
            {/* Field image rotates 180° when field_orientation setting is 180 */}
            <img
                src="/seasons/2026/field-lovat.png"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                alt="field"
                style={{transform: flip ? "rotate(180deg)" : "none"}}
            />

            {/* Overlays: shooting box/buttons stay fixed; field-relative markers still use flip */}
            {showZones && (
                <>
                    {/* Shooting zone — green-bordered rectangle, captures click position */}
                    {(() => {
                        const zone = uiFlip ? mirrorRect(ZONES.shootingFull) : ZONES.shootingFull
                        const left = zone.x1
                        const top = zone.y1
                        const width = zone.x2 - zone.x1
                        const height = zone.y2 - zone.y1
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
                                    if (flip) {
                                        nx = 1 - nx;
                                        ny = 1 - ny
                                    }
                                    setShootClickPos({x: nx, y: ny})
                                }}
                                className={`absolute rounded transition-all duration-200 border-2 ${isActive ? "bg-green-500/15 border-green-500" : "bg-transparent border-zinc-500"}`}
                                style={{
                                    left: `${left * 100}%`,
                                    top: `${top * 100}%`,
                                    width: `${width * 100}%`,
                                    height: `${height * 100}%`,
                                }}
                            />
                        )
                    })()}

                    {/* 4 Field Buttons — card-style with icons */}
                    {(
                        [
                            {
                                key: "traversal",
                                rect: FIELD_BUTTONS.traversal,
                                label: "Traversal",
                                borderColor: "#a855f7",
                                bgActive: "rgba(168, 85, 247, 0.25)",
                                bgIdle: "rgba(39, 39, 42, 0.85)",
                                icon: (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M5 12h14"/>
                                        <path d="M12 5l7 7-7 7"/>
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
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 2v20"/>
                                        <path d="M17 7l-5-5-5 5"/>
                                        <rect x="8" y="10" width="8" height="8" rx="1"/>
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
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
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
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 17V3"/>
                                        <path d="M7 8l5-5 5 5"/>
                                        <path d="M4 21h16"/>
                                    </svg>
                                ),
                            },
                            {
                                key: "passing",
                                rect: FIELD_BUTTONS.passing,
                                label: "Passing",
                                borderColor: "#facc15",
                                bgActive: "rgba(250, 204, 21, 0.25)",
                                bgIdle: "rgba(39, 39, 42, 0.85)",
                                icon: (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M7 17L17 7"/>
                                        <path d="M7 7h10v10"/>
                                    </svg>
                                ),
                            },
                            {
                                key: "idle",
                                rect: FIELD_BUTTONS.idle,
                                label: "Idle",
                                borderColor: "#71717a",
                                bgActive: "rgba(113, 113, 122, 0.25)",
                                bgIdle: "rgba(39, 39, 42, 0.85)",
                                icon: (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10"/>
                                        <line x1="12" y1="8" x2="12" y2="12"/>
                                        <line x1="12" y1="16" x2="12.01" y2="16"/>
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
                    ).map(({key, rect, label, borderColor, bgActive, bgIdle, icon}) => {
                        const displayed: Rect = uiFlip ? mirrorRect(rect) : rect
                        const left = displayed.x1
                        const top = displayed.y1
                        const width = displayed.x2 - displayed.x1
                        const height = displayed.y2 - displayed.y1
                        const isActive = currentZone === key
                        return (
                            <button
                                key={key}
                                onClick={() => {
                                    console.log(`[FieldButton] ${label} clicked | zone: ${key} | phase: ${matchPhase} | subPhase: ${subPhase?.phase ?? "none"} | time: ${matchElapsed}ms`)
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
                                    style={{color: isActive ? borderColor : "rgba(161, 161, 170, 0.9)"}}
                                >
                                    {icon}
                                </span>
                                <span
                                    className="text-xs font-semibold tracking-wide transition-colors duration-200"
                                    style={{color: isActive ? borderColor : "rgba(212, 212, 216, 0.9)"}}
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
                        // Use screen coords directly - no flip transformation
                        left: `${startPos.x * 100}%`,
                        top: `${startPos.y * 100}%`,
                        transform: "translate(-50%, -50%)",
                    }}
                >
                    {/* robot perimeter */}
                    <div className="absolute inset-[6%] rounded-xs bg-zinc-600/50"/>

                    {/* bumpers */}
                    <div
                        className={`absolute inset-[-12%] rounded-xs border-6 ${effectiveAlliance === "red"
                            ? "border-red-700"
                            : "border-blue-700"
                        }`}
                    />
                </div>

            )
            }


            {/* Shooting zone: yellow dot trail from robot to reef hexagon center */}
            {
                showZones && shootClickPos && (() => {
                    // Use the correct reef based on alliance
                    const reefCenter = effectiveAlliance === "red"
                        ? {x: 1 - REEF_CENTER.x, y: REEF_CENTER.y}  // Red reef is mirrored
                        : REEF_CENTER                                  // Blue reef
                    const sx = viewX(shootClickPos.x)
                    const sy = viewY(shootClickPos.y)
                    const cx = viewX(reefCenter.x)
                    const cy = viewY(reefCenter.y)
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
                                className={`absolute rounded-full pointer-events-none ${nonShootingActive
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
                                {/* robot perimeter */}
                                <div
                                    className={`absolute inset-[6%] rounded-xs border-2 ${draggingShootRobot
                                        ? "bg-zinc-500/60 border-zinc-600"
                                        : "bg-zinc-600/50 border-zinc-800"
                                    }`}
                                />

                                {/* bumpers */}
                                <div
                                    className={`absolute inset-[-12%] rounded-xs border-6 ${effectiveAlliance === "red"
                                        ? "border-red-700"
                                        : "border-blue-700"
                                    }`}
                                />
                            </div>
                        </>
                    )
                })()
            }
        </div>
    )

    // ---------------------------------------------------------------------------
    // Render: Debug controls
    // ---------------------------------------------------------------------------
    const renderDebug = () => {
        if (!debug) return null
        return (
            <div className="flex gap-2 px-2">
                <button
                    onClick={() => setDebugAlliance((a) => (a === "blue" ? "red" : "blue"))}
                    className={`flex-1 h-10 rounded-lg text-sm font-bold border-2 ${
                        effectiveAlliance === "red"
                            ? "bg-red-700/30 border-red-500 text-red-300"
                            : "bg-blue-700/30 border-blue-500 text-blue-300"
                    }`}
                >
                    Alliance: {effectiveAlliance.toUpperCase()}
                </button>
                <button
                    onClick={() => setDebugOrientation((o) => (o === "0" ? "180" : "0"))}
                    className="flex-1 h-10 rounded-lg text-sm font-bold border-2 bg-zinc-800/60 border-zinc-500 text-zinc-300"
                >
                    Orientation: {effectiveOrientation}°
                </button>
            </div>
        )
    }


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
                        className={`h-20 rounded-xl text-2xl font-bold transition-colors ${startPos
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
                        onClick={() => {
                            handleSubmit()
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
                {/* Score display - always show during active match phases */}
                <div className="text-white text-3xl font-bold font-mono">
                    Shot: {shot}
                </div>

                {/* Status text — always rendered to reserve space, content changes */}
                <div className="text-xs text-center px-2 h-4">
                    {shotEditHint ? (
                        <span className="text-yellow-400">
                            Editable until next shooting box tap
                        </span>
                    ) : (
                        <span className="text-zinc-600">
                            Tap shooting zone to score
                        </span>
                    )}
                </div>

                {/* Slider container */}
                <div
                    className={`relative flex flex-col items-center select-none flex-1 w-full max-w-[16rem] transition-all duration-300 ${!shootClickPos ? "opacity-30 pointer-events-none grayscale blur-[1px]" : ""
                    }`}
                >
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

                            // Instant +1 or -1
                            const displacement = y - 0.5
                            if (Math.abs(displacement) > 0.05) {
                                const direction = displacement < 0 ? 1 : -1
                                setShot((prev) => {
                                    const next = prev + direction
                                    if (next < 0) return 0
                                    console.log(`[ScoreSlider] INSTANT ${direction > 0 ? '+' : ''}${direction}`)
                                    return next
                                })
                            }

                            // Start continuous increment after 150ms
                            const holdTimeout = setTimeout(() => {
                                setSliderActive(true)
                                console.log("[ScoreSlider] Hold threshold reached, starting continuous")
                            }, 150)

                            // Store timeout ID to clear on release
                            sliderTimeoutRef.current = holdTimeout
                        }}

                        onPointerUp={() => {
                            clearTimeout(sliderTimeoutRef.current)
                            setSliderActive(false)
                            sliderYRef.current = 0.5
                            setSliderY(0.5)
                        }}
                        onPointerMove={(e) => {
                            if (!sliderActive) return
                            const rect = sliderRef.current!.getBoundingClientRect()
                            const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
                            sliderYRef.current = y   // ref updates instantly for the rAF loop
                            setSliderY(y)             // state updates for visual rendering
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
                            className={`absolute left-1 right-1 h-10 rounded-xl transition-colors duration-100 flex items-center justify-center ${sliderActive
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
                                const msPerPoint = msFromMagnitude(mag)
                                const rate = 1000 / msPerPoint
                                const rateText = rate.toFixed(1)
                                if (sliderY > 0.5 && shot === 0) return "-0/s"
                                return sliderY < 0.5
                                    ? `+${rateText}/s`
                                    : `−${rateText}/s`
                            })()}
                        </span>
                        </div>
                    </div>

                    <span className="text-red-400 text-xs font-bold mt-1">− SUB</span>
                </div>

                {/* Climb controls — always reserves space to prevent layout shift */}
                <div className="flex flex-col gap-2 w-full max-w-[16rem] pt-2 border-t border-zinc-700"
                     style={{height: "5.5rem"}}
                >
                    {currentZone === "climb" ? (
                        <>

                            {/* Auto phase: L1 only, auto-recorded on zone entry */}
                            {matchPhase === "auto" && (
                                <div className="text-orange-400 text-xs font-bold text-center">
                                    Auto climb (L1) recorded
                                </div>
                            )}

                            {/* Teleop endgame: L1/L2/L3 selection - records immediately on click */}
                            {matchPhase === "teleop" && (
                                <div className="flex gap-2">
                                    {(["L1", "L2", "L3"] as const).map(level => {
                                        const lastClimb = [...actions].reverse().find(a => a.type === "climb") as ClimbAction | undefined
                                        const isSelected = lastClimb?.level === level
                                        return (
                                            <button
                                                key={level}
                                                onClick={() => {
                                                    setActions(prev => {
                                                        const lastClimbIdx = prev.findLastIndex(a => a.type === "climb")
                                                        if (lastClimbIdx !== -1) {
                                                            const updated = [...prev]
                                                            const existing = updated[lastClimbIdx] as ClimbAction
                                                            if (existing.level === level) {
                                                                // Deselect — remove climb action
                                                                updated.splice(lastClimbIdx, 1)
                                                                return updated
                                                            }
                                                            // Switch level on existing action
                                                            updated[lastClimbIdx] = {...existing, level}
                                                            return updated
                                                        }
                                                        // No climb action yet — create one
                                                        const now = Date.now()
                                                        return [...prev, {
                                                            type: "climb" as const,
                                                            timestamp: matchStartTime > 0 ? now - matchStartTime : 0,
                                                            level,
                                                            success: climbSuccess,
                                                            phase: matchPhase,
                                                            subPhase: subPhase?.phase ?? null,
                                                        }]
                                                    })
                                                }}
                                                className={`flex-1 h-10 rounded-lg text-sm font-bold transition-all ${
                                                    isSelected
                                                        ? "bg-orange-600 ring-2 ring-orange-400 text-white"
                                                        : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-600"
                                                }`}
                                            >
                                                {level}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}

                            {/* Success toggle - always visible in climb zone */}
                            <button
                                onClick={() => {
                                    const next = !climbSuccess
                                    setClimbSuccess(next)
                                    // Sync to existing climb action
                                    setActions(prev => {
                                        const lastClimbIdx = prev.findLastIndex(a => a.type === "climb")
                                        if (lastClimbIdx === -1) return prev
                                        const updated = [...prev]
                                        updated[lastClimbIdx] = {
                                            ...(updated[lastClimbIdx] as ClimbAction),
                                            success: next
                                        }
                                        return updated
                                    })
                                }}
                                className={`h-10 rounded-lg text-sm font-bold transition-all ${
                                    climbSuccess
                                        ? "bg-green-700 hover:bg-green-600 text-white"
                                        : "bg-red-800 hover:bg-red-700 text-red-200"
                                }`}
                            >
                                {climbSuccess ? "✓ SUCCESS" : "SUCCESS?"}
                            </button>
                        </>
                    ) : (
                        /* Empty placeholder — same reserved space, no content */
                        null
                    )}
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
                    <div className="flex-3 flex flex-col gap-3">{renderField()}{renderDebug()}</div>
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
                {renderDebug()}
                {renderControls()}
            </div>
        </div>
    )
}
