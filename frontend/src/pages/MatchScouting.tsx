import {useState, useEffect} from 'react'

import {useNavigate} from "react-router-dom"

import type {MatchScoutingData, Phase, ScoutingStatus} from '@/types'

import {useAPI, getScouterName} from '@/hooks/useAPI.ts'
import {useClientEnvironment} from "@/hooks/useClientEnvironment.ts"
import {saveScoutingData, deleteScoutingData, db, type ScoutingDataWithKey, updateScoutingStatus} from "@/db/db.ts"

import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter} from "@/components/ui/dialog"
import {Button} from '@/components/ui/button'
import LoadButton from '@/components/ui/loadButton'

import Pre from "@/pages/Pre.tsx"

import AutoPhase from "@/components/seasons/2025/Auto.tsx"
import TeleopPhase from "@/components/seasons/2025/Teleop.tsx"
import PostMatch from "@/components/seasons/2025/Post.tsx"
import {createDefaultScoutingData} from "@/components/seasons/2025/yearConfig.ts"

const PHASE_ORDER: Phase[] = ['pre', 'auto', 'teleop', 'post']

export function MatchScoutingLayout() {
    // 1. External hooks
    const navigate = useNavigate()

    const {submitData, verify, unclaimTeam, updateState} = useAPI()
    const {isOnline, serverOnline} = useClientEnvironment()
    const scouterName = getScouterName()!

    // 2. State
    const [phaseIndex, setPhaseIndex] = useState(0)
    const [scoutingData, setScoutingData] = useState<MatchScoutingData>({
        ...createDefaultScoutingData(),
        scouter: scouterName,
    })
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'loading' | 'success' | 'local' | 'error' | 'warning'>('idle')
    const [showResumeDialog, setShowResumeDialog] = useState(false)
    const [resumeList, setResumeList] = useState<ScoutingDataWithKey[]>([]);

    // 3. Derived constants
    const phase = PHASE_ORDER[phaseIndex]
    const baseDisabled =
        scoutingData.match_type === null ||
        scoutingData.match === 0 ||
        scoutingData.alliance === null ||
        scoutingData.teamNumber === null

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
                setScoutingData({...createDefaultScoutingData(), scouter: scouterName})
                setPhaseIndex(0)
            }
        })()
    }, [])

    useEffect(() => {
        if (phase === "pre") return;

        // Determine if user entered anything different from default
        const isDataChanged = Object.keys(createDefaultScoutingData()).some(key => {
            const value = (scoutingData as any)[key];
            const defaultValue = (createDefaultScoutingData() as any)[key];
            return JSON.stringify(value) !== JSON.stringify(defaultValue);
        });

        if (!isDataChanged) return; // no changes, skip autosave

        const interval = setInterval(() => {
            const {match, match_type, teamNumber} = scoutingData;
            if (!match || !match_type || teamNumber == null) return;

            const status = PHASE_ORDER[phaseIndex] as ScoutingStatus;
            saveScoutingData(scoutingData, status).catch(err => {
                console.error("Autosave failed", err);
            });
        }, 3000);

        return () => clearInterval(interval);
    }, [scoutingData, phase, phaseIndex, isOnline, serverOnline]);


    useEffect(() => {
        const handleBeforeUnload = async () => {
            const {match, match_type, teamNumber} = scoutingData;
            if (isOnline && serverOnline && match && match_type && teamNumber) {
                try {
                    await updateState(match, teamNumber, match_type, scouterName, "offline" as any);
                    console.log(`Marked team ${teamNumber} offline for match ${match}`);
                } catch (err) {
                    console.warn("Failed to set offline on exit:", err);
                }
            }
        };

        // Handle browser close/refresh
        window.addEventListener("beforeunload", handleBeforeUnload);

        // Handle internal route change
        return () => {
            handleBeforeUnload();
            window.removeEventListener("beforeunload", handleBeforeUnload);
        };
    }, []); // fire on unmount

    useEffect(() => {
        return () => {
            // This cleanup runs before navigating away
            (async () => {
                const {match, match_type, teamNumber} = scoutingData;
                if (isOnline && serverOnline && match && match_type && teamNumber) {
                    try {
                        await updateState(match, teamNumber, match_type, scouterName, "offline" as any);
                        console.log(`Marked team ${teamNumber} offline for match ${match}`);
                    } catch (err) {
                        console.warn("Failed to set offline on exit:", err);
                    }
                }
            })();
        };
    }, [location.pathname]);

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
            scouter: scouterName,
            data: rest as Omit<MatchScoutingData, "match" | "alliance" | "teamNumber" | "scouter">,
        }

        const offlineAtSubmit = !isOnline || !serverOnline

        try {
            if (offlineAtSubmit) {
                await updateScoutingStatus(match_type!, match!, teamNumber!, "completed")
                await deleteScoutingData(match_type!, match!, teamNumber!)   // remove local autosave
                setSubmitStatus("local")

                setTimeout(async () => {
                    const result = await verify()
                    const allowed = result.success && result.permissions?.match_scouting
                    if (!allowed) return

                    setSubmitStatus("idle")
                    setScoutingData({...createDefaultScoutingData(), scouter: scouterName})
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
                    setScoutingData({...createDefaultScoutingData(), scouter: scouterName})
                    setPhaseIndex(0)
                }, 1000)
            }
        } catch (err) {
            await updateScoutingStatus(match_type!, match!, teamNumber!, "completed")
            setSubmitStatus("warning")

            setTimeout(async () => {
                const result = await verify()
                const allowed = result.success && result.permissions?.match_scouting
                if (!allowed) return

                setSubmitStatus("idle")
                setScoutingData({...createDefaultScoutingData(), scouter: scouterName})
                setPhaseIndex(0)
            }, 1000)
        }
    }


    const handleNext = async () => {
        if (baseDisabled) return
        const nextIndex = phaseIndex + 1
        setPhaseIndex(nextIndex)
        await updateState(scoutingData.match!, scoutingData.teamNumber!, scoutingData.match_type, scouterName, PHASE_ORDER[nextIndex],)
    }

    const handleBack = async () => {
        if (phaseIndex === 0) {
            navigate("/")
            return
        }
        const prevIndex = phaseIndex - 1
        setPhaseIndex(prevIndex)
        await updateState(scoutingData.match!, scoutingData.teamNumber!, scoutingData.match_type, scouterName, PHASE_ORDER[prevIndex],)
    }


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
                                                    await unclaimTeam(entry.match!, entry.teamNumber!, entry.match_type, scouterName);
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
                                        className="bg-zinc-600"
                                        onClick={async () => {
                                            try {
                                                if (isOnline && serverOnline)
                                                    await updateState(entry.match!, entry.teamNumber!, entry.match_type, scouterName, entry.status as Phase);
                                            } catch (err) {
                                                console.warn("Failed to resume team:", err);
                                            }
                                            setScoutingData(entry);
                                            setPhaseIndex(PHASE_ORDER.indexOf(entry.status as Phase));
                                            setShowResumeDialog(false);
                                        }}
                                    >
                                        Continue
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
                                setScoutingData({...createDefaultScoutingData(), scouter: scouterName});
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
                <div className="flex-1 min-h-0 overflow-hidden text-4xl h-full">
                    {phase === 'pre' && (
                        <Pre key="pre" data={scoutingData} setData={setScoutingData}/>
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
