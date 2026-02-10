import {useState, useEffect, useRef} from 'react'

import {useNavigate} from "react-router-dom"

import type {MatchScoutingData, Phase, ScoutingStatus} from '@/types'

import {useAPI} from '@/hooks/useAPI.ts'
import {useAuth} from '@/hooks/useAuth.ts'
import {useClientEnvironment} from "@/hooks/useClientEnvironment.ts"
import {saveScoutingData, deleteScoutingData, db, type ScoutingDataWithKey, updateScoutingStatus} from "@/db/db.ts"

import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter} from "@/components/ui/dialog"
import {Button} from '@/components/ui/button'
import LoadButton from '@/components/ui/loadButton'

import PrePhase from "@/components/seasons/2026/Pre.tsx"
import AutoPhase from "@/components/seasons/2026/Auto.tsx"
import TeleopPhase from "@/components/seasons/2026/Teleop.tsx"
import PostMatch from "@/components/seasons/2026/Post.tsx"
import {createDefaultScoutingData} from "@/components/seasons/2026/yearConfig.ts"

const PHASE_ORDER: Phase[] = ['pre', 'auto', 'teleop', 'post']

export default function MatchScoutingPage() {
    // 1. External hooks
    const navigate = useNavigate()

    const didUnclaimRef = useRef(false);

    const tryUnclaim = () => {
        if (didUnclaimRef.current) return;

        const {match, match_type, teamNumber} = scoutingData;

        if (!match || !match_type || !teamNumber) return;
        if (submitStatus === "success" || submitStatus === "local") return;
        if (!isOnline || !serverOnline) return;

        didUnclaimRef.current = true;

        unclaimTeamBeacon(
            match,
            teamNumber,
            match_type,
            scouterEmail!,
        );
    };


    const {isOnline, serverOnline} = useClientEnvironment()
    const {
        submitData,
        scoutingAction,
        unclaimTeamBeacon,
        updateState,
    } = useAPI()

    const {
        name: scouterName,
        email: scouterEmail,
        permissions,
        refresh,
    } = useAuth()

    // 2. State
    const [phaseIndex, setPhaseIndex] = useState(0)
    const [scoutingData, setScoutingData] = useState<MatchScoutingData>(() => ({
        ...createDefaultScoutingData(),
        scouter: scouterEmail!,
    }))
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'loading' | 'success' | 'local' | 'error' | 'warning'>('idle')
    const [showResumeDialog, setShowResumeDialog] = useState(false)
    const [resumeList, setResumeList] = useState<ScoutingDataWithKey[]>([]);
    const [resumeLock, setResumeLock] = useState<Record<number, boolean>>({});
    const [resumeWarning, setResumeWarning] = useState<Record<number, boolean>>({});
    // 3. Derived constants
    const phase = PHASE_ORDER[phaseIndex]
    const baseDisabled =
        scoutingData.match_type === null ||
        scoutingData.match === 0 ||
        scoutingData.alliance === null ||
        scoutingData.teamNumber === null

    function normalizeScoutingData<T extends object>(raw: T, defaults: T): T {
        if (typeof raw !== "object" || raw === null) return structuredClone(defaults);
        if (typeof defaults !== "object" || defaults === null) return structuredClone(raw);

        const result: any = Array.isArray(defaults) ? [] : {};

        // First, copy all keys from defaults
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

        // Then, copy any keys from raw that aren't in defaults (preserves saved data)
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

            // iOS Safari (non-standard)
            const docAny = document as any;
            if (docAny.webkitFullscreenElement) {
                await docAny.webkitExitFullscreen();
            }
        } catch {
            // ignore
        }
    };

    // 4. Effects
    useEffect(() => {
        (async () => {
            const entries: ScoutingDataWithKey[] = await db.scouting.toArray()

            const activeEntries = entries.filter(e =>
                ['pre', 'auto', 'teleop', 'post'].includes(e.status)
            );

            if (activeEntries.length > 0) {
                setResumeList(activeEntries);
                setShowResumeDialog(true);
            } else {
                setScoutingData({...createDefaultScoutingData(), scouter: scouterEmail!,})
                setPhaseIndex(0)
            }
        })()
    }, [])

    useEffect(() => {
        // Only start autosaving after leaving pre phase
        if (phase === "pre") return;

        const interval = setInterval(() => {
            const {match, match_type, teamNumber} = scoutingData;
            if (!match || !match_type || teamNumber == null) return;

            const status = PHASE_ORDER[phaseIndex] as ScoutingStatus;

            saveScoutingData(
                structuredClone ? structuredClone(scoutingData) : JSON.parse(JSON.stringify(scoutingData)),
                status
            ).catch(err => {
                console.error("Autosave failed:", err);
            });
        }, 3000);

        return () => clearInterval(interval);
    }, [phase, phaseIndex, scoutingData]);

    useEffect(() => {
        const onVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                tryUnclaim();
            }
        };

        const onPageHide = () => {
            tryUnclaim();
        };

        const onBeforeUnload = () => {
            tryUnclaim();
        };

        document.addEventListener("visibilitychange", onVisibilityChange);
        window.addEventListener("pagehide", onPageHide);
        window.addEventListener("beforeunload", onBeforeUnload);

        return () => {
            document.removeEventListener("visibilitychange", onVisibilityChange);
            window.removeEventListener("pagehide", onPageHide);
            window.removeEventListener("beforeunload", onBeforeUnload);
        };
    }, [
        scoutingData.match,
        scoutingData.match_type,
        scoutingData.teamNumber,
        submitStatus,
        isOnline,
        serverOnline
    ]);


    useEffect(() => {
        console.log("scoutingData updated:", scoutingData)
    }, [scoutingData])

    // 5. Event handlers
    const handleSubmit = async () => {
        if (baseDisabled) return

        setSubmitStatus("loading")
        const {match, match_type, teamNumber, alliance, scouter, ...rest} = scoutingData
        const fullData = {
            match_type,
            alliance,
            scouter: scouterEmail!,
            data: rest as Omit<MatchScoutingData, "match" | "alliance" | "teamNumber" | "scouter">,
        }

        const offlineAtSubmit = !isOnline || !serverOnline

        try {
            if (offlineAtSubmit) {
                await updateScoutingStatus(match_type!, match!, teamNumber!, "completed")
                await deleteScoutingData(match_type!, match!, teamNumber!)   // remove local autosave
                setSubmitStatus("local")

                setTimeout(async () => {
                    const ok = await refresh()
                    if (!ok || !permissions?.match_scouting) return


                    setSubmitStatus("idle")
                    setScoutingData({...createDefaultScoutingData(), scouter: scouterEmail!,})
                    setPhaseIndex(0)
                }, 1000)
            } else {
                const submitted = await submitData(Number(match), teamNumber!, fullData)
                if (!submitted) {
                    console.error("submitData returned false")
                    setSubmitStatus("error")
                    return
                }

                await deleteScoutingData(match_type!, match!, teamNumber!)   // already present in online case

                setSubmitStatus("success")
                setTimeout(() => {
                    setSubmitStatus("idle")
                    setScoutingData({...createDefaultScoutingData(), scouter: scouterEmail!,})
                    setPhaseIndex(0)
                }, 1000)
            }
        } catch {
            await updateScoutingStatus(match_type!, match!, teamNumber!, "completed")
            setSubmitStatus("warning")

            setTimeout(async () => {
                const ok = await refresh()
                if (!ok || !permissions?.match_scouting) return


                setSubmitStatus("idle")
                setScoutingData({...createDefaultScoutingData(), scouter: scouterEmail!,})
                setPhaseIndex(0)
            }, 1000)
        }
    }

    const handleNext = async () => {
        if (baseDisabled) return
        const nextIndex = phaseIndex + 1
        setPhaseIndex(nextIndex)
        await updateState(scoutingData.match!, scoutingData.teamNumber!, scoutingData.match_type, scouterEmail!, PHASE_ORDER[nextIndex],)
    }

    const handleBack = async () => {
        await exitFullscreenIfNeeded();

        if (phaseIndex === 0) {
            navigate("/");
            return;
        }

        const prevIndex = phaseIndex - 1;
        setPhaseIndex(prevIndex);
        await updateState(
            scoutingData.match!,
            scoutingData.teamNumber!,
            scoutingData.match_type,
            scouterEmail!,
            PHASE_ORDER[prevIndex],
        );
    };

    return (
        <>
            <Dialog open={showResumeDialog} onOpenChange={setShowResumeDialog}>
                <DialogContent className="bg-zinc-800 border-zinc-500">
                    <DialogHeader className="text-zinc-400">
                        <DialogTitle>Resume Previous Sessions</DialogTitle>
                    </DialogHeader>

                    <div className="max-h-64 overflow-y-auto text-sm text-zinc-400 space-y-2">
                        {resumeList.map(entry => (
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
                                        onClick={async () => {
                                            try {
                                                if (isOnline && serverOnline)
                                                    await scoutingAction(entry.match!, entry.teamNumber!, entry.match_type, entry.alliance, "unclaim")
                                            } catch (err) {
                                                console.warn("Failed to unclaim during discard:", err);
                                            }
                                            await db.scouting.delete(entry.key);
                                            setResumeList(r => r.filter(e => e.key !== entry.key));
                                            if (resumeList.length === 1) setShowResumeDialog(false);
                                        }}
                                    >
                                        Discard
                                    </Button>
                                    <Button
                                        size="sm"
                                        className={
                                            resumeWarning[entry.key]
                                                ? "bg-red-600 hover:bg-red-700"
                                                : "bg-zinc-600"
                                        }
                                        onClick={async () => {
                                            // Prevent spamming while in-flight
                                            if (resumeLock[entry.key]) return;

                                            setResumeLock(prev => ({...prev, [entry.key]: true}));
                                            setResumeWarning(prev => ({...prev, [entry.key]: false}));

                                            try {
                                                if (isOnline && serverOnline) {
                                                    const success = await scoutingAction(entry.match!, entry.teamNumber!, entry.match_type, entry.alliance, "claim")

                                                    if (!success) {
                                                        console.error(`Failed to reclaim team from saved data:`,
                                                            `Match ${entry.match}, Team ${entry.teamNumber}, Type ${entry.match_type}`,
                                                            `Reason: claimTeam returned false - team may be claimed by another scouter`
                                                        );

                                                        // Trigger non-blocking visual warning and unlock button
                                                        setResumeWarning(prev => ({...prev, [entry.key]: true}));
                                                        setResumeLock(prev => ({...prev, [entry.key]: false}));

                                                        return;
                                                    }

                                                    await updateState(
                                                        entry.match!,
                                                        entry.teamNumber!,
                                                        entry.match_type,
                                                        scouterEmail!,
                                                        entry.status as Phase
                                                    );
                                                }

                                                const restored = normalizeScoutingData(entry, {
                                                    ...createDefaultScoutingData(),
                                                    scouter: scouterEmail!,
                                                });

                                                setScoutingData(restored);
                                                setPhaseIndex(PHASE_ORDER.indexOf(entry.status as Phase));
                                                setShowResumeDialog(false);

                                            } catch (err) {
                                                console.warn("Failed to resume team:", err);

                                                // Unlock button on failure
                                                setResumeLock(prev => ({...prev, [entry.key]: false}));

                                            } finally {
                                                // If it succeeded, the dialog closes and lock clears naturally.
                                                // If not succeeded, lock already reset above.
                                            }
                                        }}
                                    >
                                        {resumeWarning[entry.key]
                                            ? "Unavailable"
                                            : resumeLock[entry.key]
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
                                setShowResumeDialog(false);
                                setScoutingData({...createDefaultScoutingData(), scouter: scouterEmail});
                                setPhaseIndex(0);
                            }}
                        >
                            Start New
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <div
                className="w-screen min-h-0 h-screen flex flex-col overflow-hidden bg-zinc-900 text-white touch-none select-none">
                {/* Top Bar */}
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
                    <div className="capitalize">{phase}</div>
                </div>

                {/* Middle Section (Phases) */}
                <div
                    className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain touch-auto scrollbar-dark">
                    <div className="text-4xl">
                        {phase === 'pre' && (
                            <PrePhase key="pre" data={scoutingData} setData={setScoutingData}/>
                        )}
                        {phase === 'auto' && (
                            <AutoPhase key="auto" data={scoutingData} setData={setScoutingData}/>
                        )}
                        {phase === 'teleop' && (
                            <TeleopPhase key="teleop" data={scoutingData} setData={setScoutingData}/>
                        )}
                        {phase === 'post' && (
                            <PostMatch key="post" data={scoutingData} setData={setScoutingData}/>
                        )}
                    </div>
                </div>

                {/* Bottom Bar */}
                <div
                    className="h-16 relative flex justify-between items-center px-4 bg-zinc-800 text-xl font-semibold shrink-0">
                    <Button
                        onClick={handleBack}
                        disabled={submitStatus === 'loading'}
                        className={
                            submitStatus === 'loading'
                                ? 'cursor-not-allowed opacity-50'
                                : 'cursor-pointer'
                        }
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
                        className={
                            baseDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                        }
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
            </div>

        </>
    )
}
