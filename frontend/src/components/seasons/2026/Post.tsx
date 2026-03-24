import React, {useEffect} from "react"
import type {MatchScoutingData} from "@/types"
import {AlertTriangle, Hand} from "lucide-react";
import RatingSlider from "@/components/ui/ratingSlider"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function ToggleChip({label, active, onToggle}: {
    label: string
    active: boolean
    onToggle: () => void
}) {
    return (
        <button
            type="button"
            onClick={onToggle}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border
                ${active
                ? "bg-blue-600 text-white border-blue-500"
                : "bg-neutral-800 text-neutral-300 border-neutral-700 hover:border-neutral-500"}`}
        >
            {label}
        </button>
    )
}

function SectionHeader({children}: { children: React.ReactNode }) {
    return <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mt-3 mb-2">{children}</h3>
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PostMatch({data, setData, setCanSubmit}: {
    data: MatchScoutingData
    setData: React.Dispatch<React.SetStateAction<MatchScoutingData>>
    setCanSubmit: React.Dispatch<React.SetStateAction<boolean>>
}) {
    const pm = data.postmatch;

    useEffect(() => {
        if (!setCanSubmit) return
        const canSubmit =
            pm.role !== null &&
            pm.traversalLocation !== null
        setCanSubmit(canSubmit)
    }, [pm.role, pm.traversalLocation, setCanSubmit])

    const update = <K extends keyof MatchScoutingData["postmatch"]>(
        key: K,
        value: MatchScoutingData["postmatch"][K],
    ) => {
        setData(prev => ({
            ...prev,
            postmatch: {...prev.postmatch, [key]: value},
        }))
    }

    const toggleNested = <
        G extends "intakePos" | "faults",
        K extends keyof MatchScoutingData["postmatch"][G],
    >(group: G, key: K) => {
        setData(prev => ({
            ...prev,
            postmatch: {
                ...prev.postmatch,
                [group]: {
                    ...(prev.postmatch[group] as Record<string, boolean>),
                    [key]: !(prev.postmatch[group] as Record<string, boolean>)[key as string],
                },
            },
        }))
    }

    return (
        <div className="p-6 w-full h-full mx-auto space-y-6">
            {/* 2x2 Grid Container */}
            <div className="flex flex-col lg:flex-row gap-8 w-full items-start">
                <div className="flex-2 w-full space-y-6">

                    {/* ---- SECTION 1: PERFORMANCE ---- */}
                    <div className="bg-neutral-900/50 px-6 pb-6 rounded-2xl border border-neutral-800 space-y-2">
                        <SectionHeader>Performance</SectionHeader>
                        <RatingSlider
                            title="Offensive Skill"
                            value={pm.skill}
                            onChange={v => update("skill", v)}
                            step={0.0001}
                            leftLabel="Poor"
                            rightLabel="Elite"
                            infoBox="Overall ability to score game pieces and contribute to the alliance score."
                        />
                        <RatingSlider
                            title="Defensive Skill"
                            value={pm.defenseSkill ?? 0}
                            onChange={v => update("defenseSkill", v)}
                            step={0.0001}
                            leftLabel="None"
                            rightLabel="Shut-down"
                            infoBox="Effectiveness at pinning, pushing, or blocking opponent cycles."
                        />
                        <RatingSlider
                            title="Robot Speed"
                            value={pm.speed}
                            onChange={v => update("speed", v)}
                            step={0.0001}
                            leftLabel="Slow"
                            rightLabel="Fast"
                        />
                    </div>

                    {/* ---- SECTION 1B: ROBOT TYPE ---- */}
                    <div className="bg-neutral-900/50 px-6 pb-6 rounded-2xl border border-neutral-800">
                        <SectionHeader>Robot Type</SectionHeader>

                        <div className="flex flex-col gap-1">
                            {Object.entries({
                                "Shooter": "This robot is good at scoring fuel in the hub",
                                "Intake": "This robot passes fuel to their alliance or their human players",
                                "Defense": "This robot spends the majority of it's time on the opposing alliance's side",
                                "Generalist": "This robot fits two or more of the types above",
                                "Useless": "This robot actively does not participate in the match",
                            }).map(([key, description]) => {
                                const isActive = pm.role === key;
                                return (
                                    <div
                                        key={key}
                                        onClick={() => update("role", key as any)}
                                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all group ${isActive
                                            ? "bg-blue-950/40 border-blue-500 shadow-[inset_0_0_10px_rgba(59,130,246,0.2)]"
                                            : "bg-neutral-900/40 border-neutral-800/50 hover:bg-neutral-800 hover:border-neutral-600"}`}
                                    >
                                        <div className="w-38 shrink-0">
                                            <span
                                                className={`flex items-center text-xs font-bold uppercase tracking-wide ${isActive ? 'text-blue-400' : 'text-neutral-300'}`}>
                                                {key.replace("_", " ")}
                                            </span>
                                        </div>

                                        <span
                                            className={`grow text-sm transition-colors ${isActive ? 'text-blue-200/60' : 'text-neutral-500'}`}>
                                            {description}
                                        </span>

                                        <div className="shrink-0 ml-4">
                                            <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all
                                            ${isActive
                                                ? "bg-blue-800 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                                                : "border-neutral-700 bg-neutral-950 group-hover:border-neutral-500"}`}
                                            >
                                                {isActive && (
                                                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24"
                                                         stroke="currentColor" strokeWidth={4}>
                                                        <path strokeLinecap="round" strokeLinejoin="round"
                                                              d="M5 13l4 4L19 7"/>
                                                    </svg>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ---- SECTION 3: FIELD & CLIMB ---- */}
                    <div className="bg-neutral-900/50 px-6 pb-6 rounded-2xl border border-neutral-800 space-y-4">
                        <SectionHeader>Field Positioning</SectionHeader>

                        <div className="space-y-4">
                            <p className="text-xs text-neutral-500 font-bold uppercase">Traversal Preference</p>
                            <div className="flex gap-2">
                                {["Trench", "Bump", "No Preference"].map(loc => (
                                    <ToggleChip key={loc} label={loc} active={pm.traversalLocation === loc}
                                                onToggle={() => update("traversalLocation", loc as any)}/>
                                ))}
                            </div>

                            <p className="text-xs text-neutral-500 font-bold uppercase mt-4">Intake Locations</p>
                            <div className="flex flex-wrap gap-2">
                                {Object.keys(pm.intakePos).map((pos) => (
                                    <ToggleChip key={pos} label={pos.toUpperCase()} active={(pm.intakePos as any)[pos]}
                                                onToggle={() => toggleNested("intakePos", pos as any)}/>
                                ))}
                            </div>

                            <div className="grid grid-cols-2 gap-4 mt-4">
                                <div>
                                    <p className="text-xs text-neutral-500 font-bold uppercase mb-2">Auto Climb</p>
                                    <select
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-md p-2 text-sm"
                                        value={pm.autoClimbPos || ""}
                                        onChange={e => update("autoClimbPos", (e.target.value || null) as any)}
                                    >
                                        <option value="">None</option>
                                        {["Front Center", "Front Left", "Front Right", "Side Left", "Side Right", "No Climb"].map(opt =>
                                            <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <p className="text-xs text-neutral-500 font-bold uppercase mb-2">Teleop Climb</p>
                                    <select
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-md p-2 text-sm"
                                        value={pm.teleopClimbPos || ""}
                                        onChange={e => update("teleopClimbPos", (e.target.value || null) as any)}
                                    >
                                        <option value="">None</option>
                                        {["Front Center", "Front Left", "Front Right", "Side Left", "Side Right", "No Climb"].map(opt =>
                                            <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-3 lg:w-8xl space-y-6">
                    {/* ---- SECTION 2: FAULTS ---- */}
                    <div className="bg-neutral-900/50 px-6 pb-6 rounded-2xl border border-neutral-800">
                        <SectionHeader>Robot Faults (Observable Behavior)</SectionHeader>

                        <div className="flex flex-col gap-1">
                            {Object.entries({
                                disconnected: "Robot stopped moving, lights went dark, or stayed still for remainder of match",
                                brownout: "Robot stuttered, lost power briefly, or lights flickered during heavy movement",
                                disabled: "Robot stopped moving entirely, but lights/indicators stayed on",
                                immobilized: "Drive base is spinning/working, but robot is physically stuck and cannot move, or robot fell over",
                                erratic_driving: "Robot is spinning uncontrollably, drifting heavily, or unable to drive straight",
                                jam: "A game piece is visibly stuck in the intake or stuck inside the robot frame",
                                structural_failure: "Parts of the robot (bumpers, intake, arm) are hanging off or fell off",
                                failed_auto: "Robot moved during Auto but missed its targets or crashed into something",
                                other: "Something went wrong that doesn't fit the categories above"
                            }).map(([key, description]) => {
                                const isActive = (pm.faults)[key as keyof typeof pm.faults];
                                return (
                                    <div
                                        key={key}
                                        onClick={() => toggleNested("faults", key as any)}
                                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all group ${isActive
                                            ? "bg-red-950/40 border-red-500 shadow-[inset_0_0_10px_rgba(220,38,38,0.2)]"
                                            : "bg-neutral-900/40 border-neutral-800/50 hover:bg-neutral-800 hover:border-neutral-600"}`}
                                    >
                                        <div className="w-38 shrink-0">
                                            <span
                                                className={`flex items-center text-xs font-bold uppercase tracking-wide ${isActive ? 'text-red-400' : 'text-neutral-300'}`}>
                                                {key.replace("_", " ")}
                                            </span>
                                        </div>

                                        <span
                                            className={`grow text-sm transition-colors ${isActive ? 'text-red-200/60' : 'text-neutral-500'}`}>
                                            {description}
                                        </span>

                                        <div className="shrink-0 ml-4">
                                            <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all
                                            ${isActive
                                                ? "bg-red-800 border-red-500 shadow-[0_0_15px_rgba(220,38,38,0.5)]"
                                                : "border-neutral-700 bg-neutral-950 group-hover:border-neutral-500"}`}
                                            >
                                                {isActive && (
                                                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24"
                                                         stroke="currentColor" strokeWidth={4}>
                                                        <path strokeLinecap="round" strokeLinejoin="round"
                                                              d="M5 13l4 4L19 7"/>
                                                    </svg>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ---- SECTION 4: NOTES ---- */}
                    <div
                        className="bg-neutral-900/50 px-6 pb-6 rounded-2xl border border-neutral-800 flex flex-col min-h-2xl">
                        <div className="flex justify-between items-center mb-2">
                            <SectionHeader>Scouter Notes</SectionHeader>

                            <button
                                type="button"
                                onClick={() => update("messed_up", !pm.messed_up)}
                                className={`flex items-center gap-2 px-3 py-2 mt-2 rounded-lg text-xs font-bold transition-all border ${
                                    pm.messed_up
                                        ? "bg-emerald-900/60 border-emerald-500 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                                        : "bg-blue-950/40 border-blue-500/50 text-blue-300 hover:bg-blue-900/40 hover:border-blue-400"
                                }`}
                            >
                                {pm.messed_up ? (
                                    <>
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                             strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                                        </svg>
                                        FLAGGED — THANKS FOR YOUR HONESTY
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                             strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round"
                                                  d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5"/>
                                        </svg>
                                        FLAG FOR RESCOUT
                                    </>
                                )}
                            </button>
                        </div>

                        <textarea
                            value={pm.notes}
                            onChange={e => update("notes", e.target.value)}
                            placeholder="Detail any structural failures, amazing saves, or driver behavior..."
                            className="grow w-full rounded-xl bg-neutral-950 border border-neutral-700 p-4 text-sm
                                       text-neutral-100 placeholder-neutral-600 focus:ring-2 focus:ring-blue-500 outline-none
                                       resize-none"
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
