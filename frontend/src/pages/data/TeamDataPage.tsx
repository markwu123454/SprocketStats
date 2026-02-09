// src/pages/TeamDataPage.tsx
import React, {useEffect, useState} from "react"
import {useParams} from "react-router-dom"
import {useTeamData, usePermissions} from "@/components/wrappers/DataWrapper.tsx"
import DataSearch from "@/components/ui/dataSearch.tsx"
import MetricsBlock from "@/components/seasons/2026/TeamDataBlocks/Metrics.tsx"
import RPCriteriaBlock from "@/components/seasons/2026/TeamDataBlocks/RP.tsx"
import MatchHistoryBlock from "@/components/seasons/2026/TeamDataBlocks/MatchHistory.tsx"
import ScoringTrendsBlock from "@/components/seasons/2026/TeamDataBlocks/Scoring.tsx"

export default function TeamDataPage() {
    const {team} = useParams<{ team: string }>()
    const teamNum = team ? parseInt(team, 10) : NaN
    const data = useTeamData(teamNum)
    const permissions = usePermissions()
    const [teamNames, setTeamNames] = useState<Record<string, string>>({})
    const [teamName, setTeamName] = useState("Unknown Team")

    useEffect(() => {
        fetch("/teams/team_names.json")
            .then(res => res.json())
            .then((data: Record<string, string>) => setTeamNames(data))
            .catch(() => setTeamNames({}))
    }, [])

    useEffect(() => {
        setTeamName(teamNames[teamNum] ?? "Unknown Team")
    }, [teamNum, teamNames])

    useEffect(() => {
        document.title = `${teamNum} | Team Data`
    }, [teamNum])

    if (isNaN(teamNum)) {
        return (
            <div className="flex h-screen w-screen items-center justify-center text-gray-500">
                Invalid team number
            </div>
        )
    }

    if (!data) {
        return (
            <div className="flex h-screen w-screen items-center justify-center text-gray-500">
                Loading team data…
            </div>
        )
    }

    const tags = data.basic?.tags ?? data.tags ?? []
    const ranking = data.ranking ?? {}
    const logoPath = `/teams/team_icons/${teamNum}.png`

    return (
        <div className="min-h-screen w-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <header className="sticky top-0 z-10 flex-none border-b bg-white/90 backdrop-blur px-4 py-2 flex items-center justify-between h-14">
                <div className="flex items-center gap-3 min-w-0">
                    <img
                        src={logoPath}
                        alt="logo"
                        className="h-8 w-8 rounded bg-white object-contain ring-1 ring-gray-200"
                        onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                    />
                    <div className="truncate font-semibold text-base">
                        #{teamNum} {teamName}
                    </div>
                    <DataSearch teamNames={teamNames} permissions={permissions} />
                </div>

                <div className="flex items-center gap-6 text-sm text-gray-700">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                        <RankLabel label="Auto" value={ranking.auto} />
                        <RankLabel label="Teleop" value={ranking.teleop} />
                        <RankLabel label="Endgame" value={ranking.endgame} />
                        <div className="flex items-center">
                            <span className="text-gray-500">RP: #</span>
                            <span className="font-bold text-gray-900">{ranking.rp ?? '-'}</span>
                            <span className="text-gray-500">(pred: #</span>
                            <span className="font-bold text-gray-900">{ranking.rp_pred ?? '-'}</span>
                            <span className="text-gray-500">)</span>
                        </div>
                        <div className="flex items-center">
                            <span className="text-gray-500">Avg RP:&nbsp;</span>
                            <span className="font-bold text-gray-900">{ranking.rp_avg?.toFixed(2) ?? '-'}</span>
                            <span className="text-gray-500">(pred:&nbsp;</span>
                            <span className="font-bold text-gray-900">{ranking.rp_avg_pred?.toFixed(2) ?? '-'}</span>
                            <span className="text-gray-500">)</span>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-1">
                        {tags.map((t: string) => (
                            <span
                                key={t}
                                className="rounded-full border px-2 py-0.5 text-[10px] text-gray-700 bg-gray-100"
                            >
                                {t}
                            </span>
                        ))}
                    </div>
                </div>
            </header>

            {/* Main Content - 2 Column Grid with Vertical Scroll */}
            <main className="flex-1 overflow-y-auto">
                <div className="mx-auto p-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 auto-rows-[500px]">
                        <Block title="Metrics Overview">
                            <MetricsBlock data={data} permissions={permissions} />
                        </Block>
                        <Block title="RP Criteria">
                            <RPCriteriaBlock data={data} permissions={permissions} />
                        </Block>
                        <Block title="Match History">
                            <MatchHistoryBlock data={data} permissions={permissions} />
                        </Block>
                        <Block title="Scoring & Trends">
                            <ScoringTrendsBlock data={data} permissions={permissions} />
                        </Block>
                    </div>
                </div>
            </main>
        </div>
    )
}

function Block({title, children}: { title: string; children: React.ReactNode }) {
    return (
        <section className="rounded-lg border bg-white shadow-sm flex flex-col h-full overflow-hidden">
            <div className="border-b px-4 py-2 text-sm font-semibold text-gray-800 shrink-0">
                {title}
            </div>
            <div className="flex-1 overflow-y-auto">
                {children}
            </div>
        </section>
    )
}

function RankLabel({label, value}: { label: string; value: number }) {
    return (
        <div className="flex items-center">
            <span className="text-gray-500">{label}: #</span>
            <span className="font-bold text-gray-900">{value ?? '-'}</span>
        </div>
    )
}