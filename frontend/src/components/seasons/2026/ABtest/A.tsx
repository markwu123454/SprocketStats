import React, {useCallback, useEffect, useRef, useState} from "react"
import {getSettingSync} from "@/db/settingsDb"
import useFeatureFlags from "@/hooks/useFeatureFlags.ts";
import type {
    Actions,
    ClimbAction,
    ScoreAction,
    MatchPhase,
    MatchScoutingData,
    SubPhaseName
} from "../yearConfig"
import type {Phase} from "@/types";

type Alliance = "red" | "blue"

interface SubPhaseConfig {
    phase: SubPhaseName
    duration: number
}

const TELEOP_SEQUENCE: SubPhaseConfig[] = [
    {phase: "transition", duration: 1000},
    {phase: "shift_1", duration: 2500},
    {phase: "shift_2", duration: 2500},
    {phase: "shift_3", duration: 2500},
    {phase: "shift_4", duration: 2500},
    {phase: "endgame", duration: 3000},
]

const AUTO_DURATION = 2000
const BETWEEN_DURATION = 300
const TELEOP_DURATION = TELEOP_SEQUENCE.reduce((s, c) => s + c.duration, 0)

type Rect = { x1: number; y1: number; x2: number; y2: number }

const ZONES = {
    neutral: {x1: 0.322, y1: 0.020, x2: 0.674, y2: 0.978},
    transitionLeft: {x1: 0.247, y1: 0.020, x2: 0.323, y2: 0.978},
    transitionRight: {x1: 0.673, y1: 0.020, x2: 0.756, y2: 0.978},
    shootingFull: {x1: 0.013, y1: 0.020, x2: 0.246, y2: 0.978},
} as const

const _FB_PAD = 0.015
const _FB_GAP_Y = 0.012
const _FB_GAP_X = 0.0075
const _FB_REGION = {x1: 0.35, y1: 0.020, x2: 0.987, y2: 0.978}
const _FB_INNER_W = (_FB_REGION.x2 - _FB_REGION.x1) - _FB_PAD * 2
const _FB_INNER_H = (_FB_REGION.y2 - _FB_REGION.y1) - _FB_PAD * 2
const _FB_BTN_W_from_x = (_FB_INNER_W - _FB_GAP_X * 2) / 3
const _FB_BTN_H_from_y = (_FB_INNER_H - _FB_GAP_Y) / 2
const _FB_BTN_W_from_y = _FB_BTN_H_from_y / 2
const _FB_BTN_W = Math.min(_FB_BTN_W_from_x, _FB_BTN_W_from_y)
const _FB_BTN_H = _FB_BTN_W * 2
const _FB_GRID_W = _FB_BTN_W * 3 + _FB_GAP_X * 2
const _FB_GRID_H = _FB_BTN_H * 2 + _FB_GAP_Y
const _FB_OX = _FB_REGION.x1 + (_FB_REGION.x2 - _FB_REGION.x1 - _FB_GRID_W) / 2
const _FB_OY = _FB_REGION.y1 + (_FB_REGION.y2 - _FB_REGION.y1 - _FB_GRID_H) / 2

const FIELD_BUTTONS = {
    traversal: {x1: _FB_OX, y1: _FB_OY, x2: _FB_OX + _FB_BTN_W, y2: _FB_OY + _FB_BTN_H} as Rect,
    intake: {x1: _FB_OX + _FB_BTN_W + _FB_GAP_X, y1: _FB_OY, x2: _FB_OX + _FB_BTN_W * 2 + _FB_GAP_X, y2: _FB_OY + _FB_BTN_H} as Rect,
    passing: {x1: _FB_OX + _FB_BTN_W * 2 + _FB_GAP_X * 2, y1: _FB_OY, x2: _FB_OX + _FB_BTN_W * 3 + _FB_GAP_X * 2, y2: _FB_OY + _FB_BTN_H} as Rect,
    climb: {x1: _FB_OX, y1: _FB_OY + _FB_BTN_H + _FB_GAP_Y, x2: _FB_OX + _FB_BTN_W, y2: _FB_OY + _FB_BTN_H * 2 + _FB_GAP_Y} as Rect,
    defense: {x1: _FB_OX + _FB_BTN_W + _FB_GAP_X, y1: _FB_OY + _FB_BTN_H + _FB_GAP_Y, x2: _FB_OX + _FB_BTN_W * 2 + _FB_GAP_X, y2: _FB_OY + _FB_BTN_H * 2 + _FB_GAP_Y} as Rect,
    idle: {x1: _FB_OX + _FB_BTN_W * 2 + _FB_GAP_X * 2, y1: _FB_OY + _FB_BTN_H + _FB_GAP_Y, x2: _FB_OX + _FB_BTN_W * 3 + _FB_GAP_X * 2, y2: _FB_OY + _FB_BTN_H * 2 + _FB_GAP_Y} as Rect,
} as const

// ---------------------------------------------------------------------------
// Phase info helper
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
        return {phase: "auto", phaseElapsed: matchElapsed, phaseRemaining: AUTO_DURATION - matchElapsed, subPhase: {phase: "auto", duration: AUTO_DURATION}, subPhaseElapsed: matchElapsed, subPhaseTotal: AUTO_DURATION}
    }
    const betweenStart = AUTO_DURATION
    const betweenEnd = betweenStart + BETWEEN_DURATION
    if (matchElapsed < betweenEnd) {
        const elapsed = matchElapsed - betweenStart
        return {phase: "between", phaseElapsed: elapsed, phaseRemaining: BETWEEN_DURATION - elapsed, subPhase: null, subPhaseElapsed: elapsed, subPhaseTotal: BETWEEN_DURATION}
    }
    const teleopStart = betweenEnd
    const teleopEnd = teleopStart + TELEOP_DURATION
    if (matchElapsed < teleopEnd) {
        const teleopElapsed = matchElapsed - teleopStart
        let cumulative = 0
        for (const sp of TELEOP_SEQUENCE) {
            if (teleopElapsed < cumulative + sp.duration) {
                return {phase: "teleop", phaseElapsed: teleopElapsed, phaseRemaining: TELEOP_DURATION - teleopElapsed, subPhase: sp, subPhaseElapsed: teleopElapsed - cumulative, subPhaseTotal: sp.duration}
            }
            cumulative += sp.duration
        }
        const lastSp = TELEOP_SEQUENCE[TELEOP_SEQUENCE.length - 1]
        return {phase: "teleop", phaseElapsed: teleopElapsed, phaseRemaining: 0, subPhase: lastSp, subPhaseElapsed: lastSp.duration, subPhaseTotal: lastSp.duration}
    }
    return {phase: "post", phaseElapsed: 0, phaseRemaining: 0, subPhase: null, subPhaseElapsed: 0, subPhaseTotal: 0}
}

// ---------------------------------------------------------------------------
// HeaderStrip
// ---------------------------------------------------------------------------
function HeaderStrip({phase, subPhase, subPhaseElapsed, subPhaseTotal, phaseRemaining, flashing, timerExpired}: {
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
                auto: "AUTO", transition: "TELEOP — TRANSITION",
                shift_1: "TELEOP — SHIFT 1", shift_2: "TELEOP — SHIFT 2",
                shift_3: "TELEOP — SHIFT 3", shift_4: "TELEOP — SHIFT 4",
                endgame: "TELEOP — ENDGAME",
            }
            return labels[subPhase.phase] ?? "TELEOP"
        }
        if (phase === "post") return "POST-MATCH"
        return ""
    }

    const fmt = (ms: number) => {
        const s = Math.floor(Math.max(0, ms) / 1000)
        const t = Math.floor((Math.max(0, ms) % 1000) / 100)
        return `${s}.${t}s`
    }

    return (
        <div
            className={`w-full p-3 transition-colors duration-300 ${getPhaseColor()}`}
            style={{transition: "filter 0.15s ease-out, background-color 0.3s", filter: flashing ? "brightness(1.6)" : "brightness(1)"}}
        >
            <div className="flex justify-between items-center">
                <span className="text-white font-bold text-lg">{getPhaseLabel()}</span>
                {phase !== "prestart" && phase !== "post" && (
                    <div className="flex gap-4 items-center">
                        {!timerExpired && (
                            <span className="text-white font-mono text-base">{fmt(subPhaseElapsed)} / {fmt(subPhaseTotal)}</span>
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
// useSlider — reusable rAF accumulator for score sliders
// ---------------------------------------------------------------------------
const SLIDER_MAX_MS = 300
const SLIDER_MIN_MS = 30
const SLIDER_DEAD_ZONE = 0.05

function msFromMagnitude(magnitude: number): number {
    const m = Math.min(1, Math.max(0, magnitude))
    return SLIDER_MIN_MS * Math.pow(SLIDER_MAX_MS / SLIDER_MIN_MS, 1 - m)
}

function useSlider(onChange: (delta: number) => void) {
    const sliderRef = useRef<HTMLDivElement>(null)
    const [active, setActive] = useState(false)
    const [y, setY] = useState(0.5)
    const yRef = useRef(0.5)
    const activeRef = useRef(false)
    const rafRef = useRef<number | null>(null)
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Keep activeRef in sync so the rAF loop can read it without stale closure
    useEffect(() => { activeRef.current = active }, [active])

    useEffect(() => {
        if (!active) {
            if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
            return
        }
        let accumulator = 0
        let lastTime = performance.now()

        const loop = (now: number) => {
            const dt = now - lastTime
            lastTime = now
            const displacement = yRef.current - 0.5
            if (Math.abs(displacement) > SLIDER_DEAD_ZONE) {
                const direction = displacement < 0 ? 1 : -1
                const magnitude = (Math.abs(displacement) - SLIDER_DEAD_ZONE) / (0.5 - SLIDER_DEAD_ZONE)
                accumulator += dt
                let ticks = 0
                const msPerPoint = msFromMagnitude(magnitude)
                while (accumulator >= msPerPoint) { accumulator -= msPerPoint; ticks += direction }
                if (ticks !== 0) onChange(ticks)
            } else {
                accumulator = 0
            }
            rafRef.current = requestAnimationFrame(loop)
        }
        rafRef.current = requestAnimationFrame(loop)
        return () => { if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null } }
    }, [active, onChange])

    const reset = useCallback(() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        setActive(false)
        yRef.current = 0.5
        setY(0.5)
    }, [])

    const handlers = {
        onPointerDown: (e: React.PointerEvent) => {
            e.preventDefault()
            ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
            const rect = sliderRef.current!.getBoundingClientRect()
            const ny = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
            yRef.current = ny
            setY(ny)
            const displacement = ny - 0.5
            if (Math.abs(displacement) > SLIDER_DEAD_ZONE) {
                onChange(displacement < 0 ? 1 : -1)
            }
            timeoutRef.current = setTimeout(() => setActive(true), 150)
        },
        onPointerUp: reset,
        onPointerLeave: () => { if (activeRef.current) reset() },
        onPointerMove: (e: React.PointerEvent) => {
            if (!activeRef.current) return
            const rect = sliderRef.current!.getBoundingClientRect()
            const ny = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
            yRef.current = ny
            setY(ny)
        },
    }

    return {sliderRef, active, y, handlers}
}

// ---------------------------------------------------------------------------
// ScoreSlider component
// ---------------------------------------------------------------------------
function ScoreSlider({
    value,
    onChange,
    label,
    addLabel = "+ ADD",
    subLabel = "− SUB",
    disabled = false,
}: {
    value: number
    onChange: (delta: number) => void
    label: string
    addLabel?: string
    subLabel?: string
    disabled?: boolean
}) {
    const {sliderRef, active, y, handlers} = useSlider(onChange)

    return (
        <div className={`relative flex flex-col items-center select-none flex-1 w-full max-w-[16rem] transition-all duration-300 ${disabled ? "opacity-30 pointer-events-none grayscale blur-[1px]" : ""}`}>
            <span className="text-zinc-400 text-xs font-semibold mb-0.5">{label}</span>
            <span className="text-green-400 text-xs font-bold mb-1">{addLabel}</span>
            <div
                ref={sliderRef}
                className="relative w-full flex-1 bg-zinc-800 rounded-2xl border-2 border-zinc-600 overflow-hidden touch-none"
                {...handlers}
            >
                <div className="absolute left-0 right-0 border-t-2 border-dashed border-zinc-400/50" style={{top: "50%"}}/>
                <div
                    className={`absolute left-1 right-1 h-10 rounded-xl transition-colors duration-100 flex items-center justify-center ${
                        active
                            ? y < 0.45 ? "bg-green-500 shadow-lg shadow-green-500/30"
                            : y > 0.55 ? "bg-red-500 shadow-lg shadow-red-500/30"
                            : "bg-zinc-400"
                            : "bg-zinc-500"
                    }`}
                    style={{top: `${y * 100}%`, transform: "translateY(-50%)", pointerEvents: "none"}}
                >
                    <span className="text-white text-xs font-bold">
                        {(() => {
                            if (!active) return "▲▼"
                            const disp = Math.abs(y - 0.5)
                            if (disp < SLIDER_DEAD_ZONE) return "—"
                            const mag = (disp - SLIDER_DEAD_ZONE) / (0.5 - SLIDER_DEAD_ZONE)
                            const rate = (1000 / msFromMagnitude(mag)).toFixed(1)
                            if (y > 0.5 && value === 0) return "-0/s"
                            return y < 0.5 ? `+${rate}/s` : `−${rate}/s`
                        })()}
                    </span>
                </div>
            </div>
            <span className="text-red-400 text-xs font-bold mt-1">{subLabel}</span>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function MatchScouting({data, setData, handleSubmit, setPhase}: {
    data: MatchScoutingData
    setData: React.Dispatch<React.SetStateAction<MatchScoutingData>>
    handleSubmit: () => void
    setPhase: (targetPhase: Phase) => Promise<void>
}) {
    const deviceType = getSettingSync("match_scouting_device_type") ?? "mobile"
    const debug = getSettingSync("debug") === true
    const fieldRef = useRef<HTMLDivElement>(null)

    const featureFlags = useFeatureFlags()

    const alliance = (data.alliance || "red") as Alliance

    const [debugAlliance, setDebugAlliance] = useState<Alliance>(alliance)
    const [debugOrientation, setDebugOrientation] = useState<string>(getSettingSync("field_orientation") ?? "0")

    const effectiveAlliance = debug ? debugAlliance : alliance
    const effectiveOrientation = debug ? debugOrientation : (getSettingSync("field_orientation") ?? 0)

    const [matchStartTime, setMatchStartTime] = useState(0)
    const [, forceUpdate] = useState(0)
    const [manualPost, setManualPost] = useState(false)
    const [flashing, setFlashing] = useState(false)
    const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const lastPhaseRef = useRef<MatchPhase>("prestart")
    const lastSubPhaseRef = useRef<SubPhaseName | null>(null)

    const isRedAlliance = effectiveAlliance === "red"
    const fieldFlip = effectiveOrientation === "180"
    const uiFlip = fieldFlip !== isRedAlliance
    const flip = fieldFlip

    const actions = data.actions
    const startPosition = data.startPosition

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

    const startPosScreen = startPosition
        ? {x: flip ? 1 - startPosition.x : startPosition.x, y: flip ? 1 - startPosition.y : startPosition.y}
        : null

    const [currentZone, setCurrentZone] = useState<string | null>(null)
    const currentZoneRef = useRef<string | null>(null)

    // Shot (attempted) counter
    const [shot, setShot] = useState(0)
    // Shot made counter (feature-flagged)
    const [shotMade, setShotMade] = useState(0)

    const [sliderActive, setSliderActive] = useState(false)
    const [dragging, setDragging] = useState(false)
    const [climbSuccess, setClimbSuccess] = useState(false)
    const [shootClickPos, setShootClickPos] = useState<{ x: number; y: number } | null>(null)
    const [draggingShootRobot, setDraggingShootRobot] = useState(false)
    const [shotPendingReset, setShotPendingReset] = useState(false)
    const [shotEditHint, setShotEditHint] = useState(false)

    const REEF_CENTER = {x: 0.285, y: 0.500}
    const mirrorRect = (r: Rect): Rect => ({x1: 1 - r.x2, y1: r.y1, x2: 1 - r.x1, y2: r.y2})

    // ---------------------------------------------------------------------------
    // Phase derivation
    // ---------------------------------------------------------------------------
    const now = Date.now()
    const matchElapsed = matchStartTime > 0 ? now - matchStartTime : 0
    const rawPhaseInfo = matchStartTime > 0 ? getPhaseInfo(matchElapsed) : {
        phase: "prestart" as MatchPhase, phaseElapsed: 0, phaseRemaining: 0,
        subPhase: null, subPhaseElapsed: 0, subPhaseTotal: 0,
    }

    const timerExpired = rawPhaseInfo.phase === "post" && !manualPost
    const phaseInfo = timerExpired
        ? {phase: "teleop" as MatchPhase, phaseElapsed: TELEOP_DURATION, phaseRemaining: 0, subPhase: TELEOP_SEQUENCE[TELEOP_SEQUENCE.length - 1], subPhaseElapsed: TELEOP_SEQUENCE[TELEOP_SEQUENCE.length - 1].duration, subPhaseTotal: TELEOP_SEQUENCE[TELEOP_SEQUENCE.length - 1].duration}
        : manualPost
            ? {phase: "post" as MatchPhase, phaseElapsed: 0, phaseRemaining: 0, subPhase: null, subPhaseElapsed: 0, subPhaseTotal: 0}
            : rawPhaseInfo

    const matchPhase = phaseInfo.phase
    const subPhase = phaseInfo.subPhase
    const subPhaseElapsed = phaseInfo.subPhaseElapsed
    const subPhaseTotal = phaseInfo.subPhaseTotal
    const phaseRemaining = phaseInfo.phaseRemaining

    // ---------------------------------------------------------------------------
    // Flash
    // ---------------------------------------------------------------------------
    const triggerFlash = useCallback(() => {
        if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
        setFlashing(true)
        flashTimeoutRef.current = setTimeout(() => setFlashing(false), 350)
    }, [])

    useEffect(() => () => { if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current) }, [])

    useEffect(() => {
        if (matchPhase !== lastPhaseRef.current) {
            if (lastPhaseRef.current !== "prestart") triggerFlash()
            if (lastPhaseRef.current === "auto" && matchPhase === "between") void setPhase("teleop")
            lastPhaseRef.current = matchPhase
        }
        const currentSubPhaseName = subPhase?.phase ?? null
        if (currentSubPhaseName !== lastSubPhaseRef.current) {
            if (lastSubPhaseRef.current !== null) triggerFlash()
            lastSubPhaseRef.current = currentSubPhaseName
        }
    }, [matchPhase, subPhase])

    const prevTimerExpiredRef = useRef(false)
    useEffect(() => {
        if (timerExpired && !prevTimerExpiredRef.current) triggerFlash()
        prevTimerExpiredRef.current = timerExpired
    }, [timerExpired, triggerFlash])

    // ---------------------------------------------------------------------------
    // Smooth timer
    // ---------------------------------------------------------------------------
    useEffect(() => {
        if (matchPhase === "prestart" || (matchPhase === "post" && !timerExpired)) return
        const id = setInterval(() => forceUpdate((n) => n + 1), 1000 / 60)
        return () => clearInterval(id)
    }, [matchPhase, timerExpired])

    // ---------------------------------------------------------------------------
    // Slider onChange callbacks (stable references via useCallback)
    // ---------------------------------------------------------------------------
    const handleShotChange = useCallback((delta: number) => {
        setShot(prev => Math.max(0, prev + delta))
    }, [])

    const handleShotMadeChange = useCallback((delta: number) => {
        setShotMade(prev => Math.max(0, prev + delta))
    }, [])

    // ---------------------------------------------------------------------------
    // Field pointer handlers
    // ---------------------------------------------------------------------------
    function getFieldPosScreen(e: React.PointerEvent) {
        if (!fieldRef.current) return {x: 0, y: 0}
        const rect = fieldRef.current.getBoundingClientRect()
        return {
            x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
            y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
        }
    }

    function getFieldPos(e: React.PointerEvent) {
        const {x, y} = getFieldPosScreen(e)
        return {x: flip ? 1 - x : x, y: flip ? 1 - y : y}
    }

    function getAutoLineX(): number {
        if (effectiveOrientation === "0") return isRedAlliance ? 0.77 : 0.23
        return isRedAlliance ? 0.225 : 0.77
    }

    function screenToCanonical(screenX: number, screenY: number) {
        return {x: flip ? 1 - screenX : screenX, y: flip ? 1 - screenY : screenY}
    }

    function handlePointerDown(e: React.PointerEvent) {
        if (matchPhase === "prestart") {
            const {y} = getFieldPosScreen(e)
            setStartPosition(screenToCanonical(getAutoLineX(), y))
            setDragging(true)
            return
        }
        if (matchPhase === "auto" || matchPhase === "between" || matchPhase === "teleop") {
            const screenPos = getFieldPosScreen(e)
            const zone = uiFlip ? mirrorRect(ZONES.shootingFull) : ZONES.shootingFull
            if (screenPos.x >= zone.x1 && screenPos.x <= zone.x2 && screenPos.y >= zone.y1 && screenPos.y <= zone.y2) {
                if (shotPendingReset) { setShot(0); setShotPendingReset(false); setShotEditHint(false) }
                const pos = getFieldPos(e)
                setShootClickPos({x: pos.x, y: pos.y})
                if (currentZoneRef.current !== "shooting") handleZoneClick("shooting")
                setDraggingShootRobot(true)
                ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
            }
        }
    }

    function handlePointerMove(e: React.PointerEvent) {
        if (dragging && matchPhase === "prestart") {
            const {y} = getFieldPosScreen(e)
            setStartPosition(screenToCanonical(getAutoLineX(), y))
            return
        }
        if (draggingShootRobot) {
            const screenPos = getFieldPosScreen(e)
            const zone = uiFlip ? mirrorRect(ZONES.shootingFull) : ZONES.shootingFull
            setShootClickPos({
                x: flip ? 1 - Math.min(zone.x2, Math.max(zone.x1, screenPos.x)) : Math.min(zone.x2, Math.max(zone.x1, screenPos.x)),
                y: flip ? 1 - Math.min(zone.y2, Math.max(zone.y1, screenPos.y)) : Math.min(zone.y2, Math.max(zone.y1, screenPos.y)),
            })
        }
    }

    function handlePointerUp() { setDragging(false); setDraggingShootRobot(false) }

    // ---------------------------------------------------------------------------
    // Zone click
    // ---------------------------------------------------------------------------
    const handleZoneClick = useCallback((zoneName: string, opts?: { skipIfSameZone?: boolean }) => {
        const wasInZone = currentZoneRef.current === zoneName
        setCurrentZone(zoneName)
        currentZoneRef.current = zoneName
        if (wasInZone && opts?.skipIfSameZone) return

        const ts = matchStartTime > 0 ? Date.now() - matchStartTime : 0
        if (zoneName === "climb") {
            setActions(prev => [...prev, {type: "climb" as const, timestamp: ts, level: "L1", success: climbSuccess, phase: matchPhase, subPhase: subPhase?.phase ?? null}])
        } else {
            setActions(prev => [...prev, {type: zoneName, timestamp: ts, phase: matchPhase, subPhase: subPhase?.phase ?? null} as Actions])
        }
    }, [matchStartTime, matchPhase, subPhase, climbSuccess, setActions])

    // ---------------------------------------------------------------------------
    // Start match
    // ---------------------------------------------------------------------------
    const handleStartMatch = () => {
        setMatchStartTime(Date.now())
        lastPhaseRef.current = "auto"
        lastSubPhaseRef.current = "auto"
        if (startPosition) setActions([{type: "starting", x: startPosition.x, y: startPosition.y}])
    }

    // ---------------------------------------------------------------------------
    // Sync last ScoreAction while edit hint is active
    // ---------------------------------------------------------------------------
    useEffect(() => {
        if (!shotEditHint) return
        setActions(prev => {
            const idx = [...prev].reverse().findIndex(a => a.type === "score")
            if (idx === -1) return prev
            const realIdx = prev.length - 1 - idx
            const action = prev[realIdx] as ScoreAction
            if (action.score === shot && (!featureFlags.shotMadeSlider || (action as any).shotMade === shotMade)) return prev
            const updated = [...prev]
            updated[realIdx] = {
                ...action,
                score: shot,
                ...(featureFlags.shotMadeSlider ? {shotMade} : {}),
            }
            return updated
        })
    }, [shot, shotMade, shotEditHint, setActions, featureFlags.shotMadeSlider])

    const viewX = (v: number) => flip ? 1 - v : v
    const viewY = (v: number) => flip ? 1 - v : v
    const showZones = matchPhase === "auto" || matchPhase === "between" || matchPhase === "teleop"

    // ---------------------------------------------------------------------------
    // Field render
    // ---------------------------------------------------------------------------
    const renderField = () => (
        <div
            ref={fieldRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => { setDragging(false); setDraggingShootRobot(false) }}
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
                        const isActive = currentZone === "shooting"
                        return (
                            <button
                                onPointerDown={(e) => {
                                    e.stopPropagation()
                                    if (shotPendingReset) { setShot(0); setShotPendingReset(false); setShotEditHint(false) }
                                    if (!fieldRef.current) return
                                    const rect = fieldRef.current.getBoundingClientRect()
                                    let nx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
                                    let ny = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
                                    if (flip) { nx = 1 - nx; ny = 1 - ny }
                                    setShootClickPos({x: nx, y: ny})
                                    handleZoneClick("shooting")
                                    setDraggingShootRobot(true)
                                    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
                                }}
                                className={`absolute rounded transition-all duration-200 border-2 ${isActive ? "bg-green-500/15 border-green-500" : "bg-transparent border-zinc-500"}`}
                                style={{left: `${zone.x1 * 100}%`, top: `${zone.y1 * 100}%`, width: `${(zone.x2 - zone.x1) * 100}%`, height: `${(zone.y2 - zone.y1) * 100}%`}}
                            />
                        )
                    })()}

                    {/* Field buttons */}
                    {(([
                        {key: "traversal", rect: FIELD_BUTTONS.traversal, label: "Traversal", borderColor: "#a855f7", bgActive: "rgba(168, 85, 247, 0.25)", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>},
                        {key: "intake", rect: FIELD_BUTTONS.intake, label: "Intake", borderColor: "#38bdf8", bgActive: "rgba(56, 189, 248, 0.25)", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="M17 7l-5-5-5 5"/><rect x="8" y="10" width="8" height="8" rx="1"/></svg>},
                        {key: "defense", rect: FIELD_BUTTONS.defense, label: "Defense", borderColor: "#f87171", bgActive: "rgba(248, 113, 113, 0.25)", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>},
                        {key: "climb", rect: FIELD_BUTTONS.climb, label: "Climb", borderColor: "#fb923c", bgActive: "rgba(251, 146, 60, 0.25)", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17V3"/><path d="M7 8l5-5 5 5"/><path d="M4 21h16"/></svg>},
                        {key: "passing", rect: FIELD_BUTTONS.passing, label: "Passing", borderColor: "#facc15", bgActive: "rgba(250, 204, 21, 0.25)", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>},
                        {key: "idle", rect: FIELD_BUTTONS.idle, label: "Idle", borderColor: "#71717a", bgActive: "rgba(113, 113, 122, 0.25)", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>},
                    ] as {key: string; rect: Rect; label: string; borderColor: string; bgActive: string; icon: React.ReactNode}[])
                    .map(({key, rect, label, borderColor, bgActive, icon}) => {
                        const displayed = uiFlip ? mirrorRect(rect) : rect
                        const isActive = currentZone === key
                        return (
                            <button
                                key={key}
                                onClick={() => {
                                    if (shot !== 0 && !shotPendingReset) {
                                        const ts = matchStartTime > 0 ? Date.now() - matchStartTime : 0
                                        setActions(prev => [...prev, {
                                            type: "score",
                                            x: shootClickPos?.x ?? 0,
                                            y: shootClickPos?.y ?? 0,
                                            score: shot,
                                            ...(featureFlags.shotMadeSlider ? {shotMade} : {}),
                                            timestamp: ts,
                                            phase: matchPhase,
                                            subPhase: subPhase?.phase ?? null,
                                        }])
                                        setShotEditHint(true)
                                    }
                                    setShotPendingReset(true)
                                    handleZoneClick(key)
                                }}
                                className="absolute rounded-xl transition-all duration-200 flex flex-col items-center justify-center gap-1"
                                style={{
                                    left: `${displayed.x1 * 100}%`, top: `${displayed.y1 * 100}%`,
                                    width: `${(displayed.x2 - displayed.x1) * 100}%`, height: `${(displayed.y2 - displayed.y1) * 100}%`,
                                    background: isActive ? bgActive : "rgba(39, 39, 42, 0.85)",
                                    border: `2px solid ${isActive ? borderColor : "rgba(63, 63, 70, 0.7)"}`,
                                    boxShadow: isActive ? `0 0 12px ${borderColor}44, inset 0 0 20px ${borderColor}15` : "none",
                                    backdropFilter: "blur(4px)",
                                }}
                            >
                                <span className="transition-colors duration-200" style={{color: isActive ? borderColor : "rgba(161, 161, 170, 0.9)"}}>{icon}</span>
                                <span className="text-xs font-semibold tracking-wide transition-colors duration-200" style={{color: isActive ? borderColor : "rgba(212, 212, 216, 0.9)"}}>{label}</span>
                            </button>
                        )
                    }))}
                </>
            )}

            {/* Starting position */}
            {matchPhase === "prestart" && startPosScreen && (
                <div className="absolute" style={{width: "3.75%", height: "7.5%", left: `${startPosScreen.x * 100}%`, top: `${startPosScreen.y * 100}%`, transform: "translate(-50%, -50%)"}}>
                    <div className="absolute inset-[6%] rounded-xs bg-zinc-600/50"/>
                    <div className={`absolute inset-[-12%] rounded-xs border-6 ${effectiveAlliance === "red" ? "border-red-700" : "border-blue-700"}`}/>
                </div>
            )}

            {/* Shoot robot + ball trail */}
            {showZones && shootClickPos && (() => {
                const reefCenter = effectiveAlliance === "red" ? {x: 1 - REEF_CENTER.x, y: REEF_CENTER.y} : REEF_CENTER
                const sx = viewX(shootClickPos.x), sy = viewY(shootClickPos.y)
                const cx = viewX(reefCenter.x), cy = viewY(reefCenter.y)
                const dx = cx - sx, dy = cy - sy
                const dist = Math.sqrt((dx * 2) ** 2 + dy ** 2)
                const ballDiameter = 0.0167 * 1.5
                const count = Math.max(0, Math.floor(dist / ballDiameter))
                const nonShootingActive = currentZone !== null && currentZone !== "shooting"
                const angle = Math.atan2(dy, dx * 2) * (180 / Math.PI)
                return (
                    <>
                        {Array.from({length: count}, (_, i) => {
                            const t = 1 - (i * ballDiameter) / dist
                            if (t <= 0) return null
                            return (
                                <div key={i} className={`absolute rounded-full pointer-events-none ${nonShootingActive ? "bg-zinc-600" : "bg-yellow-400 border border-black/30"}`}
                                    style={{width: "0.833%", height: "1.67%", left: `${(sx + dx * t) * 100}%`, top: `${(sy + dy * t) * 100}%`, transform: "translate(-50%, -50%)", transition: "background-color 0.2s"}}
                                />
                            )
                        })}
                        <div className="absolute" style={{width: "3.75%", height: "7.5%", left: `${sx * 100}%`, top: `${sy * 100}%`, transform: `translate(-50%, -50%) rotate(${angle}deg)`, cursor: "grab", touchAction: "none"}}>
                            <div className={`absolute inset-[6%] rounded-xs border-2 ${draggingShootRobot ? "bg-zinc-500/60 border-zinc-600" : "bg-zinc-600/50 border-zinc-800"}`}/>
                            <div className={`absolute inset-[-12%] rounded-xs border-6 ${effectiveAlliance === "red" ? "border-red-700" : "border-blue-700"}`}/>
                        </div>
                    </>
                )
            })()}
        </div>
    )

    // ---------------------------------------------------------------------------
    // Debug render
    // ---------------------------------------------------------------------------
    const renderDebug = () => {
        if (!debug) return null
        return (
            <div className="flex gap-2 px-2">
                <button onClick={() => setDebugAlliance(a => a === "blue" ? "red" : "blue")}
                    className={`flex-1 h-10 rounded-lg text-sm font-bold border-2 ${effectiveAlliance === "red" ? "bg-red-700/30 border-red-500 text-red-300" : "bg-blue-700/30 border-blue-500 text-blue-300"}`}>
                    Alliance: {effectiveAlliance.toUpperCase()}
                </button>
                <button onClick={() => setDebugOrientation(o => o === "0" ? "180" : "0")}
                    className="flex-1 h-10 rounded-lg text-sm font-bold border-2 bg-zinc-800/60 border-zinc-500 text-zinc-300">
                    Orientation: {effectiveOrientation}°
                </button>
            </div>
        )
    }

    // ---------------------------------------------------------------------------
    // Controls render
    // ---------------------------------------------------------------------------
    const renderControls = () => {
        if (matchPhase === "prestart") {
            return (
                <div className="flex flex-col gap-4">
                    <div className="text-zinc-500 text-center py-4 text-sm">Set starting position on field</div>
                    <button onClick={handleStartMatch} disabled={!startPosition}
                        className={`h-20 rounded-xl text-2xl font-bold transition-colors ${startPosition ? "bg-green-700 hover:bg-green-600" : "bg-zinc-800 opacity-40 cursor-not-allowed"}`}>
                        {startPosition ? "START MATCH ▶" : "Set starting position first"}
                    </button>
                </div>
            )
        }

        if (matchPhase === "post") {
            return (
                <div className="flex flex-col gap-4">
                    <div className="text-zinc-400 text-center py-8">Match complete! Review and submit data.</div>
                    <button onClick={handleSubmit} className="h-16 bg-green-700 rounded-xl text-xl font-bold">FINISH & SUBMIT →</button>
                </div>
            )
        }

        return (
            <div className="flex flex-col gap-3 items-center h-full">
                {/* Score display */}
                <div className="flex gap-6 items-baseline">
                    <div className="text-white text-3xl font-bold font-mono">Shot: {shot}</div>
                    {featureFlags.shotMadeSlider && (
                        <div className="text-green-400 text-2xl font-bold font-mono">Made: {shotMade}</div>
                    )}
                </div>

                <div className="text-xs text-center px-2 h-4">
                    {shotEditHint
                        ? <span className="text-yellow-400">Editable until next shooting box tap</span>
                        : <span className="text-zinc-600">Tap shooting zone to score</span>
                    }
                </div>

                {/* Sliders row */}
                <div className={`flex gap-3 w-full justify-center flex-1 ${!shootClickPos ? "opacity-30 pointer-events-none grayscale blur-[1px]" : ""}`}>
                    <ScoreSlider
                        value={shot}
                        onChange={handleShotChange}
                        label="Attempted"
                    />
                    {featureFlags.shotMadeSlider && (
                        <ScoreSlider
                            value={shotMade}
                            onChange={handleShotMadeChange}
                            label="Made"
                        />
                    )}
                </div>

                {timerExpired && (
                    <button onClick={() => { setManualPost(true); void setPhase("post") }}
                        className="w-full max-w-[16rem] h-14 rounded-xl text-lg font-bold bg-amber-600 hover:bg-amber-500 text-white transition-colors animate-pulse">
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
                <HeaderStrip phase={matchPhase} subPhase={subPhase} subPhaseElapsed={subPhaseElapsed} subPhaseTotal={subPhaseTotal} phaseRemaining={phaseRemaining} flashing={flashing} timerExpired={timerExpired}/>
                <div className="flex-1 flex gap-3 p-3 overflow-hidden">
                    <div className="flex-3 flex flex-col gap-3">{renderField()}{renderDebug()}</div>
                    <div className="flex-1 flex flex-col gap-3 overflow-y-auto">{renderControls()}</div>
                </div>
            </div>
        )
    }

    return (
        <div className="w-screen h-max flex flex-col select-none text-sm">
            <HeaderStrip phase={matchPhase} subPhase={subPhase} subPhaseElapsed={subPhaseElapsed} subPhaseTotal={subPhaseTotal} phaseRemaining={phaseRemaining} flashing={flashing} timerExpired={timerExpired}/>
            <div className="flex-1 flex flex-col p-2 gap-4 overflow-y-auto">
                {renderField()}
                {renderDebug()}
                {renderControls()}
            </div>
        </div>
    )
}