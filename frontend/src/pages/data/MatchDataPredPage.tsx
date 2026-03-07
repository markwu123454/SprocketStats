import {Link, useParams} from "react-router-dom"
import {useMatchData, usePermissions} from "@/components/wrappers/DataWrapper"
import React, {useEffect, useState} from "react"
import DataSearch from "@/components/ui/dataSearch.tsx"

export default function MatchDataPredPage() {
    const {matchKey} = useParams<{ matchKey: string }>()
    const permissions = usePermissions()
    const match = useMatchData(matchKey ?? "")

    const [teamNames, setTeamNames] = useState<Record<number, string>>({})

    useEffect(() => {
        fetch("/teams/team_names.json")
            .then((res) => res.json())
            .then((names: Record<string, string>) => {
                const parsed: Record<number, string> = {}
                Object.entries(names).forEach(([k, v]) => {
                    parsed[Number(k)] = v
                })
                setTeamNames(parsed)
            })
            .catch(() => setTeamNames({}))
    }, [])

    useEffect(() => {
        document.title = `${matchKey?.toUpperCase() ?? "Match"} | Prediction`
    }, [matchKey])

    const predData = match?.pred
    if (!predData) {
        return (
            <div className="flex h-screen w-screen items-center justify-center text-gray-500">
                {matchKey ? "Loading match data…" : "No match specified"}
            </div>
        )
    }

    const pred = predData.predictions ?? {}
    const red = predData.alliances?.red ?? {}
    const blue = predData.alliances?.blue ?? {}
    const sbPred = predData.sb_pred

    return (
        <div className="flex flex-col h-screen bg-white text-zinc-900">
            {/* HEADER */}
            <div
                className="flex items-center justify-between border-b border-zinc-200 px-6 py-3 h-16 bg-zinc-50 shrink-0">
                <div className="flex items-center gap-4">
                    <h1 className="text-lg font-semibold">
                        {matchKey?.toUpperCase() ?? "MATCH"}
                    </h1>
                    <span className="text-sm text-zinc-500">
                        {match.comp_level?.toUpperCase()} {match.set_number > 1 ? `Set ${match.set_number}` : ""} Match {match.match_number}
                    </span>
                    <DataSearch teamNames={teamNames} permissions={permissions}/>
                    <Link
                        to={`/data/match/${matchKey}/post`}
                        className="px-3 py-1.5 text-xs font-medium rounded-md border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 transition-colors"
                    >
                        See Results →
                    </Link>
                </div>

                {/* Win probability headline */}
                <div className="flex items-center gap-3 text-sm">
                    <span className="font-bold text-red-600">{pred.red_win_prob ?? 50}%</span>
                    <WinProbBar redProb={pred.red_win_prob ?? 50}/>
                    <span className="font-bold text-blue-600">{pred.blue_win_prob ?? 50}%</span>
                </div>
            </div>

            {/* BODY */}
            <div className="flex flex-1 overflow-hidden">
                {/* Red alliance panel */}
                <AlliancePanel
                    color="red"
                    alliance={red}
                    teamNames={teamNames}
                    permissions={permissions}
                />

                {/* Center comparison column */}
                <div className="flex-[1.5] flex flex-col overflow-auto bg-zinc-50 border-x border-zinc-200">
                    {/* Score prediction */}
                    <Section label="Score Prediction">
                        <div className="flex items-center justify-between px-6 py-4">
                            <ScorePredBlock color="red" score={pred.red_score_pred} fuel={pred.red_fuel_pred}
                                            climb={pred.red_climb_pred}/>
                            <div className="text-xs text-zinc-400 font-medium">VS</div>
                            <ScorePredBlock color="blue" score={pred.blue_score_pred} fuel={pred.blue_fuel_pred}
                                            climb={pred.blue_climb_pred}/>
                        </div>
                        {sbPred && (
                            <div className="px-6 pb-3 text-xs text-zinc-400 border-t border-zinc-100 pt-2">
                                Statbotics: Red {sbPred.red_score} — Blue {sbPred.blue_score}
                                ({sbPred.red_win_prob}% / {sbPred.blue_win_prob}%)
                            </div>
                        )}
                    </Section>

                    {/* Auto prediction */}
                    <Section label="Auto Prediction">
                        <div className="px-6 py-3 space-y-2">
                            <ComparisonBar
                                label="Auto Fuel"
                                redVal={pred.red_auto_pred}
                                blueVal={pred.blue_auto_pred}
                            />
                            <div className="flex justify-between text-xs text-zinc-500 mt-1">
                                <span>Red wins auto: <b className="text-red-600">{pred.red_auto_win_prob}%</b></span>
                                <span>Blue wins auto: <b className="text-blue-600">{pred.blue_auto_win_prob}%</b></span>
                            </div>
                            <p className="text-xs text-zinc-400 mt-1">
                                {(pred.red_auto_win_prob ?? 50) > 60
                                    ? "Red likely gets favorable shift schedule (active shifts 2 & 4)"
                                    : (pred.blue_auto_win_prob ?? 50) > 60
                                        ? "Blue likely gets favorable shift schedule (active shifts 2 & 4)"
                                        : "Auto is close — shift schedule is a toss-up"}
                            </p>
                        </div>
                    </Section>

                    {/* RP probabilities */}
                    <Section label="Ranking Point Probabilities">
                        <div className="px-6 py-3 space-y-3">
                            <RPRow label="Energized (≥100 fuel)" redProb={pred.red_energized_prob}
                                   blueProb={pred.blue_energized_prob}/>
                            <RPRow label="Supercharged (≥360 fuel)" redProb={pred.red_supercharged_prob}
                                   blueProb={pred.blue_supercharged_prob}/>
                            <RPRow label="Traversal (≥50 tower pts)" redProb={pred.red_traversal_prob}
                                   blueProb={pred.blue_traversal_prob}/>
                        </div>
                    </Section>

                    {/* Head-to-head comparison */}
                    <Section label="Alliance Comparison">
                        <div className="px-6 py-3 space-y-2">
                            <ComparisonBar label="Total Fuel" redVal={pred.red_fuel_pred}
                                           blueVal={pred.blue_fuel_pred}/>
                            <ComparisonBar label="Tower Points" redVal={pred.red_climb_pred}
                                           blueVal={pred.blue_climb_pred}/>
                            <ComparisonBar label="Total Score" redVal={pred.red_score_pred}
                                           blueVal={pred.blue_score_pred}/>
                        </div>
                    </Section>

                    {/* Climb recommendations */}
                    <Section label="Climb Recommendations">
                        <div className="grid grid-cols-2 gap-4 px-6 py-3">
                            <ClimbRecPanel color="red" recs={red.climb_recommendations ?? []} teamNames={teamNames}/>
                            <ClimbRecPanel color="blue" recs={blue.climb_recommendations ?? []} teamNames={teamNames}/>
                        </div>
                    </Section>
                </div>

                {/* Blue alliance panel */}
                <AlliancePanel
                    color="blue"
                    alliance={blue}
                    teamNames={teamNames}
                    permissions={permissions}
                />
            </div>
        </div>
    )
}

/* ======================== SUB-COMPONENTS ======================== */

function WinProbBar({redProb}: { redProb: number }) {
    return (
        <div className="w-32 h-3 bg-zinc-200 rounded-full overflow-hidden flex">
            <div className="bg-red-500 h-full transition-all" style={{width: `${redProb}%`}}/>
            <div className="bg-blue-500 h-full flex-1"/>
        </div>
    )
}

function Section({label, children}: { label: string; children: React.ReactNode }) {
    return (
        <div className="border-b border-zinc-200">
            <div className="px-5 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wide bg-zinc-100/50">
                {label}
            </div>
            {children}
        </div>
    )
}

function ScorePredBlock({color, score, fuel, climb}: {
    color: "red" | "blue";
    score: number;
    fuel: number;
    climb: number
}) {
    const textColor = color === "red" ? "text-red-700" : "text-blue-700"
    const align = color === "red" ? "text-left" : "text-right"
    return (
        <div className={`${align}`}>
            <div className={`text-3xl font-bold ${textColor}`}>{score ?? 0}</div>
            <div className="text-xs text-zinc-500 mt-1">
                Fuel: {fuel ?? 0} · Tower: {climb ?? 0}
            </div>
        </div>
    )
}

function ComparisonBar({label, redVal, blueVal}: { label: string; redVal?: number; blueVal?: number }) {
    const r = redVal ?? 0
    const b = blueVal ?? 0
    const max = Math.max(r, b, 1)
    return (
        <div className="space-y-0.5">
            <div className="flex justify-between text-xs text-zinc-500">
                <span className="font-medium text-red-600">{r}</span>
                <span className="text-zinc-400">{label}</span>
                <span className="font-medium text-blue-600">{b}</span>
            </div>
            <div className="flex h-2 gap-0.5">
                <div className="flex-1 flex justify-end">
                    <div
                        className="bg-red-400 h-full rounded-l transition-all"
                        style={{width: `${(r / max) * 100}%`}}
                    />
                </div>
                <div className="flex-1">
                    <div
                        className="bg-blue-400 h-full rounded-r transition-all"
                        style={{width: `${(b / max) * 100}%`}}
                    />
                </div>
            </div>
        </div>
    )
}

function RPRow({label, redProb, blueProb}: { label: string; redProb?: number; blueProb?: number }) {
    const r = redProb ?? 0
    const b = blueProb ?? 0
    return (
        <div className="flex items-center justify-between text-sm">
            <ProbBadge value={r} color="red"/>
            <span className="text-xs text-zinc-500 text-center flex-1">{label}</span>
            <ProbBadge value={b} color="blue"/>
        </div>
    )
}

function ProbBadge({value, color}: { value: number; color: "red" | "blue" }) {
    const bg = value >= 75
        ? (color === "red" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700")
        : value >= 40
            ? "bg-yellow-50 text-yellow-700"
            : "bg-zinc-100 text-zinc-400"
    return (
        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${bg} min-w-12 text-center`}>
            {value}%
        </span>
    )
}

function ClimbRecPanel({color, recs, teamNames}: {
    color: "red" | "blue";
    recs: any[];
    teamNames: Record<number, string>
}) {
    const headerColor = color === "red" ? "text-red-700" : "text-blue-700"
    const levelLabels: Record<number, string> = {0: "—", 1: "L1", 2: "L2", 3: "L3"}

    return (
        <div>
            <div className={`text-xs font-semibold ${headerColor} mb-2`}>
                {color === "red" ? "Red" : "Blue"} Alliance
            </div>
            <div className="space-y-2">
                {recs.map((rec: any) => (
                    <div key={rec.team}
                         className="flex items-center justify-between text-xs bg-white rounded px-2 py-1.5 border border-zinc-100">
                        <div>
                            <span className="font-semibold">{rec.team}</span>
                            <span className="text-zinc-400 ml-1">{teamNames[rec.team] ?? ""}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-zinc-500">{levelLabels[rec.level] ?? "—"}</span>
                            <span className="font-semibold">{rec.recommended_pos ?? "None"}</span>
                            <span className="text-zinc-400">({rec.climb_rate}%)</span>
                            {rec.note === "reassigned" && (
                                <span className="text-amber-500 text-[10px]">⚠ moved</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

function AlliancePanel({color, alliance, teamNames, permissions}: {
    color: "red" | "blue"
    alliance: any
    teamNames: Record<number, string>
    permissions: any
}) {
    const bg = color === "red" ? "bg-red-50/50" : "bg-blue-50/50"
    const headerColor = color === "red" ? "text-red-700" : "text-blue-700"
    const details: any[] = alliance?.team_details ?? []

    return (
        <div className={`w-80 flex flex-col overflow-hidden shrink-0 ${bg}`}>
            <div className={`px-4 py-2 border-b border-zinc-200 text-sm font-semibold ${headerColor}`}>
                {color === "red" ? "Red" : "Blue"} Alliance
            </div>
            <ul className="flex flex-col flex-1 divide-y divide-zinc-200 overflow-auto">
                {details.map((td: any) => (
                    <TeamRow
                        key={td.team}
                        color={color}
                        detail={td}
                        teamName={teamNames[td.team]}
                        canLink={permissions?.team?.map(String).includes(String(td.team))}
                    />
                ))}
                {details.length === 0 && (
                    <li className="flex-1 flex items-center justify-center text-zinc-400 text-sm p-4">
                        No team data available
                    </li>
                )}
            </ul>
        </div>
    )
}

function TeamRow({color, detail, teamName, canLink}: {
    color: "red" | "blue"
    detail: any
    teamName?: string
    canLink?: boolean
}) {
    const textColor = color === "red" ? "text-red-700" : "text-blue-700"
    const tn = detail.team
    const logoPath = `/teams/team_icons/${tn}.png`
    const levelLabels: Record<number, string> = {0: "—", 1: "L1", 2: "L2", 3: "L3"}

    const header = (
        <div className="flex items-center gap-2 min-w-0">
            <img
                src={logoPath}
                alt=""
                className="h-7 w-7 rounded object-contain ring-1 ring-gray-200 bg-white"
                onError={(e) => (e.currentTarget.style.visibility = "hidden")}
            />
            <div className="min-w-0">
                <div className={`font-semibold text-sm truncate ${textColor}`}>#{tn}</div>
                <div className="text-[11px] text-zinc-500 truncate">{teamName ?? "Unknown"}</div>
            </div>
        </div>
    )

    return (
        <li className="p-3 space-y-2">
            {canLink ? (
                <Link to={`/data/team/${tn}`} className="hover:opacity-80 transition-opacity">
                    {header}
                </Link>
            ) : header}

            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-zinc-600">
                <Stat label="Fuel Avg" value={detail.fuel_mean}/>
                <Stat label="Active BPS" value={detail.bps} suffix="/s"/>
                <Stat label="Auto Fuel" value={detail.auto_fuel_mean}/>
                <Stat label="Accuracy"
                      value={detail.accuracy != null ? `${(detail.accuracy * 100).toFixed(0)}%` : null}/>
                <Stat label="Climb" value={
                    detail.best_climb_level > 0
                        ? `${levelLabels[detail.best_climb_level]} (${detail.endgame_climb_rate}%)`
                        : "None"
                }/>
                <Stat label="Auto Climb" value={detail.auto_climb_rate > 0 ? `${detail.auto_climb_rate}%` : "None"}/>
                <Stat label="Role" value={detail.role}/>
                <Stat label="Speed" value={detail.speed}/>
                <Stat label="Traversal" value={detail.traversal}/>
                <Stat label="Faults" value={detail.fault_rate}/>
            </div>
        </li>
    )
}

function Stat({label, value, suffix = ""}: { label: string; value: any; suffix?: string }) {
    const display = value != null ? `${value}${suffix}` : "—"
    return (
        <div className="flex justify-between">
            <span className="text-zinc-400">{label}</span>
            <span className="font-medium text-zinc-700">{display}</span>
        </div>
    )
}