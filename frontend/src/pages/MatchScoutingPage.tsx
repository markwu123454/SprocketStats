import {useState, useEffect, useRef, useMemo, useCallback} from 'react'

import {useNavigate} from "react-router-dom"

import type {MatchScoutingData, MatchType, ScoutingStatus} from '@/types'

import {useAPI} from '@/hooks/useAPI.ts'
import {useAuth} from '@/hooks/useAuth.ts'
import {useClientEnvironment} from "@/hooks/useClientEnvironment.ts"
import {saveScoutingData, db, type ScoutingDataWithKey} from "@/db/db.ts"
import useFeatureFlags from "@/hooks/useFeatureFlags.ts";

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

type Phase = 'pre' | 'auto' | 'teleop' | 'combined' | 'post'

// ─── Utility: deep-merge saved data with current defaults ───
function normalizeScoutingData<T extends object>(raw: T, defaults: T): T {
    if (typeof raw !== "object" || raw === null) return structuredClone(defaults);
    if (typeof defaults !== "object" || defaults === null) return structuredClone(raw);

    const result: any = Array.isArray(defaults) ? [] : {};

    for (const key in defaults) {
        if (Object.hasOwn(raw, key)) {
            if (typeof defaults[key] === "object" && defaults[key] !== null && !Array.isArray(defaults[key])) {
                result[key] = normalizeScoutingData((raw as any)[key], (defaults as any)[key]);
            } else {
                result[key] = (raw as any)[key];
            }
        } else {
            result[key] = structuredClone((defaults as any)[key]);
        }
    }

    for (const key in raw) {
        if (!Object.hasOwn(defaults, key)) {
            result[key] = structuredClone((raw as any)[key]);
        }
    }

    return result;
}

const exitFullscreenIfNeeded = async () => {
    try {
        if (document.fullscreenElement) {
            await document.exitFullscreen();
            return;
        }
        const docAny = document as any;
        if (docAny.webkitFullscreenElement) {
            await docAny.webkitExitFullscreen();
        }
    } catch {
        // ignore
    }
};

// ─── Build the upload payload consistently ───
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

// ─── Custom hook: resume dialog logic ───
function useResumeDialog(scouterEmail: string, abTestVariant: string, PHASE_ORDER: Phase[]) {
    const {isOnline, serverOnline} = useClientEnvironment()
    const {scoutingAction} = useAPI()

    const [showResumeDialog, setShowResumeDialog] = useState(false)
    const [resumeList, setResumeList] = useState<ScoutingDataWithKey[]>([])
    const [resumeLock, setResumeLock] = useState<Record<number, boolean>>({})
    const [resumeWarning, setResumeWarning] = useState<Record<number, boolean>>({})

    useEffect(() => {
        (async () => {
            const entries: ScoutingDataWithKey[] = await db.scouting.toArray()
            const activeEntries = entries.filter(e =>
                ['pre', 'auto', 'teleop', 'combined', 'post'].includes(e.status)
            );
            if (activeEntries.length > 0) {
                setResumeList(activeEntries);
                setShowResumeDialog(true);
            }
        })()
    }, [])

    const discardEntry = useCallback(async (entry: ScoutingDataWithKey) => {
        try {
            if (isOnline && serverOnline)
                await scoutingAction(entry.match!, entry.teamNumber!, entry.match_type, entry.alliance, "unclaim")
        } catch (err) {
            console.warn("Failed to unclaim during discard:", err);
        }
        await db.scouting.delete(entry.key);
        setResumeList(r => {
            const next = r.filter(e => e.key !== entry.key);
            if (next.length === 0) setShowResumeDialog(false);
            return next;
        });
    }, [isOnline, serverOnline, scoutingAction])

    const resumeEntry = useCallback(async (
        entry: ScoutingDataWithKey,
        onSuccess: (data: MatchScoutingData, phaseIndex: number) => void,
    ) => {
        if (resumeLock[entry.key]) return;

        setResumeLock(prev => ({...prev, [entry.key]: true}));
        setResumeWarning(prev => ({...prev, [entry.key]: false}));

        try {
            if (isOnline && serverOnline) {
                const success = await scoutingAction(entry.match!, entry.teamNumber!, entry.match_type, entry.alliance, "claim")
                if (!success) {
                    setResumeWarning(prev => ({...prev, [entry.key]: true}));
                    setResumeLock(prev => ({...prev, [entry.key]: false}));
                    return;
                }

                // For variant b, map auto/teleop to combined for server status
                let phaseToUpdate = entry.status as Phase;
                if (abTestVariant === "b" && (entry.status === "auto" || entry.status === "teleop")) {
                    phaseToUpdate = "combined";
                }

                await scoutingAction(
                    entry.match!, entry.teamNumber!, entry.match_type!, entry.alliance!,
                    `set_${phaseToUpdate}` as any,
                );
            }

            const restored = normalizeScoutingData(entry, {
                ...createDefaultScoutingData(),
                scouter: scouterEmail,
            });

            // For variant b, map auto/teleop to combined for phase index lookup
            let targetPhase = entry.status as Phase;
            if (abTestVariant === "b" && (entry.status === "auto" || entry.status === "teleop")) {
                targetPhase = "combined";
            }

            onSuccess(restored as MatchScoutingData, PHASE_ORDER.indexOf(targetPhase));
            setShowResumeDialog(false);
        } catch (err) {
            console.warn("Failed to resume team:", err);
            setResumeLock(prev => ({...prev, [entry.key]: false}));
        }
    }, [isOnline, serverOnline, scoutingAction, abTestVariant, scouterEmail, PHASE_ORDER, resumeLock])

    const startNew = useCallback(() => {
        setShowResumeDialog(false);
    }, [])

    return {
        showResumeDialog, setShowResumeDialog,
        resumeList, resumeLock, resumeWarning,
        discardEntry, resumeEntry, startNew,
    }
}

// ─── Custom hook: autosave with stable interval ───
function useAutosave(
    phase: Phase,
    phaseIndex: number,
    scoutingDataRef: React.RefObject<MatchScoutingData>,
    PHASE_ORDER: Phase[],
) {
    useEffect(() => {
        if (phase === "pre") return;

        const interval = setInterval(() => {
            const data = scoutingDataRef.current;
            if (!data) return;

            const {match, match_type, teamNumber} = data;
            if (!match || !match_type || teamNumber == null) return;

            const status = PHASE_ORDER[phaseIndex] as ScoutingStatus;
            const snapshot = structuredClone ? structuredClone(data) : JSON.parse(JSON.stringify(data));

            saveScoutingData(snapshot, status).catch(err => {
                console.error("Autosave failed:", err);
            });
        }, 3000);

        return () => clearInterval(interval);
    }, [phase, phaseIndex, PHASE_ORDER]);
    // scoutingDataRef is stable — no need in deps
}

// ─── Custom hook: unclaim on page hide/unload ───
function useUnclaimOnExit(
    scoutingDataRef: React.RefObject<MatchScoutingData>,
    submitStatusRef: React.RefObject<string>,
    isOnline: boolean,
    serverOnline: boolean,
    unclaimTeamBeacon: (match: number, team: number, match_type: MatchType, email: string) => void,
    scouterEmail: string,
) {
    const didUnclaimRef = useRef(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Reset the flag when key data changes
    useEffect(() => {
        didUnclaimRef.current = false;
    }, [
        scoutingDataRef.current?.match,
        scoutingDataRef.current?.match_type,
        scoutingDataRef.current?.teamNumber,
    ])

    useEffect(() => {
        const tryUnclaim = () => {
            if (didUnclaimRef.current) return;

            const data = scoutingDataRef.current;
            if (!data) return;

            const {match, match_type, teamNumber} = data;
            if (!match || !match_type || !teamNumber) return;

            const status = submitStatusRef.current;
            if (status === "success" || status === "local") return;
            if (!isOnline || !serverOnline) return;

            didUnclaimRef.current = true;
            unclaimTeamBeacon(match, teamNumber, match_type, scouterEmail);
        };

        const onVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                timeoutRef.current = setTimeout(tryUnclaim, 30000);
            } else {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
            }
        };
        const onPageHide = () => tryUnclaim();
        const onBeforeUnload = () => tryUnclaim();

        document.addEventListener("visibilitychange", onVisibilityChange);
        window.addEventListener("pagehide", onPageHide);
        window.addEventListener("beforeunload", onBeforeUnload);

        return () => {
            document.removeEventListener("visibilitychange", onVisibilityChange);
            window.removeEventListener("pagehide", onPageHide);
            window.removeEventListener("beforeunload", onBeforeUnload);
        };
    }, [isOnline, serverOnline, scouterEmail, unclaimTeamBeacon]);
}

// ─── Custom hook: single background upload loop ───
// This is the ONLY place that uploads completed entries to the server.
// It runs on mount, on a 30s interval, and can be triggered manually.
function useBackgroundSync(
    isOnline: boolean,
    serverOnline: boolean,
    submitData: (match: number, team: number, data: any) => Promise<boolean>,
    scouterEmail: string,
) {
    const isSyncingRef = useRef(false)

    const sync = useCallback(async () => {
        if (!isOnline || !serverOnline) return
        // Prevent concurrent sync runs
        if (isSyncingRef.current) return
        isSyncingRef.current = true

        try {
            const completed = await db.scouting
                .where('status')
                .equals('completed')
                .toArray()

            for (const entry of completed) {
                try {
                    const {match, teamNumber, payload} = buildUploadPayload(entry, scouterEmail)
                    const success = await submitData(match, teamNumber, payload)

                    if (success) {
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

    // Run on mount, interval, and whenever connectivity changes
    useEffect(() => {
        sync()
        const interval = setInterval(sync, 30_000)
        return () => clearInterval(interval)
    }, [sync])

    // Manual trigger: bump counter to kick off sync
    const triggerSync = useCallback(() => {
        // Fire-and-forget — sync guards itself against concurrency
        sync()
    }, [sync])

    return {triggerSync}
}


// ═══════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════
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
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'loading' | 'success' | 'local' | 'error' | 'warning'>('idle')
    const [showConfirmDialog, setShowConfirmDialog] = useState(false)
    const [abTestVariant, setAbTestVariant] = useState<"default" | "a" | "b">("default")

    // ─── Stable refs for use in intervals/event listeners ───
    const scoutingDataRef = useRef(scoutingData)
    scoutingDataRef.current = scoutingData

    const submitStatusRef = useRef(submitStatus)
    submitStatusRef.current = submitStatus

    // ─── Derived ───
    // Both "default" (stable) and "a" use auto/teleop/post phases for tracking.
    // Only "b" uses the combined phase.
    const PHASE_ORDER: Phase[] = useMemo(() => {
        return abTestVariant === "b"
            ? ['pre', 'combined', 'post']
            : ['pre', 'auto', 'teleop', 'post']
    }, [abTestVariant])

    const phase = PHASE_ORDER[phaseIndex]

    // In "default" variant, AVariant takes full control during auto and teleop phases
    const variantAFullControl = abTestVariant === "default" && (phase === "auto" || phase === "teleop")

    const baseDisabled =
        scoutingData.match_type === null ||
        scoutingData.match === 0 ||
        scoutingData.alliance === null ||
        scoutingData.teamNumber === null

    // ─── Reset helper ───
    const resetToNew = useCallback(() => {
        setScoutingData(prev => {
            const defaults = createDefaultScoutingData()

            return {
                ...defaults,

                // carry forward
                match_type: prev.match_type,
                match: (prev.match ?? 0) + 1,

                // explicitly reset
                alliance: null,

                // always re-stamp scouter
                scouter: scouterEmail!,
            }
        })

        setPhaseIndex(0)
    }, [scouterEmail])

    // ─── Load A/B test variant ───
    useEffect(() => {
        (async () => {
            const variant = await getSetting("match_ab_test")
            setAbTestVariant(variant || "default")
        })()
    }, [])

    // ─── Resume dialog hook ───
    const resume = useResumeDialog(scouterEmail!, abTestVariant, PHASE_ORDER)

    // ─── Background sync hook (single upload loop) ───
    const {triggerSync} = useBackgroundSync(isOnline, serverOnline, submitData, scouterEmail!)

    // ─── Autosave hook (reads from ref, stable interval) ───
    useAutosave(phase, phaseIndex, scoutingDataRef, PHASE_ORDER)

    // ─── Unclaim on exit hook ───
    useUnclaimOnExit(
        scoutingDataRef,
        submitStatusRef,
        isOnline,
        serverOnline,
        unclaimTeamBeacon,
        scouterEmail!,
    )

    // ─── Submit logic (offline-first) ───
    //
    // 1. Save the FULL current data snapshot to IndexedDB as "completed"
    // 2. Show success immediately (data is safe locally)
    // 3. Kick off background sync to upload if online
    //
    const executeSubmit = useCallback(async () => {
        if (baseDisabled) return

        setSubmitStatus("loading")

        try {
            // FIX #1: Save the full data snapshot, not just a status update.
            // This ensures no data is lost between the last autosave and submit.
            const snapshot = structuredClone(scoutingData)
            await saveScoutingData(snapshot, "completed")

            // Offline-first: always show success since data is persisted locally.
            setSubmitStatus("success")

            // FIX #2: Trigger the single background sync loop.
            // No duplicate upload logic — useBackgroundSync handles everything.
            triggerSync()

            setTimeout(() => {
                setSubmitStatus("idle")
                resetToNew()
            }, 1000)

        } catch (err) {
            console.error("Local save failed:", err)
            setSubmitStatus("error")
        }
    }, [baseDisabled, scoutingData, resetToNew, triggerSync])

    const handleSubmit = useCallback(() => {
        if (baseDisabled) return
        if (featureFlags.confirmBeforeUpload) {
            setShowConfirmDialog(true)
            return
        }
        void executeSubmit()
    }, [baseDisabled, featureFlags.confirmBeforeUpload, executeSubmit])

    const setPhase = useCallback(
        async (targetPhase: Phase) => {
            const targetIndex = PHASE_ORDER.indexOf(targetPhase)
            if (targetIndex === -1) return

            setPhaseIndex(targetIndex)

            await scoutingAction(
                scoutingData.match!,
                scoutingData.teamNumber!,
                scoutingData.match_type!,
                scoutingData.alliance!,
                `set_${targetPhase}` as any,
            )
        },
        [PHASE_ORDER, scoutingAction, scoutingData],
    )

    const handleNext = useCallback(async () => {
        if (baseDisabled) return

        const nextPhase = PHASE_ORDER[phaseIndex + 1]

        if (!nextPhase) return

        await setPhase(nextPhase)
    }, [baseDisabled, PHASE_ORDER, phaseIndex, setPhase])

    const handleBack = useCallback(async () => {
        const currentPhase = PHASE_ORDER[phaseIndex]

        if (currentPhase === 'pre') {
            await exitFullscreenIfNeeded()
            navigate("/")
            return
        }

        const prevPhase = PHASE_ORDER[phaseIndex - 1]
        if (!prevPhase) return

        await setPhase(prevPhase)
    }, [PHASE_ORDER, phaseIndex, setPhase, navigate])


    return (
        <>
            {/* Confirm Submit Dialog */}
            <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
                <DialogContent className="bg-zinc-800 border-zinc-500">
                    <DialogHeader className="text-zinc-400">
                        <DialogTitle>Confirm Submission</DialogTitle>
                    </DialogHeader>

                    <div className="text-sm text-zinc-400 space-y-2">
                        <p>You are about to submit scouting data for:</p>
                        <p className="font-semibold text-white">
                            Team {scoutingData.teamNumber} — Match {scoutingData.match}
                        </p>
                        <p>This action cannot be undone.</p>
                    </div>

                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setShowConfirmDialog(false)}>
                            Cancel
                        </Button>
                        <Button
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => {
                                setShowConfirmDialog(false);
                                void executeSubmit();
                            }}
                        >
                            Confirm & Submit
                        </Button>
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
                                    Match <strong>{entry.match}</strong> –
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
            <div
                className="w-screen min-h-0 h-screen flex flex-col overflow-hidden bg-zinc-900 text-white touch-none select-none overscroll-none ">
                {/* Top Bar — hidden when variant A has full control */}
                {!variantAFullControl && (
                    <div
                        className="h-12 flex justify-between items-center px-4 bg-zinc-800 text-ml font-semibold shrink-0">
                        <div>{scouterName}</div>
                        <div>
                            {scoutingData.teamNumber !== null
                                ? `Team ${scoutingData.teamNumber}`
                                : 'Team –'}
                        </div>
                        <div>
                            Match #{scoutingData.match || '–'} ({scoutingData.alliance?.toUpperCase() || '–'})
                        </div>
                        <div className="capitalize">
                            {phase === 'combined' ? 'Auto + Teleop' : phase}
                        </div>
                    </div>
                )}

                {/* Phases */}
                <div
                    className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain touch-auto scrollbar-dark ${variantAFullControl ? '' : ''}`}>
                    <div className={variantAFullControl ? "h-full" : "text-4xl"}>
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
                            <BVariant key="combined" data={scoutingData} setData={setScoutingData}/>
                        )}
                        {phase === 'post' && (
                            <PostMatch key="post" data={scoutingData} setData={setScoutingData}/>
                        )}
                    </div>
                </div>

                {/* Bottom Bar — hidden when variant A has full control */}
                {!variantAFullControl && (
                    <div
                        className="h-16 relative flex justify-between items-center px-4 bg-zinc-800 text-xl font-semibold shrink-0">
                        <Button
                            onClick={handleBack}
                            disabled={submitStatus === 'loading'}
                            className={submitStatus === 'loading' ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                        >
                            {phaseIndex < 1 ? 'home' : 'back'}
                        </Button>

                        <div
                            className="absolute left-1/2 transform -translate-x-1/2 text-base text-zinc-400 pointer-events-none select-none">
                            {isOnline && serverOnline ? "Online" : "Offline"}
                        </div>

                        <LoadButton
                            status={submitStatus === "local" ? "success" : submitStatus}
                            onClick={phase === 'post' ? handleSubmit : handleNext}
                            disabled={baseDisabled}
                            className={baseDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                            message={
                                submitStatus === "success"
                                    ? "Submitted!"
                                    : submitStatus === "local"
                                        ? "Saved Locally"
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