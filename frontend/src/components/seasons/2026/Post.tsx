import React from "react"
import type {MatchScoutingData} from "@/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SliderField({label, value, onChange, min = 0, max = 1, step = 0.01}: {
    label: string
    value: number
    onChange: (v: number) => void
    min?: number
    max?: number
    step?: number
}) {
    const pct = Math.round(value * 100)
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-sm">
                <span className="font-medium">{label}</span>
                <span className="tabular-nums text-neutral-400">{pct}%</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={e => onChange(parseFloat(e.target.value))}
                className="w-full accent-blue-500 h-2 rounded-lg cursor-pointer"
            />
        </div>
    )
}

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
    return <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mt-6 mb-2">{children}</h3>
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PostMatch({data, setData}: {
    data: MatchScoutingData
    setData: React.Dispatch<React.SetStateAction<MatchScoutingData>>
}) {
    const pm = {
        skill: 0,
        defenseSkill: 0,
        intakePos: {neutral: false, depot: false, outpost: false, opponent: false},
        faults: {system: false, idle: false, other: false},
        notes: "",
        ...data.postmatch,
    }

    /** Generic updater for any postmatch field */
    const update = <K extends keyof MatchScoutingData["postmatch"]>(
        key: K,
        value: MatchScoutingData["postmatch"][K],
    ) => {
        setData(prev => ({
            ...prev,
            postmatch: {...prev.postmatch, [key]: value},
        }))
    }

    /** Toggle a boolean inside a nested object (intakePos / faults) */
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
        <div className="p-4 w-full max-w-lg mx-auto space-y-2">
            <div className="text-xl font-semibold mb-4">Post-Match</div>

            {/* ---- Skill Ratings ---- */}
            <SectionHeader>Skill Ratings</SectionHeader>

            <div className="space-y-4 bg-neutral-900 rounded-xl p-4 border border-neutral-800">
                <SliderField
                    label="Offensive Skill"
                    value={pm.skill}
                    onChange={v => update("skill", v)}
                />
                <SliderField
                    label="Defensive Skill"
                    value={pm.defenseSkill}
                    onChange={v => update("defenseSkill", v)}
                />
            </div>

            {/* ---- Intake Positions ---- */}
            <SectionHeader>Intake Positions</SectionHeader>

            <div className="flex flex-wrap gap-2">
                <ToggleChip
                    label="Neutral"
                    active={pm.intakePos.neutral}
                    onToggle={() => toggleNested("intakePos", "neutral")}
                />
                <ToggleChip
                    label="Depot"
                    active={pm.intakePos.depot}
                    onToggle={() => toggleNested("intakePos", "depot")}
                />
                <ToggleChip
                    label="Outpost"
                    active={pm.intakePos.outpost}
                    onToggle={() => toggleNested("intakePos", "outpost")}
                />
                <ToggleChip
                    label="Opponent"
                    active={pm.intakePos.opponent}
                    onToggle={() => toggleNested("intakePos", "opponent")}
                />
            </div>

            {/* ---- Faults ---- */}
            <SectionHeader>Faults</SectionHeader>

            <div className="flex flex-wrap gap-2">
                <ToggleChip
                    label="System Fault"
                    active={pm.faults.system}
                    onToggle={() => toggleNested("faults", "system")}
                />
                <ToggleChip
                    label="Idle / Disabled"
                    active={pm.faults.idle}
                    onToggle={() => toggleNested("faults", "idle")}
                />
                <ToggleChip
                    label="Other"
                    active={pm.faults.other}
                    onToggle={() => toggleNested("faults", "other")}
                />
            </div>

            {/* ---- Notes ---- */}
            <SectionHeader>Notes</SectionHeader>

            <textarea
                value={pm.notes}
                onChange={e => update("notes", e.target.value)}
                placeholder="Anything notable about this team's performance…"
                rows={4}
                className="w-full rounded-xl bg-neutral-900 border border-neutral-700 p-3 text-sm
                           text-neutral-100 placeholder-neutral-500 resize-y
                           focus:outline-none focus:border-blue-500 transition-colors"
            />
        </div>
    )
}