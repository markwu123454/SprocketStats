import {Link, useParams} from "react-router-dom"
import {useMatchData, usePermissions} from "@/components/wrappers/DataWrapper"
import React, {useEffect, useState} from "react"
import DataSearch from "@/components/ui/dataSearch.tsx"

export default function MatchDataPostPage() {
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
        document.title = `${matchKey?.toUpperCase() ?? "Match"} | Results`
    }, [matchKey])

    const predData = match?.pred
    const postData = match?.post
    if (!predData || !postData) {
        return (
            <div className="flex h-screen w-screen items-center justify-center text-gray-500">
                {matchKey ? "Loading match results…" : "No match specified"}
            </div>
        )
    }

    const pred = predData.predictions ?? {}
    const red = postData.red
    const blue = postData.blue
    const winner = postData.winner
    const predError = postData.pred_error

    const matchTime = postData.time
        ? new Date(postData.time * 1000).toLocaleString()
        : "—"

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
                        {match.comp_level?.toUpperCase()} Match {match.match_number} · {matchTime}
                    </span>
                    <DataSearch teamNames={teamNames} permissions={permissions}/>
                    <Link
                        to={`/data/match/${matchKey}/pred`}
                        className="px-3 py-1.5 text-xs font-medium rounded-md border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 transition-colors"
                    >
                        ← See Prediction
                    </Link>
                </div>

                {/* Score header */}
                <div className="flex items-center gap-6 text-lg font-semibold">
                    <ScoreHeader color="red" score={red.score} rp={red.rp} isWinner={winner === "red"}/>
                    <div className="text-xs text-zinc-400 uppercase">
                        {winner === "tie" ? "TIE" : `${winner?.toUpperCase()} WIN`}
                    </div>
                    <ScoreHeader color="blue" score={blue.score} rp={blue.rp} isWinner={winner === "blue"}/>
                </div>
            </div>

            {/* BODY */}
            <div className="flex flex-1 overflow-hidden">
                {/* Red panel */}
                <AllianceResultPanel
                    color="red"
                    data={red}
                    teamNames={teamNames}
                    permissions={permissions}
                    teamDetails={match.alliances?.red?.team_details ?? []}
                />

                {/* Center comparison */}
                <div className="flex-[1.5] flex flex-col overflow-auto bg-zinc-50 border-x border-zinc-200">
                    {/* Actual vs predicted */}
                    {pred.red_score_pred != null && (
                        <Section label="Predicted vs Actual">
                            <div className="px-6 py-3 space-y-2">
                                <PredActualRow label="Total Score" redPred={pred.red_score_pred} redActual={red.score}
                                               bluePred={pred.blue_score_pred} blueActual={blue.score}/>
                                <PredActualRow label="Fuel" redPred={pred.red_fuel_pred} redActual={red.hub.total.count}
                                               bluePred={pred.blue_fuel_pred} blueActual={blue.hub.total.count}/>
                                <PredActualRow label="Tower Pts" redPred={pred.red_climb_pred}
                                               redActual={red.tower_points} bluePred={pred.blue_climb_pred}
                                               blueActual={blue.tower_points}/>
                                <PredActualRow label="Auto Fuel" redPred={pred.red_auto_pred}
                                               redActual={red.hub.auto.count} bluePred={pred.blue_auto_pred}
                                               blueActual={blue.hub.auto.count}/>
                                {predError && (
                                    <div
                                        className="flex justify-between text-xs text-zinc-400 pt-1 border-t border-zinc-100">
                                        <span>Pred error: <span
                                            className={predError.red > 0 ? "text-green-600" : "text-red-500"}>{predError.red > 0 ? "+" : ""}{predError.red}</span></span>
                                        <span>{predError.pred_winner_correct ? "✓ Correct winner" : "✗ Wrong winner"}</span>
                                        <span>Pred error: <span
                                            className={predError.blue > 0 ? "text-green-600" : "text-red-500"}>{predError.blue > 0 ? "+" : ""}{predError.blue}</span></span>
                                    </div>
                                )}
                            </div>
                        </Section>
                    )}

                    {/* Score breakdown comparison */}
                    <Section label="Score Breakdown">
                        <div className="px-6 py-3 space-y-2">
                            <ComparisonBar label="Auto Points" redVal={red.auto_points} blueVal={blue.auto_points}/>
                            <ComparisonBar label="Teleop Points" redVal={red.teleop_points}
                                           blueVal={blue.teleop_points}/>
                            <ComparisonBar label="Tower Points" redVal={red.tower_points} blueVal={blue.tower_points}/>
                            <ComparisonBar label="Foul Points" redVal={red.foul_points} blueVal={blue.foul_points}/>
                        </div>
                    </Section>

                    {/* Hub fuel by phase */}
                    <Section label="Fuel by Phase">
                        <div className="px-6 py-3 space-y-2">
                            <ComparisonBar label="Auto" redVal={red.hub.auto.count} blueVal={blue.hub.auto.count}/>
                            <ComparisonBar label="Transition" redVal={red.hub.transition.count}
                                           blueVal={blue.hub.transition.count}/>
                            <ComparisonBar label="Shift 1" redVal={red.hub.shift_1.count}
                                           blueVal={blue.hub.shift_1.count}/>
                            <ComparisonBar label="Shift 2" redVal={red.hub.shift_2.count}
                                           blueVal={blue.hub.shift_2.count}/>
                            <ComparisonBar label="Shift 3" redVal={red.hub.shift_3.count}
                                           blueVal={blue.hub.shift_3.count}/>
                            <ComparisonBar label="Shift 4" redVal={red.hub.shift_4.count}
                                           blueVal={blue.hub.shift_4.count}/>
                            <ComparisonBar label="Endgame" redVal={red.hub.endgame.count}
                                           blueVal={blue.hub.endgame.count}/>
                            <div className="border-t border-zinc-100 pt-2">
                                <ComparisonBar label="Total Fuel" redVal={red.hub.total.count}
                                               blueVal={blue.hub.total.count}/>
                            </div>
                        </div>
                    </Section>

                    {/* RP outcomes */}
                    <Section label="Ranking Points">
                        <div className="px-6 py-3 space-y-2">
                            <RPOutcomeRow label="Energized (≥100)" redAchieved={red.energized}
                                          blueAchieved={blue.energized} redProb={pred.red_energized_prob}
                                          blueProb={pred.blue_energized_prob}/>
                            <RPOutcomeRow label="Supercharged (≥360)" redAchieved={red.supercharged}
                                          blueAchieved={blue.supercharged} redProb={pred.red_supercharged_prob}
                                          blueProb={pred.blue_supercharged_prob}/>
                            <RPOutcomeRow label="Traversal (≥50 tower)" redAchieved={red.traversal}
                                          blueAchieved={blue.traversal} redProb={pred.red_traversal_prob}
                                          blueProb={pred.blue_traversal_prob}/>
                            <div className="flex justify-between text-sm font-semibold pt-1 border-t border-zinc-100">
                                <span className="text-red-600">{red.rp} RP</span>
                                <span className="text-blue-600">{blue.rp} RP</span>
                            </div>
                        </div>
                    </Section>

                    {/* Per-robot climb results */}
                    <Section label="Climb Results">
                        <div className="grid grid-cols-2 gap-4 px-6 py-3">
                            <ClimbResultPanel color="red" climbs={red.climbs} teamNames={teamNames}/>
                            <ClimbResultPanel color="blue" climbs={blue.climbs} teamNames={teamNames}/>
                        </div>
                    </Section>

                    {/* Fouls */}
                    {(red.minor_fouls > 0 || red.major_fouls > 0 || blue.minor_fouls > 0 || blue.major_fouls > 0) && (
                        <Section label="Penalties">
                            <div className="px-6 py-3 space-y-1">
                                <ComparisonBar label="Minor Fouls" redVal={red.minor_fouls} blueVal={blue.minor_fouls}/>
                                <ComparisonBar label="Major Fouls" redVal={red.major_fouls} blueVal={blue.major_fouls}/>
                                <ComparisonBar label="Foul Points Given" redVal={blue.foul_points}
                                               blueVal={red.foul_points}/>
                            </div>
                        </Section>
                    )}
                </div>

                {/* Blue panel */}
                <AllianceResultPanel
                    color="blue"
                    data={blue}
                    teamNames={teamNames}
                    permissions={permissions}
                    teamDetails={match.alliances?.blue?.team_details ?? []}
                />
            </div>
        </div>
    )
}

/* ======================== SUB-COMPONENTS ======================== */

function ScoreHeader({color, score, rp, isWinner}: {
    color: "red" | "blue";
    score: number;
    rp: number;
    isWinner: boolean
}) {
    const textColor = color === "red" ? "text-red-600" : "text-blue-600"
    return (
        <div className="flex flex-col items-center">
            <span className={`text-2xl font-bold ${textColor} ${isWinner ? "underline underline-offset-4" : ""}`}>
                {score}
            </span>
            <span className="text-xs text-zinc-500">{rp} RP</span>
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
                    <div className="bg-red-400 h-full rounded-l transition-all" style={{width: `${(r / max) * 100}%`}}/>
                </div>
                <div className="flex-1">
                    <div className="bg-blue-400 h-full rounded-r transition-all"
                         style={{width: `${(b / max) * 100}%`}}/>
                </div>
            </div>
        </div>
    )
}

function PredActualRow({label, redPred, redActual, bluePred, blueActual}: {
    label: string; redPred: number; redActual: number; bluePred: number; blueActual: number
}) {
    const redDiff = redActual - redPred
    const blueDiff = blueActual - bluePred
    return (
        <div className="flex items-center text-xs">
            <div className="w-24 text-right space-x-1">
                <span className="text-zinc-400">{Math.round(redPred)}→</span>
                <span className="font-semibold text-red-600">{redActual}</span>
                <DiffBadge diff={redDiff}/>
            </div>
            <div className="flex-1 text-center text-zinc-400">{label}</div>
            <div className="w-24 text-left space-x-1">
                <DiffBadge diff={blueDiff}/>
                <span className="font-semibold text-blue-600">{blueActual}</span>
                <span className="text-zinc-400">←{Math.round(bluePred)}</span>
            </div>
        </div>
    )
}

function DiffBadge({diff}: { diff: number }) {
    if (Math.abs(diff) < 0.5) return null
    const rounded = Math.round(diff)
    const color = rounded > 0 ? "text-green-600" : "text-red-500"
    return <span className={`text-[10px] ${color}`}>({rounded > 0 ? "+" : ""}{rounded})</span>
}

function RPOutcomeRow({label, redAchieved, blueAchieved, redProb, blueProb}: {
    label: string; redAchieved: boolean; blueAchieved: boolean; redProb?: number; blueProb?: number
}) {
    return (
        <div className="flex items-center justify-between text-sm">
            <RPBadge achieved={redAchieved} prob={redProb} color="red"/>
            <span className="text-xs text-zinc-500 text-center flex-1">{label}</span>
            <RPBadge achieved={blueAchieved} prob={blueProb} color="blue"/>
        </div>
    )
}

function RPBadge({achieved, prob, color}: { achieved: boolean; prob?: number; color: "red" | "blue" }) {
    const bg = achieved
        ? (color === "red" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700")
        : "bg-zinc-100 text-zinc-400"
    return (
        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${bg} min-w-16 text-center`}>
            {achieved ? "✓" : "✗"}
            {prob != null && <span className="text-[10px] ml-1 opacity-60">({prob}%)</span>}
        </span>
    )
}

function ClimbResultPanel({color, climbs, teamNames}: {
    color: "red" | "blue";
    climbs: any[];
    teamNames: Record<number, string>
}) {
    const headerColor = color === "red" ? "text-red-700" : "text-blue-700"
    const towerLabel = (level: string) => {
        if (!level || level === "None") return "—"
        return level.replace("Level", "L")
    }

    return (
        <div>
            <div className={`text-xs font-semibold ${headerColor} mb-2`}>
                {color === "red" ? "Red" : "Blue"} Alliance
            </div>
            <div className="space-y-1.5">
                {climbs.map((c: any, i: number) => (
                    <div key={i}
                         className="flex items-center justify-between text-xs bg-white rounded px-2 py-1.5 border border-zinc-100">
                        <div>
                            <span className="font-semibold">{c.team ?? "?"}</span>
                            <span className="text-zinc-400 ml-1">{teamNames[c.team] ?? ""}</span>
                        </div>
                        <div className="flex items-center gap-3 text-zinc-600">
                            <span>Auto: {towerLabel(c.auto_tower)}</span>
                            <span>End: {towerLabel(c.endgame_tower)}</span>
                            <span className="font-semibold">{c.total_tower_pts} pts</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

function AllianceResultPanel({color, data, teamNames, permissions, teamDetails}: {
    color: "red" | "blue"
    data: any
    teamNames: Record<number, string>
    permissions: any
    teamDetails: any[]
}) {
    const bg = color === "red" ? "bg-red-50/50" : "bg-blue-50/50"
    const headerColor = color === "red" ? "text-red-700" : "text-blue-700"
    const teams: number[] = data.teams ?? []

    return (
        <div className={`w-80 flex flex-col overflow-hidden shrink-0 ${bg}`}>
            <div className={`px-4 py-2 border-b border-zinc-200 text-sm font-semibold ${headerColor}`}>
                {color === "red" ? "Red" : "Blue"} Alliance
            </div>
            <ul className="flex flex-col flex-1 divide-y divide-zinc-200 overflow-auto">
                {teams.map((tn, idx) => {
                    const td = teamDetails.find((d: any) => d.team === tn) ?? {}
                    const climb = data.climbs?.[idx]
                    return (
                        <TeamResultRow
                            key={tn}
                            color={color}
                            teamNum={tn}
                            teamName={teamNames[tn]}
                            detail={td}
                            climb={climb}
                            canLink={permissions?.team?.map(String).includes(String(tn))}
                        />
                    )
                })}
            </ul>
        </div>
    )
}

function TeamResultRow({color, teamNum, teamName, detail, climb, canLink}: {
    color: "red" | "blue"
    teamNum: number
    teamName?: string
    detail: any
    climb: any
    canLink?: boolean
}) {
    const textColor = color === "red" ? "text-red-700" : "text-blue-700"
    const logoPath = `/teams/team_icons/${teamNum}.png`
    const towerLabel = (level: string) => {
        if (!level || level === "None") return "—"
        return level.replace("Level", "L")
    }

    const header = (
        <div className="flex items-center gap-2 min-w-0">
            <img
                src={logoPath}
                alt=""
                className="h-7 w-7 rounded object-contain ring-1 ring-gray-200 bg-white"
                onError={(e) => (e.currentTarget.style.visibility = "hidden")}
            />
            <div className="min-w-0">
                <div className={`font-semibold text-sm truncate ${textColor}`}>#{teamNum}</div>
                <div className="text-[11px] text-zinc-500 truncate">{teamName ?? "Unknown"}</div>
            </div>
        </div>
    )

    return (
        <li className="p-3 space-y-2">
            {canLink ? (
                <Link to={`/data/team/${teamNum}`} className="hover:opacity-80 transition-opacity">
                    {header}
                </Link>
            ) : header}

            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-zinc-600">
                <Stat label="Fuel Avg" value={detail.fuel_mean}/>
                <Stat label="Role" value={detail.role}/>
                <Stat label="Climb" value={
                    climb ? `${towerLabel(climb.endgame_tower)} (${climb.endgame_tower_pts}pts)` : "—"
                }/>
                <Stat label="Auto Tower" value={
                    climb ? `${towerLabel(climb.auto_tower)} (${climb.auto_tower_pts}pts)` : "—"
                }/>
                <Stat label="Speed" value={detail.speed}/>
                <Stat label="Faults" value={detail.fault_rate}/>
            </div>
        </li>
    )
}

function Stat({label, value}: { label: string; value: any }) {
    const display = value != null ? String(value) : "—"
    return (
        <div className="flex justify-between">
            <span className="text-zinc-400">{label}</span>
            <span className="font-medium text-zinc-700">{display}</span>
        </div>
    )
}