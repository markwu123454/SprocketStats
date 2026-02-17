import React, {useCallback, useEffect, useRef, useState} from "react"
import {getSettingSync} from "@/db/settingsDb"
import type {
    Actions,
    ClimbAction,
    ScoreAction,
    MatchPhase,
    MatchScoutingData,
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
// ---------------------------------------------------------------------------
const _FB_PAD = 0.015
const _FB_GAP_Y = 0.012
const _FB_GAP_X = 0.0075
const _FB_REGION = {x1: 0.35, y1: 0.020, x2: 0.987, y2: 0.978}
const _FB_INNER_W = (_FB_REGION.x2 - _FB_REGION.x1) - _FB_PAD * 2
const _FB_INNER_H = (_FB_REGION.y2 - _FB_REGION.y1) - _FB_PAD * 2
const _FB_BTN_W_from_x = (_FB_INNER_W - _FB_GAP_X * 2) / 3
// const _FB_BTN_H_from_x = _FB_BTN_W_from_x * 2
const _FB_BTN_H_from_y = (_FB_INNER_H - _FB_GAP_Y) / 2
const _FB_BTN_W_from_y = _FB_BTN_H_from_y / 2
const _FB_BTN_W = Math.min(_FB_BTN_W_from_x, _FB_BTN_W_from_y)
const _FB_BTN_H = _FB_BTN_W * 2
const _FB_GRID_W = _FB_BTN_W * 3 + _FB_GAP_X * 2
const _FB_GRID_H = _FB_BTN_H * 2 + _FB_GAP_Y
const _FB_OX = _FB_REGION.x1 + (_FB_REGION.x2 - _FB_REGION.x1 - _FB_GRID_W) / 2
const _FB_OY = _FB_REGION.y1 + (_FB_REGION.y2 - _FB_REGION.y1 - _FB_GRID_H) / 2

const FIELD_BUTTONS = {
    traversal: {
        x1: _FB_OX,
        y1: _FB_OY,
        x2: _FB_OX + _FB_BTN_W,
        y2: _FB_OY + _FB_BTN_H
    } as Rect,
    intake: {
        x1: _FB_OX + _FB_BTN_W + _FB_GAP_X,
        y1: _FB_OY,
        x2: _FB_OX + _FB_BTN_W * 2 + _FB_GAP_X,
        y2: _FB_OY + _FB_BTN_H
    } as Rect,
    passing: {
        x1: _FB_OX + _FB_BTN_W * 2 + _FB_GAP_X * 2,
        y1: _FB_OY,
        x2: _FB_OX + _FB_BTN_W * 3 + _FB_GAP_X * 2,
        y2: _FB_OY + _FB_BTN_H
    } as Rect,
    climb: {
        x1: _FB_OX,
        y1: _FB_OY + _FB_BTN_H + _FB_GAP_Y,
        x2: _FB_OX + _FB_BTN_W,
        y2: _FB_OY + _FB_BTN_H * 2 + _FB_GAP_Y
    } as Rect,
    defense: {
        x1: _FB_OX + _FB_BTN_W + _FB_GAP_X,
        y1: _FB_OY + _FB_BTN_H + _FB_GAP_Y,
        x2: _FB_OX + _FB_BTN_W * 2 + _FB_GAP_X,
        y2: _FB_OY + _FB_BTN_H * 2 + _FB_GAP_Y
    } as Rect,
    idle: {
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

    const teleopStart = betweenEnd
    const teleopEnd = teleopStart + TELEOP_DURATION
    if (matchElapsed < teleopEnd) {
        const teleopElapsed = matchElapsed - teleopStart
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
                         timerExpired,
                     }: {
    phase: MatchPhase
    subPhase: SubPhaseConfig | null
    subPhaseElapsed: number
    subPhaseTotal: number
    phaseRemaining: number
    flashing: boolean
    timerExpired?: boolean
}) {
    const getPhaseColor = () => {
        if (phase === "prestart") return "bg-zinc-700"
        if (phase === "auto") return "bg-blue-700"
        if (phase === "between") return "bg-yellow-700 animate-pulse"
        if (phase === "teleop") {
            if (timerExpired) return "bg-red-900"
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
            if (timerExpired) return "MATCH OVER — FINISH INPUTS"
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
        const clamped = Math.max(0, ms)
        const s = Math.floor(clamped / 1000)
        const t = Math.floor((clamped % 1000) / 100)
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
                        {!timerExpired && (
                            <span className="text-white font-mono text-base">
                                {fmt(subPhaseElapsed)} / {fmt(subPhaseTotal)}
                            </span>
                        )}
                        <span className={`font-mono text-xl font-bold ${timerExpired ? "text-red-300" : "text-white"}`}>
                            {timerExpired ? "0.0s" : fmt(phaseRemaining)}
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

    const alliance = (data.alliance || "red") as Alliance

    // Debug overrides
    const [debugAlliance, setDebugAlliance] = useState<Alliance>(alliance)
    const [debugOrientation, setDebugOrientation] = useState<string>(
        getSettingSync("field_orientation") ?? "0"
    )

    const effectiveAlliance = debug ? debugAlliance : alliance
    const effectiveOrientation = debug ? debugOrientation : (getSettingSync("field_orientation") ?? 0)

    // *** CENTRALIZED TIMING ***
    const [matchStartTime, setMatchStartTime] = useState(0)
    const [, forceUpdate] = useState(0)

    // Manual post-match transition: match timer expired but user hasn't clicked "Go to Post Match" yet
    const [manualPost, setManualPost] = useState(false)

    // Flash state
    const [flashing, setFlashing] = useState(false)
    const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const lastPhaseRef = useRef<MatchPhase>("prestart")
    const lastSubPhaseRef = useRef<SubPhaseName | null>(null)

    const isRedAlliance = effectiveAlliance === "red"
    const fieldFlip = effectiveOrientation === "180"
    const uiFlip = fieldFlip !== isRedAlliance
    const flip = fieldFlip

    // ---------------------------------------------------------------------------
    // Read actions and startPosition directly from data
    // ---------------------------------------------------------------------------
    const actions = data.actions
    const startPosition = data.startPosition // canonical (field) coords

    // Helpers to write directly into data
    const setActions = useCallback((updater: Actions[] | ((prev: Actions[]) => Actions[])) => {
        setData(d => {
            const newActions = typeof updater === "function" ? updater(d.actions) : updater
            if (d.actions === newActions) return d
            return {...d, actions: newActions}
        })
    }, [setData])

    const setStartPosition = useCallback((pos: { x: number; y: number } | null) => {
        setData(d => {
            if (JSON.stringify(d.startPosition) === JSON.stringify(pos)) return d
            return {...d, startPosition: pos}
        })
    }, [setData])

    // Screen-space start position (derived from canonical for display)
    const startPosScreen = startPosition
        ? {
            x: flip ? 1 - startPosition.x : startPosition.x,
            y: flip ? 1 - startPosition.y : startPosition.y,
        }
        : null

    // Local UI state (transient, not scouting data)
    const [currentZone, setCurrentZone] = useState<string | null>(null)
    const currentZoneRef = useRef<string | null>(null)

    // Score slider
    const [shot, setShot] = useState(0)
    const sliderRef = useRef<HTMLDivElement>(null)
    const [sliderActive, setSliderActive] = useState(false)
    const [sliderY, setSliderY] = useState(0.5)
    const sliderYRef = useRef(0.5)
    const shotRafRaf = useRef<number | null>(null)

    // Field interaction
    const [dragging, setDragging] = useState(false)

    const [climbSuccess, setClimbSuccess] = useState(false)

    // Shooting zone
    const [shootClickPos, setShootClickPos] = useState<{ x: number; y: number } | null>(null)
    const [draggingShootRobot, setDraggingShootRobot] = useState(false)

    const [shotPendingReset, setShotPendingReset] = useState(false)
    const [shotEditHint, setShotEditHint] = useState(false)

    const REEF_CENTER = {x: 0.285, y: 0.500}

    const mirrorRect = (r: Rect): Rect => ({
        x1: 1 - r.x2,
        y1: r.y1,
        x2: 1 - r.x1,
        y2: r.y2,
    })

    // *** DERIVE ALL TIMING FROM matchStartTime ***
    const now = Date.now()
    const matchElapsed = matchStartTime > 0 ? now - matchStartTime : 0
    const rawPhaseInfo = matchStartTime > 0 ? getPhaseInfo(matchElapsed) : {
        phase: "prestart" as MatchPhase,
        phaseElapsed: 0,
        phaseRemaining: 0,
        subPhase: null,
        subPhaseElapsed: 0,
        subPhaseTotal: 0,
    }

    // If the raw timer says "post" but the user hasn't manually transitioned yet,
    // keep the effective phase as "teleop" (endgame) so the field stays interactive.
    const timerExpired = rawPhaseInfo.phase === "post" && !manualPost
    const phaseInfo = timerExpired
        ? {
            phase: "teleop" as MatchPhase,
            phaseElapsed: TELEOP_DURATION,
            phaseRemaining: 0,
            subPhase: TELEOP_SEQUENCE[TELEOP_SEQUENCE.length - 1],
            subPhaseElapsed: TELEOP_SEQUENCE[TELEOP_SEQUENCE.length - 1].duration,
            subPhaseTotal: TELEOP_SEQUENCE[TELEOP_SEQUENCE.length - 1].duration,
        }
        : manualPost
            ? {
                phase: "post" as MatchPhase,
                phaseElapsed: 0,
                phaseRemaining: 0,
                subPhase: null,
                subPhaseElapsed: 0,
                subPhaseTotal: 0,
            }
            : rawPhaseInfo

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
            if (lastPhaseRef.current === "auto" && matchPhase === "between") {
                handleNext?.()
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
    // Flash when timer expires (transition to overtime)
    // ---------------------------------------------------------------------------
    const prevTimerExpiredRef = useRef(false)
    useEffect(() => {
        if (timerExpired && !prevTimerExpiredRef.current) {
            triggerFlash()
        }
        prevTimerExpiredRef.current = timerExpired
    }, [timerExpired, triggerFlash])

    // ---------------------------------------------------------------------------
    // Slider speed curve
    // ---------------------------------------------------------------------------
    const SLIDER_MAX_MS = 300
    const SLIDER_MIN_MS = 30
    const SLIDER_DEAD_ZONE = 0.05

    const msFromMagnitude = (magnitude: number): number => {
        const m = Math.min(1, Math.max(0, magnitude))
        return SLIDER_MIN_MS * Math.pow(SLIDER_MAX_MS / SLIDER_MIN_MS, 1 - m)
    }

    // ---------------------------------------------------------------------------
    // Score slider — rAF accumulator loop
    // ---------------------------------------------------------------------------
    useEffect(() => {
        if (!sliderActive) {
            if (shotRafRaf.current) {
                cancelAnimationFrame(shotRafRaf.current)
                shotRafRaf.current = null
            }
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

                let ticks = 0
                while (accumulator >= msPerPoint) {
                    accumulator -= msPerPoint
                    ticks += direction
                }

                if (ticks !== 0) {
                    setShot((prev) => {
                        const next = prev + ticks
                        if (next < 0) return 0
                        return next
                    })
                }
            } else {
                accumulator = 0
            }

            shotRafRaf.current = requestAnimationFrame(loop)
        }

        shotRafRaf.current = requestAnimationFrame(loop)

        return () => {
            if (shotRafRaf.current) {
                cancelAnimationFrame(shotRafRaf.current)
                shotRafRaf.current = null
            }
        }
    }, [sliderActive])

    // ---------------------------------------------------------------------------
    // Smooth timer (60 fps) — keep running during timerExpired overtime too
    // ---------------------------------------------------------------------------
    useEffect(() => {
        if (matchPhase === "prestart" || (matchPhase === "post" && !timerExpired)) return
        const id = setInterval(() => forceUpdate((n) => n + 1), 1000 / 60)
        return () => clearInterval(id)
    }, [matchPhase, timerExpired])

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
        if (flip) {
            x = 1 - x
            y = 1 - y
        }
        return {x, y}
    }

    // Helper: compute auto line X in screen space
    function getAutoLineX(): number {
        if (effectiveOrientation === "0") {
            return isRedAlliance ? 0.77 : 0.23
        } else {
            return isRedAlliance ? 0.225 : 0.77
        }
    }

    // Helper: convert screen coords to canonical (field) coords
    function screenToCanonical(screenX: number, screenY: number) {
        return {
            x: flip ? 1 - screenX : screenX,
            y: flip ? 1 - screenY : screenY,
        }
    }

    function handlePointerDown(e: React.PointerEvent) {
        if (matchPhase === "prestart") {
            const screenPos = getFieldPosScreen(e)
            const autoLineX = getAutoLineX()
            const canonical = screenToCanonical(autoLineX, screenPos.y)
            setStartPosition(canonical)
            setDragging(true)
            return
        }
        if (matchPhase === "auto" || matchPhase === "between" || matchPhase === "teleop") {
            const screenPos = getFieldPosScreen(e)
            const zone = uiFlip ? mirrorRect(ZONES.shootingFull) : ZONES.shootingFull
            if (
                screenPos.x >= zone.x1 &&
                screenPos.x <= zone.x2 &&
                screenPos.y >= zone.y1 &&
                screenPos.y <= zone.y2
            ) {
                if (shotPendingReset) {
                    setShot(0)
                    setShotPendingReset(false)
                    setShotEditHint(false)
                }
                const pos = getFieldPos(e)
                setShootClickPos({x: pos.x, y: pos.y})
                // Only create a new shooting action if not already in shooting zone;
                // otherwise just update position (robot drag start).
                if (currentZoneRef.current !== "shooting") {
                    handleZoneClick("shooting")
                }
                setDraggingShootRobot(true)
                ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
                return
            }
        }
    }

    function handlePointerMove(e: React.PointerEvent) {
        if (dragging && matchPhase === "prestart") {
            const screenPos = getFieldPosScreen(e)
            const autoLineX = getAutoLineX()
            const canonical = screenToCanonical(autoLineX, screenPos.y)
            setStartPosition(canonical)
            return
        }
        if (draggingShootRobot) {
            const screenPos = getFieldPosScreen(e)
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
    // Zone click handler — writes directly to data.actions via setData
    // ---------------------------------------------------------------------------
    const handleZoneClick = useCallback(
        (zoneName: string, opts?: { skipIfSameZone?: boolean }) => {
            const wasInZone = currentZoneRef.current === zoneName

            setCurrentZone(zoneName)
            currentZoneRef.current = zoneName

            // If we're already in this zone and the caller says to skip, don't create a new action.
            // This is used for shooting (dragging robot) and climb (changing level/success).
            if (wasInZone && opts?.skipIfSameZone) return

            const now = Date.now()

            if (zoneName === "climb") {
                setActions((prev) => [...prev,
                    {
                        type: "climb" as const,
                        timestamp: matchStartTime > 0 ? now - matchStartTime : 0,
                        level: "L1",
                        success: climbSuccess,
                        phase: matchPhase,
                        subPhase: subPhase?.phase ?? null,
                    }
                ])
            } else {
                const actionType = zoneName as "defense" | "traversal" | "idle" | "intake" | "shooting" | "passing" | "climb"
                setActions((prev) => [
                    ...prev,
                    {
                        type: actionType,
                        timestamp: matchStartTime > 0 ? now - matchStartTime : 0,
                        phase: matchPhase,
                        subPhase: subPhase?.phase ?? null,
                    } as Actions,
                ])
            }
        },
        [matchStartTime, matchPhase, subPhase, climbSuccess, setActions],
    )

    // ---------------------------------------------------------------------------
    // Start match — writes starting action directly to data
    // ---------------------------------------------------------------------------
    const handleStartMatch = () => {
        const now = Date.now()
        setMatchStartTime(now)
        lastPhaseRef.current = "auto"
        lastSubPhaseRef.current = "auto"
        if (startPosition) {
            setActions([{type: "starting", x: startPosition.x, y: startPosition.y}])
        }
        handleNext?.()
    }

    // ---------------------------------------------------------------------------
    // Keep the last ScoreAction in sync when shot is edited during hint period
    // ---------------------------------------------------------------------------
    useEffect(() => {
        if (!shotEditHint) return
        setActions((prev) => {
            const lastScoreIdx = (() => {
                for (let i = prev.length - 1; i >= 0; i--) {
                    if (prev[i].type === "score") return i
                }
                return -1
            })()
            if (lastScoreIdx === -1) return prev
            const action = prev[lastScoreIdx] as ScoreAction
            if (action.score === shot) return prev
            const updated = [...prev]
            updated[lastScoreIdx] = {...action, score: shot}
            return updated
        })
    }, [shot, shotEditHint, setActions])

    // View helpers
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
        >
            <img
                src="/seasons/2026/field-lovat.png"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                alt="field"
                style={{transform: flip ? "rotate(180deg)" : "none"}}
            />

            {showZones && (
                <>
                    {/* Shooting zone */}
                    {(() => {
                        const zone = uiFlip ? mirrorRect(ZONES.shootingFull) : ZONES.shootingFull
                        const left = zone.x1
                        const top = zone.y1
                        const width = zone.x2 - zone.x1
                        const height = zone.y2 - zone.y1
                        const isActive = currentZone === "shooting"
                        return (
                            <button
                                onPointerDown={(e) => {
                                    // Stop this from bubbling to the parent handlePointerDown
                                    // so we don't get double handling. We handle everything here.
                                    e.stopPropagation()
                                    if (shotPendingReset) {
                                        setShot(0)
                                        setShotPendingReset(false)
                                        setShotEditHint(false)
                                    }
                                    if (!fieldRef.current) return
                                    const rect = fieldRef.current.getBoundingClientRect()
                                    let nx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
                                    let ny = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
                                    if (flip) {
                                        nx = 1 - nx;
                                        ny = 1 - ny
                                    }
                                    setShootClickPos({x: nx, y: ny})
                                    handleZoneClick("shooting")
                                    setDraggingShootRobot(true)
                                    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
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

                    {/* Field Buttons */}
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

            {/* Starting position indicator — uses screen-space derived from canonical */}
            {matchPhase === "prestart" && startPosScreen && (
                <div
                    className="absolute"
                    style={{
                        width: "3.75%",
                        height: "7.5%",
                        left: `${startPosScreen.x * 100}%`,
                        top: `${startPosScreen.y * 100}%`,
                        transform: "translate(-50%, -50%)",
                    }}
                >
                    <div className="absolute inset-[6%] rounded-xs bg-zinc-600/50"/>
                    <div
                        className={`absolute inset-[-12%] rounded-xs border-6 ${effectiveAlliance === "red"
                            ? "border-red-700"
                            : "border-blue-700"
                        }`}
                    />
                </div>
            )}

            {/* Shooting zone: yellow dot trail */}
            {showZones && shootClickPos && (() => {
                const reefCenter = effectiveAlliance === "red"
                    ? {x: 1 - REEF_CENTER.x, y: REEF_CENTER.y}
                    : REEF_CENTER
                const sx = viewX(shootClickPos.x)
                const sy = viewY(shootClickPos.y)
                const cx = viewX(reefCenter.x)
                const cy = viewY(reefCenter.y)
                const dx = cx - sx
                const dy = cy - sy
                const dist = Math.sqrt((dx * 2) ** 2 + dy ** 2)
                const ballDiameter = 0.0167 * 1.5
                const count = Math.max(0, Math.floor(dist / ballDiameter))
                const balls: React.ReactNode[] = []
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

                const angle = Math.atan2(dy, dx * 2) * (180 / Math.PI)

                return (
                    <>
                        {balls}
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
                            <div
                                className={`absolute inset-[6%] rounded-xs border-2 ${draggingShootRobot
                                    ? "bg-zinc-500/60 border-zinc-600"
                                    : "bg-zinc-600/50 border-zinc-800"
                                }`}
                            />
                            <div
                                className={`absolute inset-[-12%] rounded-xs border-6 ${effectiveAlliance === "red"
                                    ? "border-red-700"
                                    : "border-blue-700"
                                }`}
                            />
                        </div>
                    </>
                )
            })()}
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
                        disabled={!startPosition}
                        className={`h-20 rounded-xl text-2xl font-bold transition-colors ${startPosition
                            ? "bg-green-700 hover:bg-green-600"
                            : "bg-zinc-800 opacity-40 cursor-not-allowed"
                        }`}
                    >
                        {startPosition ? "START MATCH ▶" : "Set starting position first"}
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
                            handleSubmit?.()
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
                <div className="text-white text-3xl font-bold font-mono">
                    Shot: {shot}
                </div>

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

                <div
                    className={`relative flex flex-col items-center select-none flex-1 w-full max-w-[16rem] transition-all duration-300 ${!shootClickPos ? "opacity-30 pointer-events-none grayscale blur-[1px]" : ""
                    }`}
                >
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

                            const displacement = y - 0.5
                            if (Math.abs(displacement) > 0.05) {
                                const direction = displacement < 0 ? 1 : -1
                                setShot((prev) => {
                                    const next = prev + direction
                                    if (next < 0) return 0
                                    return next
                                })
                            }

                            sliderTimeoutRef.current = setTimeout(() => {
                                setSliderActive(true)
                            }, 150)
                        }}

                        onPointerUp={() => {
                            if (sliderTimeoutRef.current) clearTimeout(sliderTimeoutRef.current)
                            setSliderActive(false)
                            sliderYRef.current = 0.5
                            setSliderY(0.5)
                        }}
                        onPointerMove={(e) => {
                            if (!sliderActive) return
                            const rect = sliderRef.current!.getBoundingClientRect()
                            const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
                            sliderYRef.current = y
                            setSliderY(y)
                        }}
                        onPointerLeave={() => {
                            if (sliderActive) {
                                setSliderActive(false)
                                sliderYRef.current = 0.5
                                setSliderY(0.5)
                            }
                        }}
                    >
                        <div
                            className="absolute left-0 right-0 border-t-2 border-dashed border-zinc-400/50"
                            style={{top: "50%"}}
                        />

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

                {/* Climb controls */}
                <div className="flex flex-col gap-2 w-full max-w-[16rem] pt-2 border-t border-zinc-700"
                     style={{height: "5.5rem"}}
                >
                    {currentZone === "climb" ? (
                        <>
                            {matchPhase === "auto" && (
                                <div className="text-orange-400 text-xs font-bold text-center">
                                    Auto climb (L1) recorded
                                </div>
                            )}

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
                                                        const lastClimbIdx = (() => {
                                                            for (let i = prev.length - 1; i >= 0; i--) {
                                                                if (prev[i].type === "climb") return i
                                                            }
                                                            return -1
                                                        })()
                                                        if (lastClimbIdx !== -1) {
                                                            const updated = [...prev]
                                                            const existing = updated[lastClimbIdx] as ClimbAction
                                                            if (existing.level === level) {
                                                                updated.splice(lastClimbIdx, 1)
                                                                return updated
                                                            }
                                                            updated[lastClimbIdx] = {...existing, level}
                                                            return updated
                                                        }
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

                            <button
                                onClick={() => {
                                    const next = !climbSuccess
                                    setClimbSuccess(next)
                                    setActions(prev => {
                                        const lastClimbIdx = (() => {
                                            for (let i = prev.length - 1; i >= 0; i--) {
                                                if (prev[i].type === "climb") return i
                                            }
                                            return -1
                                        })()
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
                    ) : null}
                </div>

                {/* "Go to Post Match" button — appears when timer has expired */}
                {timerExpired && (
                    <button
                        onClick={() => {
                            setManualPost(true)
                            handleNext?.()
                        }}
                        className="w-full max-w-[16rem] h-14 rounded-xl text-lg font-bold bg-amber-600 hover:bg-amber-500 text-white transition-colors animate-pulse"
                    >
                        GO TO POST MATCH →
                    </button>
                )}
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
                    timerExpired={timerExpired}
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
                timerExpired={timerExpired}
            />
            <div className="flex-1 flex flex-col p-2 gap-4 overflow-y-auto">
                {renderField()}
                {renderDebug()}
                {renderControls()}
            </div>
        </div>
    )
}
