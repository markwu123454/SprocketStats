import {useState, useEffect, useRef, useMemo, useCallback} from 'react'
import {useNavigate} from "react-router-dom"
import type {MatchScoutingData, MatchType, ScoutingStatus} from '@/types'
import {useAPI} from '@/hooks/useAPI.ts'
import {useAuth} from '@/hooks/useAuth.ts'
import {useClientEnvironment} from "@/hooks/useClientEnvironment.ts"
import {saveScoutingData, db, type ScoutingDataWithKey} from "@/db/db.ts"
import useFeatureFlags from "@/hooks/useFeatureFlags.ts"
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter} from "@/components/ui/dialog"
import {Button} from '@/components/ui/button'
import LoadButton from '@/components/ui/loadButton'
import PrePhase from "@/components/seasons/2026/Pre.tsx"
import AutoPhase from "@/components/seasons/2026/Auto.tsx"
import TeleopPhase from "@/components/seasons/2026/Teleop.tsx"
import PostMatch from "@/components/seasons/2026/Post.tsx"
import {createDefaultScoutingData} from "@/components/seasons/2026/yearConfig.ts"
import {getSetting} from "@/db/settingsDb.ts"
import AVariant from "@/components/seasons/2026/ABtest/A.tsx"
import BVariant from "@/components/seasons/2026/ABtest/B.tsx"

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase = 'pre' | 'auto' | 'teleop' | 'combined' | 'post'
type AbTestVariant = 'default' | 'a' | 'b'
type SubmitStatus = 'idle' | 'loading' | 'success' | 'local' | 'error' | 'warning'

// ─── Constants ───────────────────────────────────────────────────────────────

const PHASE_ORDERS: Record<AbTestVariant, Phase[]> = {
    default: ['pre', 'auto', 'teleop', 'post'],
    a: ['pre', 'auto', 'teleop', 'post'],
    b: ['pre', 'combined', 'post'],
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function normalizeScoutingData<T extends object>(raw: T, defaults: T): T {
    if (typeof raw !== "object" || raw === null) return structuredClone(defaults)
    if (typeof defaults !== "object" || defaults === null) return structuredClone(raw)

    const result: any = Array.isArray(defaults) ? [] : {}

    for (const key in defaults) {
        if (Object.hasOwn(raw, key)) {
            if (typeof defaults[key] === "object" && defaults[key] !== null && !Array.isArray(defaults[key])) {
                result[key] = normalizeScoutingData((raw as any)[key], (defaults as any)[key])
            } else {
                result[key] = (raw as any)[key]
            }
        } else {
            result[key] = structuredClone((defaults as any)[key])
        }
    }

    for (const key in raw) {
        if (!Object.hasOwn(defaults, key)) {
            result[key] = structuredClone((raw as any)[key])
        }
    }

    return result
}

async function exitFullscreenIfNeeded() {
    try {
        if (document.fullscreenElement) {
            await document.exitFullscreen()
            return
        }
        const docAny = document as any
        if (docAny.webkitFullscreenElement) {
            await docAny.webkitExitFullscreen()
        }
    } catch {
        // ignore
    }
}

function buildUploadPayload(entry: ScoutingDataWithKey | MatchScoutingData, fallbackEmail: string) {
    const {match, match_type, teamNumber, alliance, scouter, ...rest} = entry as any
    return {
        match: Number(match),
        teamNumber: teamNumber!,
        payload: {
            match_type,
            alliance,
            scouter: scouter || fallbackEmail,
            data: rest,
        },
    }
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useResumeDialog(
    scouterEmail: string,
    abTestVariant: AbTestVariant,
    phaseOrder: Phase[],
) {
    const {isOnline, serverOnline} = useClientEnvironment()
    const {scoutingAction} = useAPI()

    const [showResumeDialog, setShowResumeDialog] = useState(false)
    const [resumeList, setResumeList] = useState<ScoutingDataWithKey[]>([])
    const [resumeLock, setResumeLock] = useState<Record<number, boolean>>({})
    const [resumeWarning, setResumeWarning] = useState<Record<number, boolean>>({})

    useEffect(() => {
        ;(async () => {
            const entries: ScoutingDataWithKey[] = await db.scouting.toArray()
            const active = entries.filter(e =>
                (['pre', 'auto', 'teleop', 'combined', 'post'] as string[]).includes(e.status)
            )
            if (active.length > 0) {
                setResumeList(active)
                setShowResumeDialog(true)
            }
        })()
    }, [])

    // Map auto/teleop → combined for variant b
    const resolvePhase = useCallback((status: string): Phase => {
        if (abTestVariant === "b" && (status === "auto" || status === "teleop")) {
            return "combined"
        }
        return status as Phase
    }, [abTestVariant])

    const discardEntry = useCallback(async (entry: ScoutingDataWithKey) => {
        try {
            if (isOnline && serverOnline) {
                await scoutingAction(entry.match!, entry.teamNumber!, entry.match_type, entry.alliance, "unclaim")
            }
        } catch (err) {
            console.warn("Failed to unclaim during discard:", err)
        }
        await db.scouting.delete(entry.key)
        setResumeList(r => {
            const next = r.filter(e => e.key !== entry.key)
            if (next.length === 0) setShowResumeDialog(false)
            return next
        })
    }, [isOnline, serverOnline, scoutingAction])

    const resumeEntry = useCallback(async (
        entry: ScoutingDataWithKey,
        onSuccess: (data: MatchScoutingData, phaseIndex: number) => void,
    ) => {
        if (resumeLock[entry.key]) return

        setResumeLock(prev => ({...prev, [entry.key]: true}))
        setResumeWarning(prev => ({...prev, [entry.key]: false}))

        try {
            if (isOnline && serverOnline) {
                const claimed = await scoutingAction(
                    entry.match!, entry.teamNumber!, entry.match_type, entry.alliance, "claim"
                )
                if (!claimed) {
                    setResumeWarning(prev => ({...prev, [entry.key]: true}))
                    setResumeLock(prev => ({...prev, [entry.key]: false}))
                    return
                }
                const targetPhase = resolvePhase(entry.status)
                await scoutingAction(
                    entry.match!, entry.teamNumber!, entry.match_type!, entry.alliance!,
                    `set_${targetPhase}` as any,
                )
            }

            const restored = normalizeScoutingData(entry, {
                ...createDefaultScoutingData(),
                scouter: scouterEmail,
            })

            const targetPhase = resolvePhase(entry.status)
            onSuccess(restored as MatchScoutingData, phaseOrder.indexOf(targetPhase))
            setShowResumeDialog(false)
        } catch (err) {
            console.warn("Failed to resume team:", err)
            setResumeLock(prev => ({...prev, [entry.key]: false}))
        }
    }, [isOnline, serverOnline, scoutingAction, resolvePhase, scouterEmail, phaseOrder, resumeLock])

    const startNew = useCallback(() => setShowResumeDialog(false), [])

    return {
        showResumeDialog, setShowResumeDialog,
        resumeList, resumeLock, resumeWarning,
        discardEntry, resumeEntry, startNew,
    }
}

function useAutosave(
    phase: Phase,
    phaseIndex: number,
    scoutingDataRef: React.RefObject<MatchScoutingData>,
    phaseOrder: Phase[],
) {
    useEffect(() => {
        if (phase === "pre") return

        const interval = setInterval(() => {
            const data = scoutingDataRef.current
            if (!data?.match || !data.match_type || data.teamNumber == null) return

            const status = phaseOrder[phaseIndex] as ScoutingStatus
            const snapshot = structuredClone(data)
            saveScoutingData(snapshot, status).catch(err => {
                console.error("Autosave failed:", err)
            })
        }, 3000)

        return () => clearInterval(interval)
    }, [phase, phaseIndex, phaseOrder])
    // scoutingDataRef is stable — intentionally excluded from deps
}

function useUnclaimOnExit(
    scoutingDataRef: React.RefObject<MatchScoutingData>,
    submitStatusRef: React.RefObject<SubmitStatus>,
    isOnline: boolean,
    serverOnline: boolean,
    unclaimTeamBeacon: (match: number, team: number, match_type: MatchType, email: string) => void,
    scouterEmail: string,
) {
    const didUnclaimRef = useRef(false)
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Reset flag when the scouted entity changes
    useEffect(() => {
        didUnclaimRef.current = false
    }, [
        scoutingDataRef.current?.match,
        scoutingDataRef.current?.match_type,
        scoutingDataRef.current?.teamNumber,
    ])

    useEffect(() => {
        const tryUnclaim = () => {
            if (didUnclaimRef.current) return
            const data = scoutingDataRef.current
            if (!data?.match || !data.match_type || !data.teamNumber) return
            if (submitStatusRef.current === "success" || submitStatusRef.current === "local") return
            if (!isOnline || !serverOnline) return

            didUnclaimRef.current = true
            unclaimTeamBeacon(data.match, data.teamNumber, data.match_type, scouterEmail)
        }

        const onVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                timeoutRef.current = setTimeout(tryUnclaim, 30_000)
            } else {
                if (timeoutRef.current) clearTimeout(timeoutRef.current)
            }
        }

        document.addEventListener("visibilitychange", onVisibilityChange)
        window.addEventListener("pagehide", tryUnclaim)
        window.addEventListener("beforeunload", tryUnclaim)

        return () => {
            document.removeEventListener("visibilitychange", onVisibilityChange)
            window.removeEventListener("pagehide", tryUnclaim)
            window.removeEventListener("beforeunload", tryUnclaim)
        }
    }, [isOnline, serverOnline, scouterEmail, unclaimTeamBeacon])
}

function useBackgroundSync(
    isOnline: boolean,
    serverOnline: boolean,
    submitData: (match: number, team: number, data: any) => Promise<boolean>,
    scouterEmail: string,
) {
    const isSyncingRef = useRef(false)

    const sync = useCallback(async () => {
        if (!isOnline || !serverOnline || isSyncingRef.current) return
        isSyncingRef.current = true

        try {
            const completed = await db.scouting.where('status').equals('completed').toArray()
            for (const entry of completed) {
                try {
                    const {match, teamNumber, payload} = buildUploadPayload(entry, scouterEmail)
                    if (await submitData(match, teamNumber, payload)) {
                        await db.scouting.delete(entry.key)
                    }
                } catch (err) {
                    console.warn("Background upload failed for entry, will retry:", err)
                }
            }
        } finally {
            isSyncingRef.current = false
        }
    }, [isOnline, serverOnline, submitData, scouterEmail])

    useEffect(() => {
        sync()
        const interval = setInterval(sync, 30_000)
        return () => clearInterval(interval)
    }, [sync])

    return {triggerSync: sync}
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MatchScoutingPage() {
    const navigate = useNavigate()
    const {isOnline, serverOnline} = useClientEnvironment()
    const {submitData, scoutingAction, unclaimTeamBeacon} = useAPI()
    const {name: scouterName, email: scouterEmail} = useAuth()
    const featureFlags = useFeatureFlags()

    // ─── Core state ───
    const [phaseIndex, setPhaseIndex] = useState(0)
    const [scoutingData, setScoutingData] = useState<MatchScoutingData>(() => ({
        ...createDefaultScoutingData(),
        scouter: scouterEmail!,
    }))
    const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle')
    const [showConfirmDialog, setShowConfirmDialog] = useState(false)
    const [postCanSubmit, setPostCanSubmit] = useState(false)
    const [abTestVariant, setAbTestVariant] = useState<AbTestVariant | null>(null)

    // ─── Stable refs ───
    const scoutingDataRef = useRef(scoutingData)
    scoutingDataRef.current = scoutingData

    const submitStatusRef = useRef(submitStatus)
    submitStatusRef.current = submitStatus

    // ─── Derived ───
    const phaseOrder = useMemo(() =>
        PHASE_ORDERS[abTestVariant ?? 'default'],
        [abTestVariant]
    )
    const phase = phaseOrder[phaseIndex]
    const variantAFullControl = abTestVariant === "default" && (phase === "auto" || phase === "teleop")
    const baseDisabled =
        scoutingData.match_type === null ||
        scoutingData.match === 0 ||
        scoutingData.alliance === null ||
        scoutingData.teamNumber === null

    // ─── Load A/B test variant ───
    useEffect(() => {
        getSetting("match_ab_test").then(variant => {
            setAbTestVariant((variant as AbTestVariant) || "default")
        })
    }, [])

    // ─── setPhase — permanently stable, all reads via refs ───
    // phaseOrder, scoutingData, and scoutingAction are accessed through refs so
    // this callback never changes identity and never triggers re-renders in child
    // components (e.g. AVariant) that receive it as a prop. This also means the
    // "setPhase is not a function" error from B.tsx cannot occur: the function
    // exists from the very first render and never becomes undefined.
    const scoutingDataStableRef = useRef(scoutingData)
    scoutingDataStableRef.current = scoutingData

    const phaseOrderRef = useRef(phaseOrder)
    phaseOrderRef.current = phaseOrder

    const scoutingActionRef = useRef(scoutingAction)
    scoutingActionRef.current = scoutingAction

    const setPhase = useCallback(async (targetPhase: Phase) => {
        const targetIndex = phaseOrderRef.current.indexOf(targetPhase)
        if (targetIndex === -1) return
        setPhaseIndex(targetIndex)

        const {match, teamNumber, match_type, alliance} = scoutingDataStableRef.current
        await scoutingActionRef.current(match!, teamNumber!, match_type!, alliance!, `set_${targetPhase}` as any)
    }, [])
    // Empty deps intentional — all dynamic values are read from refs above

    // ─── Navigation ───
    const handleNext = useCallback(async () => {
        if (baseDisabled) return
        const nextPhase = phaseOrderRef.current[phaseIndex + 1]
        if (nextPhase) await setPhase(nextPhase)
    }, [baseDisabled, phaseIndex, setPhase])

    const handleBack = useCallback(async () => {
        if (phase === 'pre') {
            await exitFullscreenIfNeeded()
            navigate("/")
            return
        }
        const prevPhase = phaseOrderRef.current[phaseIndex - 1]
        if (prevPhase) await setPhase(prevPhase)
    }, [phase, phaseIndex, setPhase, navigate])

    // ─── Reset ───
    const resetToNew = useCallback(() => {
        setScoutingData(prev => ({
            ...createDefaultScoutingData(),
            match_type: prev.match_type,
            match: (prev.match ?? 0) + 1,
            alliance: null,
            scouter: scouterEmail!,
        }))
        setPhaseIndex(0)
        setPostCanSubmit(false)
    }, [scouterEmail])

    // ─── Submit ───
    const executeSubmit = useCallback(async () => {
        if (baseDisabled) return
        setSubmitStatus("loading")
        try {
            await saveScoutingData(structuredClone(scoutingData), "completed")
            setSubmitStatus("success")
            triggerSync()
            setTimeout(() => {
                setSubmitStatus("idle")
                resetToNew()
            }, 1000)
        } catch (err) {
            console.error("Local save failed:", err)
            setSubmitStatus("error")
        }
    }, [baseDisabled, scoutingData, resetToNew])
    // triggerSync added below after hook call

    const handleSubmit = useCallback(() => {
        if (baseDisabled) return
        if (featureFlags.confirmBeforeUpload || !postCanSubmit) {
            setShowConfirmDialog(true)
            return
        }
        void executeSubmit()
    }, [baseDisabled, featureFlags.confirmBeforeUpload, postCanSubmit, executeSubmit])

    // ─── Hooks ───
    const resume = useResumeDialog(scouterEmail!, abTestVariant ?? 'default', phaseOrder)
    const {triggerSync} = useBackgroundSync(isOnline, serverOnline, submitData, scouterEmail!)

    useAutosave(phase, phaseIndex, scoutingDataRef, phaseOrder)
    useUnclaimOnExit(scoutingDataRef, submitStatusRef, isOnline, serverOnline, unclaimTeamBeacon, scouterEmail!)

    // ─── Render ───

    // Don't render phase content until variant is resolved — prevents setPhase
    // from being called with a stale phaseOrder during the async load.
    if (abTestVariant === null) return null

    const phaseLabel = (() => {
        if (phase === 'combined') return 'Auto + Teleop'
        if (phase === 'post') return 'Post-Match'
        return phase
    })()

    return (
        <>
            {/* Confirm Submit Dialog */}
            <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
                <DialogContent className="bg-zinc-800 border-zinc-500">
                    <DialogHeader className="text-zinc-400">
                        <DialogTitle>{postCanSubmit ? 'Confirm Submission' : 'Data Incomplete'}</DialogTitle>
                    </DialogHeader>
                    <div className="text-sm text-zinc-400 space-y-2">
                        {postCanSubmit ? (
                            <>
                                <p>You are about to submit scouting data for:</p>
                                <p className="font-semibold text-white">
                                    Team {scoutingData.teamNumber} — Match {scoutingData.match}
                                </p>
                                <p>This action cannot be undone.</p>
                            </>
                        ) : (
                            <>
                                <p className="font-semibold text-red-400 text-base">
                                    Data incomplete — fill in everything first.
                                </p>
                                <p>
                                    Please go back and make sure all required fields in the Post-Match
                                    section are filled in before submitting.
                                </p>
                            </>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setShowConfirmDialog(false)}>
                            {postCanSubmit ? 'Cancel' : 'Go Back'}
                        </Button>
                        {postCanSubmit && (
                            <Button
                                className="bg-green-600 hover:bg-green-700"
                                onClick={() => {
                                    setShowConfirmDialog(false)
                                    void executeSubmit()
                                }}
                            >
                                Confirm & Submit
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Resume Dialog */}
            <Dialog open={resume.showResumeDialog} onOpenChange={resume.setShowResumeDialog}>
                <DialogContent className="bg-zinc-800 border-zinc-500">
                    <DialogHeader className="text-zinc-400">
                        <DialogTitle>Resume Previous Sessions</DialogTitle>
                    </DialogHeader>
                    <div className="max-h-64 overflow-y-auto text-sm text-zinc-400 space-y-2">
                        {resume.resumeList.map(entry => (
                            <div
                                key={entry.key}
                                className="flex justify-between items-center bg-zinc-700/50 px-3 py-2 rounded-md"
                            >
                                <div>
                                    Match <strong>{entry.match}</strong> –{' '}
                                    Team <strong>{entry.teamNumber}</strong> ({entry.status})
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => resume.discardEntry(entry)}
                                    >
                                        Discard
                                    </Button>
                                    <Button
                                        size="sm"
                                        className={
                                            resume.resumeWarning[entry.key]
                                                ? "bg-red-600 hover:bg-red-700"
                                                : "bg-zinc-600"
                                        }
                                        onClick={() =>
                                            resume.resumeEntry(entry, (data, idx) => {
                                                setScoutingData(data)
                                                setPhaseIndex(idx)
                                            })
                                        }
                                    >
                                        {resume.resumeWarning[entry.key]
                                            ? "Unavailable"
                                            : resume.resumeLock[entry.key]
                                                ? "Loading..."
                                                : "Continue"}
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                resume.startNew()
                                resetToNew()
                            }}
                        >
                            Start New
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Main Layout */}
            <div className="w-screen min-h-0 h-screen flex flex-col overflow-hidden bg-zinc-900 text-white touch-none select-none overscroll-none">
                {/* Top Bar */}
                {!variantAFullControl && (
                    <div className="h-12 flex justify-between items-center px-4 bg-zinc-800 text-ml font-semibold shrink-0">
                        <div>{scouterName}</div>
                        <div>
                            {scoutingData.teamNumber !== null
                                ? `Team ${scoutingData.teamNumber}`
                                : 'Team –'}
                        </div>
                        <div>
                            Match #{scoutingData.match || '–'} ({scoutingData.alliance?.toUpperCase() || '–'})
                        </div>
                        <div className="capitalize">{phaseLabel}</div>
                    </div>
                )}

                {/* Phase Content */}
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain touch-auto scrollbar-dark">
                    <div className={variantAFullControl ? "h-full" : "text-4xl h-full"}>
                        {phase === 'pre' && (
                            <PrePhase key="pre" data={scoutingData} setData={setScoutingData}/>
                        )}
                        {abTestVariant === "a" && phase === 'auto' && (
                            <AutoPhase key="auto" data={scoutingData} setData={setScoutingData}/>
                        )}
                        {abTestVariant === "a" && phase === 'teleop' && (
                            <TeleopPhase key="teleop" data={scoutingData} setData={setScoutingData}/>
                        )}
                        {abTestVariant === "default" && (phase === 'auto' || phase === 'teleop') && (
                            <AVariant
                                key="combined"
                                data={scoutingData}
                                setData={setScoutingData}
                                handleSubmit={handleSubmit}
                                setPhase={setPhase}
                            />
                        )}
                        {abTestVariant === "b" && phase === 'combined' && (
    <BVariant
        key="combined"
        data={scoutingData}
        setData={setScoutingData}
        handleSubmit={handleSubmit}
        setPhase={setPhase}
    />
)}
                        {phase === 'post' && (
                            <PostMatch
                                key="post"
                                data={scoutingData}
                                setData={setScoutingData}
                                setCanSubmit={setPostCanSubmit}
                            />
                        )}
                    </div>
                </div>

                {/* Bottom Bar */}
                {!variantAFullControl && (
                    <div className="h-16 relative flex justify-between items-center px-4 bg-zinc-800 text-xl font-semibold shrink-0">
                        <Button
                            onClick={handleBack}
                            disabled={submitStatus === 'loading'}
                            className={submitStatus === 'loading' ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                        >
                            {phaseIndex < 1 ? 'home' : 'back'}
                        </Button>
                        <div className="absolute left-1/2 transform -translate-x-1/2 text-base text-zinc-400 pointer-events-none select-none">
                            {isOnline && serverOnline ? "Online" : "Offline"}
                        </div>
                        <LoadButton
                            status={submitStatus === "local" ? "success" : submitStatus}
                            onClick={phase === 'post' ? handleSubmit : handleNext}
                            disabled={baseDisabled}
                            className={baseDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                            message={
                                submitStatus === "success" ? "Submitted!"
                                    : submitStatus === "local" ? "Saved Locally"
                                        : undefined
                            }
                        >
                            {phase === 'post' ? 'Submit' : 'Next'}
                        </LoadButton>
                    </div>
                )}
            </div>
        </>
    )
}