

import React, {useEffect, useRef, useState} from "react"
import type {MatchScoutingData} from "@/types"
import {getSettingSync} from "@/db/settingsDb"

// ---------------------------------------------------------------------------
// Match Phases & Sub-phases
// ---------------------------------------------------------------------------
type MatchPhase = 'prestart' | 'auto' | 'between' | 'teleop' | 'post'

type SubPhase =
    | { phase: 'auto', duration: 20000 }  // 20 seconds
    | { phase: 'transition', duration: 10000 }  // First 10s of teleop
    | { phase: 'shift_1', duration: 25000 }
    | { phase: 'shift_2', duration: 25000 }
    | { phase: 'shift_3', duration: 25000 }
    | { phase: 'shift_4', duration: 25000 }
    | { phase: 'endgame', duration: 30000 }
    | null

// ---------------------------------------------------------------------------
// Zone definitions (normalized coordinates)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Zone definitions (normalized coordinates - cleaned up and aligned)
// ---------------------------------------------------------------------------
const ZONES = {
    // Neutral zone (big intake) - centered
    neutral: {
        x1: 0.322,
        y1: 0.020,
        x2: 0.674,
        y2: 0.978,
    },
    // Transition zones - connect neutral to edges
    transitionLeft: {
        x1: 0.247,
        y1: 0.020,
        x2: 0.323,
        y2: 0.978,
    },
    transitionRight: {
        x1: 0.673,
        y1: 0.020,
        x2: 0.756,
        y2: 0.978,
    },
    // Small intake zones - aligned vertically
    intakeTop: {
        x1: 0.008,
        y1: 0.206,
        x2: 0.051,
        y2: 0.331,
    },
    intakeBottom: {
        x1: 0.008,
        y1: 0.830,
        x2: 0.025,
        y2: 0.969,
    },
    // Climb zone - centered between intakes
    climb: {
        x1: 0.012,
        y1: 0.467,
        x2: 0.084,
        y2: 0.599,
    },
    // Shooting zone (full rectangle, will be clipped)
    shootingFull: {
        x1: 0.008,
        y1: 0.020,
        x2: 0.246,
        y2: 0.979,
    },
}

// ---------------------------------------------------------------------------
// Header Strip Component
// ---------------------------------------------------------------------------
function HeaderStrip({
                         phase,
                         subPhase,
                         subPhaseElapsed,
                         subPhaseTotal,
                         phaseRemaining,
                     }: {
    phase: MatchPhase
    subPhase: SubPhase
    subPhaseElapsed: number
    subPhaseTotal: number
    phaseRemaining: number
}) {
    const getPhaseColor = () => {
        if (phase === 'prestart') return 'bg-zinc-700'
        if (phase === 'auto') return 'bg-blue-700'
        if (phase === 'between') return 'bg-yellow-700 animate-pulse'
        if (phase === 'teleop') {
            if (subPhase?.phase === 'endgame') return 'bg-red-700'
            return 'bg-green-700'
        }
        if (phase === 'post') return 'bg-zinc-700'
        return 'bg-zinc-800'
    }

    const getPhaseLabel = () => {
        if (phase === 'prestart') return 'PRE-MATCH'
        if (phase === 'auto') return 'AUTONOMOUS'
        if (phase === 'between') return 'TRANSITION'
        if (phase === 'teleop') {
            if (!subPhase) return 'TELEOP'
            if (subPhase.phase === 'transition') return 'TELEOP - TRANSITION'
            if (subPhase.phase === 'shift_1') return 'TELEOP - SHIFT 1'
            if (subPhase.phase === 'shift_2') return 'TELEOP - SHIFT 2'
            if (subPhase.phase === 'shift_3') return 'TELEOP - SHIFT 3'
            if (subPhase.phase === 'shift_4') return 'TELEOP - SHIFT 4'
            if (subPhase.phase === 'endgame') return 'TELEOP - ENDGAME'
        }
        if (phase === 'post') return 'POST-MATCH'
        return ''
    }

    const formatTime = (ms: number) => {
        const seconds = Math.floor(ms / 1000)
        const tenths = Math.floor((ms % 1000) / 100)
        return `${seconds}.${tenths}s`
    }

    return (
        <div className={`w-full p-3 ${getPhaseColor()} transition-colors duration-300`}>
            <div className="flex justify-between items-center">
                <span className="text-white font-bold text-lg">
                    {getPhaseLabel()}
                </span>
                {phase !== 'prestart' && phase !== 'post' && (
                    <div className="flex gap-4 items-center">
                        {/* Sub-phase timer (count up) */}
                        <span className="text-white font-mono text-base">
                            {formatTime(subPhaseElapsed)} / {formatTime(subPhaseTotal)}
                        </span>
                        {/* Phase timer (count down) */}
                        <span className="text-white font-mono text-xl font-bold">
                            {formatTime(phaseRemaining)}
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Zone Button Component
// ---------------------------------------------------------------------------
function ZoneButton({
  zone,
  label,
  color,
  onClick,
  active,
  flip,
}: {
  zone: { x1: number, y1: number, x2: number, y2: number }
  label: string
  color: string
  onClick: () => void
  active?: boolean
  flip: boolean
}) {
  const vx = (v: number) => (flip ? 1 - v : v)
  const vy = (v: number) => (flip ? 1 - v : v)

  // Calculate position accounting for flip
  const left = flip ? vx(zone.x2) : vx(zone.x1)
  const top = flip ? vy(zone.y2) : vy(zone.y1)
  const width = zone.x2 - zone.x1
  const height = zone.y2 - zone.y1

  return (
    <button
      onClick={onClick}
      className={`absolute border-2 rounded transition-all duration-200 flex items-center justify-center text-sm font-bold ${
        active
          ? `${color} border-transparent opacity-60`
          : `${color} border-transparent opacity-20 hover:opacity-40`
      }`}
      style={{
        left: `${left * 100}%`,
        top: `${top * 100}%`,
        width: `${width * 100}%`,
        height: `${height * 100}%`,
      }}
    >
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function MatchScouting({
                                          data,
                                          setData,
                                      }: {
    data: MatchScoutingData
    setData: React.Dispatch<React.SetStateAction<MatchScoutingData>>
}) {
    const deviceType = getSettingSync("match_scouting_device_type") ?? "mobile"
    const fieldRef = useRef<HTMLDivElement>(null)

    // ---------------------------------------------------------------------------
    // Phase & timing state
    // ---------------------------------------------------------------------------
    const [matchPhase, setMatchPhase] = useState<MatchPhase>('prestart')
    const [subPhase, setSubPhase] = useState<SubPhase>(null)
    const [subPhaseStartTime, setSubPhaseStartTime] = useState<number>(0)
    const [phaseStartTime, setPhaseStartTime] = useState<number>(0)
    const [matchStartTime, setMatchStartTime] = useState<number>(0)

    // Force re-render for smooth timer updates
    const [, forceUpdate] = useState(0)

    // ---------------------------------------------------------------------------
    // Actions state
    // ---------------------------------------------------------------------------
    const [actions, setActions] = useState<Actions[]>(data.auto)
    const [activeIndex, setActiveIndex] = useState(0)
    const active = actions[activeIndex] ?? {type: "starting", x: 0.5, y: 0.5}

    // Current zone state
    const [currentZone, setCurrentZone] = useState<string | null>(null)

    // ---------------------------------------------------------------------------
    // Field interaction
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

        // Log normalized coordinates
        const normalizedX = flip ? 1 - p.x : p.x
        const normalizedY = flip ? 1 - p.y : p.y
        console.log(`Normalized coords: (${normalizedX.toFixed(3)}, ${normalizedY.toFixed(3)})`)

        if (matchPhase === 'prestart' && active.type === 'starting') {
            setActions(prev => {
                const copy = [...prev]
                copy[activeIndex] = {type: 'starting', x: p.x, y: p.y}
                return copy
            })
            setDragging(true)
        }
    }

    function handlePointerMove(e: React.PointerEvent) {
        if (!dragging) return
        if (matchPhase === 'prestart' && active.type === 'starting') {
            const p = getFieldPos(e)
            setActions(prev => {
                const copy = [...prev]
                copy[activeIndex] = {type: 'starting', x: p.x, y: p.y}
                return copy
            })
        }
    }

    function handlePointerUp() {
        setDragging(false)
    }

    // ---------------------------------------------------------------------------
    // Zone click handlers
    // ---------------------------------------------------------------------------
    const handleZoneClick = (zoneName: string) => {
        console.log(`Zone clicked: ${zoneName}`)
        setCurrentZone(zoneName)
        // TODO: Create state change event
    }

    // ---------------------------------------------------------------------------
    // Get total phase duration
    // ---------------------------------------------------------------------------
    const getPhaseDuration = (phase: MatchPhase): number => {
        if (phase === 'auto') return 20000
        if (phase === 'between') return 5000
        if (phase === 'teleop') return 10000 + 25000 * 4 + 30000  // transition + 4 shifts + endgame = 140s
        return 0
    }

    // ---------------------------------------------------------------------------
    // Smooth timer updates (60fps)
    // ---------------------------------------------------------------------------
    useEffect(() => {
        if (matchPhase === 'prestart' || matchPhase === 'post') return

        const interval = setInterval(() => {
            forceUpdate(prev => prev + 1)
        }, 1000 / 60)  // 60fps for smooth updates

        return () => clearInterval(interval)
    }, [matchPhase])

    // ---------------------------------------------------------------------------
    // Phase transitions
    // ---------------------------------------------------------------------------
    useEffect(() => {
        if (matchPhase === 'prestart' || matchPhase === 'post') return

        const checkInterval = setInterval(() => {
            const now = Date.now()
            const subElapsed = now - subPhaseStartTime

            // Auto phase (20s)
            if (matchPhase === 'auto' && subElapsed >= 20000) {
                setMatchPhase('between')
                setPhaseStartTime(now)
                setSubPhaseStartTime(now)
                setSubPhase(null)
                return
            }

            // Between phase (5s transition)
            if (matchPhase === 'between' && subElapsed >= 5000) {
                setMatchPhase('teleop')
                setPhaseStartTime(now)
                setSubPhaseStartTime(now)
                setSubPhase({phase: 'transition', duration: 10000})
                return
            }

            // Teleop sub-phases
            if (matchPhase === 'teleop' && subPhase) {
                if (subElapsed >= subPhase.duration) {
                    const now = Date.now()
                    // Progress through teleop sub-phases
                    if (subPhase.phase === 'transition') {
                        setSubPhase({phase: 'shift_1', duration: 25000})
                        setSubPhaseStartTime(now)
                    } else if (subPhase.phase === 'shift_1') {
                        setSubPhase({phase: 'shift_2', duration: 25000})
                        setSubPhaseStartTime(now)
                    } else if (subPhase.phase === 'shift_2') {
                        setSubPhase({phase: 'shift_3', duration: 25000})
                        setSubPhaseStartTime(now)
                    } else if (subPhase.phase === 'shift_3') {
                        setSubPhase({phase: 'shift_4', duration: 25000})
                        setSubPhaseStartTime(now)
                    } else if (subPhase.phase === 'shift_4') {
                        setSubPhase({phase: 'endgame', duration: 30000})
                        setSubPhaseStartTime(now)
                    } else if (subPhase.phase === 'endgame') {
                        setMatchPhase('post')
                        setSubPhase(null)
                    }
                }
            }
        }, 100)  // Check transitions every 100ms

        return () => clearInterval(checkInterval)
    }, [matchPhase, subPhase, subPhaseStartTime])

    // ---------------------------------------------------------------------------
    // Start match handler
    // ---------------------------------------------------------------------------
    const handleStartMatch = () => {
        const now = Date.now()
        setMatchStartTime(now)
        setPhaseStartTime(now)
        setSubPhaseStartTime(now)
        setMatchPhase('auto')
        setSubPhase({phase: 'auto', duration: 20000})
    }

    // ---------------------------------------------------------------------------
    // Sync to parent data
    // ---------------------------------------------------------------------------
    useEffect(() => {
        setData(d => ({...d, auto: actions}))
    }, [actions, setData])

    // ---------------------------------------------------------------------------
    // View helpers
    // ---------------------------------------------------------------------------
    const viewX = (v: number) => (flip ? 1 - v : v)
    const viewY = (v: number) => (flip ? 1 - v : v)

    // ---------------------------------------------------------------------------
    // Render field component
    // ---------------------------------------------------------------------------
    const renderField = () => {
        const current = active
        const showZones = matchPhase === 'auto' || matchPhase === 'teleop'

        return (
            <div
                ref={fieldRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={() => setDragging(false)}
                className="relative w-full aspect-2/1 rounded-xl overflow-hidden touch-none"
                style={{transform: flip ? "rotate(180deg)" : "none"}}
            >
                <img
                    src="/seasons/2026/field-lovat.png"
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    alt="field"
                />

                {/* Zone overlays */}
                {showZones && matchPhase === 'auto' && (
                    <>
                        {/* Neutral zone (big intake) */}
                        <ZoneButton
                            zone={ZONES.neutral}
                            label="INTAKE"
                            color="bg-blue-600"
                            onClick={() => handleZoneClick('neutral')}
                            active={currentZone === 'neutral'}
                            flip={flip}
                        />

                        {/* Transition zones */}
                        <ZoneButton
                            zone={ZONES.transitionLeft}
                            label="Traversal"
                            color="bg-purple-600"
                            onClick={() => handleZoneClick('transitionLeft')}
                            active={currentZone === 'transitionLeft'}
                            flip={flip}
                        />
                        <ZoneButton
                            zone={ZONES.transitionRight}
                            label="Traversal"
                            color="bg-purple-600"
                            onClick={() => handleZoneClick('transitionRight')}
                            active={currentZone === 'transitionRight'}
                            flip={flip}
                        />

                        {/* Small intake zones */}
                        <ZoneButton
                            zone={ZONES.intakeTop}
                            label="Intake"
                            color="bg-blue-600"
                            onClick={() => handleZoneClick('intakeTop')}
                            active={currentZone === 'intakeTop'}
                            flip={flip}
                        />
                        <ZoneButton
                            zone={ZONES.intakeBottom}
                            label="Intake"
                            color="bg-blue-600"
                            onClick={() => handleZoneClick('intakeBottom')}
                            active={currentZone === 'intakeBottom'}
                            flip={flip}
                        />

                        {/* Shooting zone with proper cutouts */}
                        <svg
                            className="absolute inset-0 w-full h-full pointer-events-none"
                            viewBox="0 0 1 1"
                            preserveAspectRatio="none"
                        >
                            <defs>
                                <mask id="shootingMask">
                                    {/* White = visible, Black = hidden */}
                                    <rect x="0" y="0" width="1" height="1" fill="white"/>
                                    {/* Cut out intake top */}
                                    <rect
                                        x={ZONES.intakeTop.x1}
                                        y={ZONES.intakeTop.y1}
                                        width={ZONES.intakeTop.x2 - ZONES.intakeTop.x1}
                                        height={ZONES.intakeTop.y2 - ZONES.intakeTop.y1}
                                        fill="black"
                                    />
                                    {/* Cut out climb */}
                                    <rect
                                        x={ZONES.climb.x1}
                                        y={ZONES.climb.y1}
                                        width={ZONES.climb.x2 - ZONES.climb.x1}
                                        height={ZONES.climb.y2 - ZONES.climb.y1}
                                        fill="black"
                                    />
                                    {/* Cut out intake bottom */}
                                    <rect
                                        x={ZONES.intakeBottom.x1}
                                        y={ZONES.intakeBottom.y1}
                                        width={ZONES.intakeBottom.x2 - ZONES.intakeBottom.x1}
                                        height={ZONES.intakeBottom.y2 - ZONES.intakeBottom.y1}
                                        fill="black"
                                    />
                                </mask>
                            </defs>
                            <rect
                                x={ZONES.shootingFull.x1}
                                y={ZONES.shootingFull.y1}
                                width={ZONES.shootingFull.x2 - ZONES.shootingFull.x1}
                                height={ZONES.shootingFull.y2 - ZONES.shootingFull.y1}
                                mask="url(#shootingMask)"
                                onClick={() => handleZoneClick('shooting')}
                                className={`cursor-pointer rounded transition-all duration-200 ${
                                    currentZone === 'shooting'
                                        ? 'fill-green-600/90 stroke-white stroke-2'
                                        : 'fill-green-600/40 stroke-transparent hover:fill-green-600/70'
                                }`}
                            />
                            {/* Label */}
                            <text
                                x={(ZONES.shootingFull.x1 + ZONES.shootingFull.x2) / 2}
                                y={(ZONES.shootingFull.y1 + ZONES.shootingFull.y2) / 2}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                className="fill-white font-bold text-[0.05px] pointer-events-none"
                            >
                                SHOOT
                            </text>
                        </svg>

                        {/* Climb zone */}
                        <ZoneButton
                            zone={ZONES.climb}
                            label="CLIMB"
                            color="bg-orange-600"
                            onClick={() => handleZoneClick('climb')}
                            active={currentZone === 'climb'}
                            flip={flip}
                        />
                    </>
                )}

                {showZones && matchPhase === 'teleop' && (
                    <>
                        {/* All auto zones plus defense zone (mirrored shooting) */}
                        <ZoneButton
                            zone={ZONES.neutral}
                            label="INTAKE"
                            color="bg-blue-600"
                            onClick={() => handleZoneClick('neutral')}
                            active={currentZone === 'neutral'}
                            flip={flip}
                        />
                        <ZoneButton
                            zone={ZONES.transitionLeft}
                            label="TRANS"
                            color="bg-purple-600"
                            onClick={() => handleZoneClick('transitionLeft')}
                            active={currentZone === 'transitionLeft'}
                            flip={flip}
                        />
                        <ZoneButton
                            zone={ZONES.transitionRight}
                            label="TRANS"
                            color="bg-purple-600"
                            onClick={() => handleZoneClick('transitionRight')}
                            active={currentZone === 'transitionRight'}
                            flip={flip}
                        />
                        <ZoneButton
                            zone={ZONES.intakeTop}
                            label="IN"
                            color="bg-blue-600"
                            onClick={() => handleZoneClick('intakeTop')}
                            active={currentZone === 'intakeTop'}
                            flip={flip}
                        />
                        <ZoneButton
                            zone={ZONES.intakeBottom}
                            label="IN"
                            color="bg-blue-600"
                            onClick={() => handleZoneClick('intakeBottom')}
                            active={currentZone === 'intakeBottom'}
                            flip={flip}
                        />

                        {/* Shooting zone */}
                        <button
                            onClick={() => handleZoneClick('shooting')}
                            className={`absolute border-2 rounded transition-all duration-200 flex items-center justify-center text-sm font-bold ${
                                currentZone === 'shooting'
                                    ? 'bg-green-600 border-white opacity-90'
                                    : 'bg-green-600 border-transparent opacity-40 hover:opacity-70'
                            }`}
                            style={{
                                left: `${(flip ? 1 - ZONES.shootingFull.x2 : ZONES.shootingFull.x1) * 100}%`,
                                top: `${(flip ? 1 - ZONES.shootingFull.y2 : ZONES.shootingFull.y1) * 100}%`,
                                width: `${(ZONES.shootingFull.x2 - ZONES.shootingFull.x1) * 100}%`,
                                height: `${(ZONES.shootingFull.y2 - ZONES.shootingFull.y1) * 100}%`,
                                clipPath: `polygon(
                  0 0,
                  100% 0,
                  100% 100%,
                  0 100%,
                  0 ${((ZONES.intakeBottom.y1 - ZONES.shootingFull.y1) / (ZONES.shootingFull.y2 - ZONES.shootingFull.y1)) * 100}%,
                  ${((ZONES.intakeBottom.x2 - ZONES.shootingFull.x1) / (ZONES.shootingFull.x2 - ZONES.shootingFull.x1)) * 100}% ${((ZONES.intakeBottom.y1 - ZONES.shootingFull.y1) / (ZONES.shootingFull.y2 - ZONES.shootingFull.y1)) * 100}%,
                  ${((ZONES.intakeBottom.x2 - ZONES.shootingFull.x1) / (ZONES.shootingFull.x2 - ZONES.shootingFull.x1)) * 100}% ${((ZONES.intakeBottom.y2 - ZONES.shootingFull.y1) / (ZONES.shootingFull.y2 - ZONES.shootingFull.y1)) * 100}%,
                  0 ${((ZONES.intakeBottom.y2 - ZONES.shootingFull.y1) / (ZONES.shootingFull.y2 - ZONES.shootingFull.y1)) * 100}%,
                  0 ${((ZONES.intakeTop.y1 - ZONES.shootingFull.y1) / (ZONES.shootingFull.y2 - ZONES.shootingFull.y1)) * 100}%,
                  ${((ZONES.intakeTop.x2 - ZONES.shootingFull.x1) / (ZONES.shootingFull.x2 - ZONES.shootingFull.x1)) * 100}% ${((ZONES.intakeTop.y1 - ZONES.shootingFull.y1) / (ZONES.shootingFull.y2 - ZONES.shootingFull.y1)) * 100}%,
                  ${((ZONES.intakeTop.x2 - ZONES.shootingFull.x1) / (ZONES.shootingFull.x2 - ZONES.shootingFull.x1)) * 100}% ${((ZONES.intakeTop.y2 - ZONES.shootingFull.y1) / (ZONES.shootingFull.y2 - ZONES.shootingFull.y1)) * 100}%,
                  0 ${((ZONES.intakeTop.y2 - ZONES.shootingFull.y1) / (ZONES.shootingFull.y2 - ZONES.shootingFull.y1)) * 100}%,
                  0 ${((ZONES.climb.y1 - ZONES.shootingFull.y1) / (ZONES.shootingFull.y2 - ZONES.shootingFull.y1)) * 100}%,
                  ${((ZONES.climb.x2 - ZONES.shootingFull.x1) / (ZONES.shootingFull.x2 - ZONES.shootingFull.x1)) * 100}% ${((ZONES.climb.y1 - ZONES.shootingFull.y1) / (ZONES.shootingFull.y2 - ZONES.shootingFull.y1)) * 100}%,
                  ${((ZONES.climb.x2 - ZONES.shootingFull.x1) / (ZONES.shootingFull.x2 - ZONES.shootingFull.x1)) * 100}% ${((ZONES.climb.y2 - ZONES.shootingFull.y1) / (ZONES.shootingFull.y2 - ZONES.shootingFull.y1)) * 100}%,
                  0 ${((ZONES.climb.y2 - ZONES.shootingFull.y1) / (ZONES.shootingFull.y2 - ZONES.shootingFull.y1)) * 100}%
                )`
                            }}
                        >
                            SHOOT
                        </button>

                        {/* Defense zone (mirrored shooting zone on opposite side) */}
                        <button
                            onClick={() => handleZoneClick('defense')}
                            className={`absolute border-2 rounded transition-all duration-200 flex items-center justify-center text-sm font-bold ${
                                currentZone === 'defense'
                                    ? 'bg-red-600 border-white opacity-90'
                                    : 'bg-red-600 border-transparent opacity-40 hover:opacity-70'
                            }`}
                            style={{
                                left: `${(flip ? ZONES.shootingFull.x1 : 1 - ZONES.shootingFull.x2) * 100}%`,
                                top: `${(flip ? 1 - ZONES.shootingFull.y2 : ZONES.shootingFull.y1) * 100}%`,
                                width: `${(ZONES.shootingFull.x2 - ZONES.shootingFull.x1) * 100}%`,
                                height: `${(ZONES.shootingFull.y2 - ZONES.shootingFull.y1) * 100}%`,
                                transform: 'scaleX(-1)',
                                clipPath: `polygon(
                  0 0,
                  100% 0,
                  100% 100%,
                  0 100%,
                  0 ${((ZONES.intakeBottom.y1 - ZONES.shootingFull.y1) / (ZONES.shootingFull.y2 - ZONES.shootingFull.y1)) * 100}%,
                  ${((ZONES.intakeBottom.x2 - ZONES.shootingFull.x1) / (ZONES.shootingFull.x2 - ZONES.shootingFull.x1)) * 100}% ${((ZONES.intakeBottom.y1 - ZONES.shootingFull.y1) / (ZONES.shootingFull.y2 - ZONES.shootingFull.y1)) * 100}%,
                  ${((ZONES.intakeBottom.x2 - ZONES.shootingFull.x1) / (ZONES.shootingFull.x2 - ZONES.shootingFull.x1)) * 100}% ${((ZONES.intakeBottom.y2 - ZONES.shootingFull.y1) / (ZONES.shootingFull.y2 - ZONES.shootingFull.y1)) * 100}%,
                  0 ${((ZONES.intakeBottom.y2 - ZONES.shootingFull.y1) / (ZONES.shootingFull.y2 - ZONES.shootingFull.y1)) * 100}%,
                  0 ${((ZONES.intakeTop.y1 - ZONES.shootingFull.y1) / (ZONES.shootingFull.y2 - ZONES.shootingFull.y1)) * 100}%,
                  ${((ZONES.intakeTop.x2 - ZONES.shootingFull.x1) / (ZONES.shootingFull.x2 - ZONES.shootingFull.x1)) * 100}% ${((ZONES.intakeTop.y1 - ZONES.shootingFull.y1) / (ZONES.shootingFull.y2 - ZONES.shootingFull.y1)) * 100}%,
                  ${((ZONES.intakeTop.x2 - ZONES.shootingFull.x1) / (ZONES.shootingFull.x2 - ZONES.shootingFull.x1)) * 100}% ${((ZONES.intakeTop.y2 - ZONES.shootingFull.y1) / (ZONES.shootingFull.y2 - ZONES.shootingFull.y1)) * 100}%,
                  0 ${((ZONES.intakeTop.y2 - ZONES.shootingFull.y1) / (ZONES.shootingFull.y2 - ZONES.shootingFull.y1)) * 100}%,
                  0 ${((ZONES.climb.y1 - ZONES.shootingFull.y1) / (ZONES.shootingFull.y2 - ZONES.shootingFull.y1)) * 100}%,
                  ${((ZONES.climb.x2 - ZONES.shootingFull.x1) / (ZONES.shootingFull.x2 - ZONES.shootingFull.x1)) * 100}% ${((ZONES.climb.y1 - ZONES.shootingFull.y1) / (ZONES.shootingFull.y2 - ZONES.shootingFull.y1)) * 100}%,
                  ${((ZONES.climb.x2 - ZONES.shootingFull.x1) / (ZONES.shootingFull.x2 - ZONES.shootingFull.x1)) * 100}% ${((ZONES.climb.y2 - ZONES.shootingFull.y1) / (ZONES.shootingFull.y2 - ZONES.shootingFull.y1)) * 100}%,
                  0 ${((ZONES.climb.y2 - ZONES.shootingFull.y1) / (ZONES.shootingFull.y2 - ZONES.shootingFull.y1)) * 100}%
                )`
                            }}
                        >
                            DEFENSE
                        </button>

                        <ZoneButton
                            zone={ZONES.climb}
                            label="CLIMB"
                            color="bg-orange-600"
                            onClick={() => handleZoneClick('climb')}
                            active={currentZone === 'climb'}
                            flip={flip}
                        />
                    </>
                )}

                {/* Starting position indicator */}
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
            </div>
        )
    }

    // ---------------------------------------------------------------------------
    // Render controls component - PLACEHOLDER
    // ---------------------------------------------------------------------------
    const renderControls = () => {
        if (matchPhase === 'prestart') {
            return (
                <div className="flex flex-col gap-4">
                    <div className="text-zinc-500 text-center py-4 text-sm">
                        Set starting position on field
                    </div>

                    <button
                        onClick={handleStartMatch}
                        disabled={!active.x}
                        className={`h-20 rounded-xl text-2xl font-bold transition-colors ${
                            active.x
                                ? 'bg-green-700 hover:bg-green-600'
                                : 'bg-zinc-800 opacity-40 cursor-not-allowed'
                        }`}
                    >
                        {active.x ? 'START MATCH ▶' : 'Set starting position first'}
                    </button>
                </div>
            )
        }

        if (matchPhase === 'post') {
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
            <div className="flex flex-col gap-4">
                <div className="text-zinc-400 text-center py-8 text-sm">
                    Controls coming soon...
                    <br/>
                    <span className="text-xs text-zinc-500">
                        Current zone: {currentZone || 'none'}
                    </span>
                </div>
            </div>
        )
    }

    // ---------------------------------------------------------------------------
    // Calculate timers for header
    // ---------------------------------------------------------------------------
    const now = Date.now()
    const subPhaseElapsed = subPhaseStartTime > 0 ? now - subPhaseStartTime : 0
    const subPhaseTotal = subPhase?.duration ?? (matchPhase === 'between' ? 5000 : 0)

    const phaseElapsed = phaseStartTime > 0 ? now - phaseStartTime : 0
    const phaseDuration = getPhaseDuration(matchPhase)
    const phaseRemaining = Math.max(0, phaseDuration - phaseElapsed)

    // ---------------------------------------------------------------------------
    // Main render - conditional layout based on device type
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
                />

                <div className="flex-1 flex gap-3 p-3 overflow-hidden">
                    <div className="flex-3 flex flex-col gap-3">
                        {renderField()}
                    </div>

                    <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
                        {renderControls()}
                    </div>
                </div>
            </div>
        )
    }

    // Mobile layout
    return (
        <div className="w-screen h-max flex flex-col select-none text-sm">
            <HeaderStrip
                phase={matchPhase}
                subPhase={subPhase}
                subPhaseElapsed={subPhaseElapsed}
                subPhaseTotal={subPhaseTotal}
                phaseRemaining={phaseRemaining}
            />

            <div className="flex-1 flex flex-col p-2 gap-4 overflow-y-auto">
                {renderField()}
                {renderControls()}
            </div>
        </div>
    )
}