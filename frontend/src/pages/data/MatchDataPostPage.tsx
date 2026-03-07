import {Link, useNavigate, useParams} from "react-router-dom"
import {useMatchData, usePermissions} from "@/components/wrappers/DataWrapper"
import React, {useEffect, useState} from "react"
import DataSearch from "@/components/ui/dataSearch.tsx"

const MATCH_PHASES: { prefix: string; max: number }[] = [
    { prefix: "qm", max: 64 },
    { prefix: "sf", max: 6 },
    { prefix: "f", max: 3 },
]

function getAdjacentMatchKey(matchKey: string, delta: number): string | null {
    const m = matchKey.match(/^(.+?)(\d+)$/)
    if (!m) return null
    const prefix = m[1]
    const num = parseInt(m[2], 10)

    const phaseIdx = MATCH_PHASES.findIndex((p) => p.prefix === prefix)
    if (phaseIdx === -1) {
        // Unknown phase — fall back to simple increment
        const next = num + delta
        return next < 1 ? null : prefix + next
    }

    const newNum = num + delta
    if (newNum >= 1 && newNum <= MATCH_PHASES[phaseIdx].max) {
        return prefix + newNum
    }

    // Cross phase boundary
    if (newNum > MATCH_PHASES[phaseIdx].max && phaseIdx < MATCH_PHASES.length - 1) {
        return MATCH_PHASES[phaseIdx + 1].prefix + "1"
    }
    if (newNum < 1 && phaseIdx > 0) {
        const prevPhase = MATCH_PHASES[phaseIdx - 1]
        return prevPhase.prefix + prevPhase.max
    }

    return null
}

export default function MatchDataPostPage() {
    const {matchKey} = useParams<{ matchKey: string }>()
    const navigate = useNavigate()
    const permissions = usePermissions()
    const match = useMatchData(matchKey ?? "")

    const prevMatchKey = matchKey ? getAdjacentMatchKey(matchKey, -1) : null
    const nextMatchKey = matchKey ? getAdjacentMatchKey(matchKey, 1) : null

    const prevMatch = useMatchData(prevMatchKey ?? "")
    const nextMatch = useMatchData(nextMatchKey ?? "")

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
    if (!postData) {
        return (
            <div className="flex h-screen w-screen items-center justify-center text-gray-500">
                {matchKey ? "Loading match results…" : "No match specified"}
            </div>
        )
    }

    const sbPred = predData?.sb_pred ?? {}
    const red = postData.red
    const blue = postData.blue
    const winner = postData.winner
    const sbPredError = postData.sb_pred_error
    const sbResult = postData.sb_result

    return (
        <div className="flex flex-col h-screen bg-white text-zinc-900">
            {/* HEADER */}
            <div
                className="flex items-center justify-between border-b border-zinc-200 px-6 py-3 h-16 bg-zinc-50 shrink-0">
                <div className="flex items-center gap-4">
                    <h1 className="text-lg font-semibold">
                        {matchKey?.toUpperCase() ?? "MATCH"}
                    </h1>
                    <DataSearch teamNames={teamNames} permissions={permissions}/>
                    {predData && (
                        <Link
                            to={`/data/match/${matchKey}/pred`}
                            className="px-3 py-1.5 text-xs font-medium rounded-md border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 transition-colors"
                        >
                            ← Prediction
                        </Link>
                    )}
                    <div className="flex items-center gap-1">
                        {prevMatchKey && permissions?.match?.includes(prevMatchKey) && prevMatch?.post && (
                            <button
                                onClick={() => navigate(`/data/match/${prevMatchKey}/post`)}
                                className="px-2 py-1.5 text-xs font-medium rounded-md border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 transition-colors"
                            >
                                ← Prev
                            </button>
                        )}
                        {nextMatchKey && permissions?.match?.includes(nextMatchKey) && nextMatch?.post && (
                            <button
                                onClick={() => navigate(`/data/match/${nextMatchKey}/post`)}
                                className="px-2 py-1.5 text-xs font-medium rounded-md border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 transition-colors"
                            >
                                Next →
                            </button>
                        )}
                    </div>
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
                {/* Red panel — TBA teams + per-robot climb data */}
                <AllianceResultPanel
                    color="red"
                    data={red}
                    teamNames={teamNames}
                    permissions={permissions}
                />

                {/* Center comparison */}
                <div className="flex-[1.5] flex flex-col overflow-auto bg-zinc-50 border-x border-zinc-200">
                    {/* Statbotics predicted vs TBA actual */}
                    {sbPred.red_score != null && (
                        <Section label="Statbotics Predicted vs Actual">
                            <div className="px-6 py-3 space-y-2">
                                <PredActualRow label="Total Score" redPred={sbPred.red_score} redActual={red.score}
                                               bluePred={sbPred.blue_score} blueActual={blue.score}/>
                                <PredActualRow label="Auto Points" redPred={null} redActual={red.auto_points}
                                               bluePred={null} blueActual={blue.auto_points}/>
                                {sbPredError && (
                                    <div
                                        className="flex justify-between text-xs text-zinc-400 pt-1 border-t border-zinc-100">
                                        <span>SB error: <span
                                            className={sbPredError.red > 0 ? "text-green-600" : "text-red-500"}>{sbPredError.red > 0 ? "+" : ""}{sbPredError.red}</span></span>
                                        <span>{sbPredError.pred_winner_correct ? "✓ Correct winner" : "✗ Wrong winner"}</span>
                                        <span>SB error: <span
                                            className={sbPredError.blue > 0 ? "text-green-600" : "text-red-500"}>{sbPredError.blue > 0 ? "+" : ""}{sbPredError.blue}</span></span>
                                    </div>
                                )}
                                {/* SB win probability */}
                                {sbPred.red_win_prob != null && (
                                    <div className="flex justify-between text-xs text-zinc-500 pt-1 border-t border-zinc-100">
                                        <span className="text-red-600 font-medium">{sbPred.red_win_prob}% win</span>
                                        <span className="text-zinc-400">SB Win Probability</span>
                                        <span className="text-blue-600 font-medium">{sbPred.blue_win_prob}% win</span>
                                    </div>
                                )}
                            </div>
                        </Section>
                    )}

                    {/* Score breakdown comparison (TBA) */}
                    <Section label="Score Breakdown">
                        <div className="px-6 py-3 space-y-2">
                            <ComparisonBar label="Auto Points" redVal={red.auto_points} blueVal={blue.auto_points}/>
                            <ComparisonBar label="Teleop Points" redVal={red.teleop_points}
                                           blueVal={blue.teleop_points}/>
                            <ComparisonBar label="Tower Points" redVal={red.tower_points} blueVal={blue.tower_points}/>
                            <ComparisonBar label="Foul Points" redVal={red.foul_points} blueVal={blue.foul_points}/>
                        </div>
                    </Section>

                    {/* Hub fuel by phase (TBA) */}
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

                    {/* RP outcomes (TBA actual + SB predicted probs) */}
                    <Section label="Ranking Points">
                        <div className="px-6 py-3 space-y-2">
                            <RPOutcomeRow label="Energized (≥100)" redAchieved={red.energized}
                                          blueAchieved={blue.energized} redProb={sbPred.red_rp_1}
                                          blueProb={sbPred.blue_rp_1}/>
                            <RPOutcomeRow label="Supercharged (≥360)" redAchieved={red.supercharged}
                                          blueAchieved={blue.supercharged} redProb={sbPred.red_rp_2}
                                          blueProb={sbPred.blue_rp_2}/>
                            <RPOutcomeRow label="Traversal (≥50 tower)" redAchieved={red.traversal}
                                          blueAchieved={blue.traversal} redProb={sbPred.red_rp_3}
                                          blueProb={sbPred.blue_rp_3}/>
                            <div className="flex justify-between text-sm font-semibold pt-1 border-t border-zinc-100">
                                <span className="text-red-600">{red.rp} RP</span>
                                <span className="text-blue-600">{blue.rp} RP</span>
                            </div>
                        </div>
                    </Section>

                    {/* Per-robot climb results (TBA) */}
                    <Section label="Climb Results">
                        <div className="grid grid-cols-2 gap-4 px-6 py-3">
                            <ClimbResultPanel color="red" climbs={red.climbs} teamNames={teamNames}/>
                            <ClimbResultPanel color="blue" climbs={blue.climbs} teamNames={teamNames}/>
                        </div>
                    </Section>

                    {/* Statbotics result data if available */}
                    {sbResult && (
                        <Section label="Statbotics Breakdown">
                            <div className="px-6 py-3 space-y-2">
                                {sbResult.red_no_foul != null && (
                                    <ComparisonBar label="Score (no foul)" redVal={sbResult.red_no_foul}
                                                   blueVal={sbResult.blue_no_foul}/>
                                )}
                                {sbResult.red_auto_points != null && (
                                    <ComparisonBar label="SB Auto" redVal={sbResult.red_auto_points}
                                                   blueVal={sbResult.blue_auto_points}/>
                                )}
                                {sbResult.red_teleop_points != null && (
                                    <ComparisonBar label="SB Teleop" redVal={sbResult.red_teleop_points}
                                                   blueVal={sbResult.blue_teleop_points}/>
                                )}
                                {sbResult.red_endgame_points != null && (
                                    <ComparisonBar label="SB Endgame" redVal={sbResult.red_endgame_points}
                                                   blueVal={sbResult.blue_endgame_points}/>
                                )}
                            </div>
                        </Section>
                    )}

                    {/* Fouls (TBA) */}
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

                {/* Blue panel — TBA teams + per-robot climb data */}
                <AllianceResultPanel
                    color="blue"
                    data={blue}
                    teamNames={teamNames}
                    permissions={permissions}
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
    label: string; redPred: number | null; redActual: number; bluePred: number | null; blueActual: number
}) {
    const hasPred = redPred != null && bluePred != null
    const redDiff = hasPred ? redActual - redPred! : 0
    const blueDiff = hasPred ? blueActual - bluePred! : 0
    return (
        <div className="flex items-center text-xs">
            <div className="w-24 text-right space-x-1">
                {hasPred && <span className="text-zinc-400">{Math.round(redPred!)}→</span>}
                <span className="font-semibold text-red-600">{redActual}</span>
                {hasPred && <DiffBadge diff={redDiff}/>}
            </div>
            <div className="flex-1 text-center text-zinc-400">{label}</div>
            <div className="w-24 text-left space-x-1">
                {hasPred && <DiffBadge diff={blueDiff}/>}
                <span className="font-semibold text-blue-600">{blueActual}</span>
                {hasPred && <span className="text-zinc-400">←{Math.round(bluePred!)}</span>}
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

function AllianceResultPanel({color, data, teamNames, permissions}: {
    color: "red" | "blue"
    data: any
    teamNames: Record<number, string>
    permissions: any
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
                    const climb = data.climbs?.[idx]
                    return (
                        <TeamResultRow
                            key={tn}
                            color={color}
                            teamNum={tn}
                            teamName={teamNames[tn]}
                            climb={climb}
                            canLink={permissions?.team?.map(String).includes(String(tn))}
                        />
                    )
                })}
            </ul>
        </div>
    )
}

function TeamResultRow({color, teamNum, teamName, climb, canLink}: {
    color: "red" | "blue"
    teamNum: number
    teamName?: string
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

            {/* Only TBA climb data — no scouting metrics */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-zinc-600">
                <Stat label="Auto Tower" value={
                    climb ? `${towerLabel(climb.auto_tower)} (${climb.auto_tower_pts}pts)` : "—"
                }/>
                <Stat label="End Tower" value={
                    climb ? `${towerLabel(climb.endgame_tower)} (${climb.endgame_tower_pts}pts)` : "—"
                }/>
                <Stat label="Tower Pts" value={climb?.total_tower_pts ?? "—"}/>
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