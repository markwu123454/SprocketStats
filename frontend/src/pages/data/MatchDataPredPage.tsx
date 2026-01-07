import {Link, useParams} from "react-router-dom"
import {useMatchData, usePermissions} from "@/components/wrappers/DataWrapper"
import {useEffect, useState} from "react";
import DataSearch from "@/components/ui/dataSearch.tsx";

const placeholder = {
    alliances: {
        red: {
            team_keys: {
                1323: {},
                3473: {},
                6995: {},
            }
        },
        blue: {
            team_keys: {
                4414: {},
                1690: {},
                2910: {},
            }
        }
    },
    event_key: "2026test",
    comp_level: "qualification",
}

export default function MatchDataPredPage() {
    const {matchKey} = useParams<{ matchKey: string }>()
    const permissions = usePermissions()
    const match = placeholder //useMatchData(matchKey ?? "")

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

    const red = match?.alliances?.red
    const blue = match?.alliances?.blue

    return (
        <div className="flex flex-col h-screen bg-white text-zinc-900">
            {/* === HEADER === */}
            <div className="flex items-center justify-between border-b border-zinc-200 px-8 py-4 h-20 bg-zinc-50">
                <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                        <h1 className="text-xl font-semibold">
                            {matchKey?.toUpperCase() ?? "MATCH"}
                        </h1>
                        <p className="text-sm text-zinc-500">
                            {match?.event_key ?? "Unknown Event"} —{" "}
                            {match?.comp_level?.toUpperCase() ?? "?"}
                        </p>
                    </div>
                    <DataSearch
                        teamNames={teamNames}
                        permissions={permissions}
                    />
                </div>


                <div className="flex items-center gap-10 text-lg font-semibold">
                    starting in 5 matches
                </div>
            </div>

            {/* === BODY === */}
            <div className="flex flex-1 overflow-hidden">
                <AlliancePanel
                    color="red"
                    alliance={red}
                    teamNames={teamNames}
                    permissions={permissions}
                />

                {/* CENTER COLUMN */}
                <div className="flex-1 flex flex-col overflow-auto bg-zinc-50 border-x border-zinc-200">
                    <SectionHeader label="Match Summary & Comparison"/>
                    <div className="flex-1 p-6 text-center text-sm text-zinc-500">
                        Charts, auto/teleop breakdowns, and alliance comparisons go here.
                    </div>
                </div>

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

/* ===================== SUBCOMPONENTS ===================== */

function AlliancePanel({
                           color,
                           alliance,
                           teamNames,
                           permissions,
                       }: {
    color: "red" | "blue"
    alliance: any
    teamNames: Record<number, string>
    permissions: any
}) {
    const bg = color === "red" ? "bg-red-50" : "bg-blue-50"

    const teamEntries = Object.entries(alliance?.team_keys ?? {})

    const teamSlots: {
        teamNum: number | null
        teamData: any | null
    }[] = [
        teamEntries[0]
            ? {teamNum: Number(teamEntries[0][0]), teamData: teamEntries[0][1]}
            : {teamNum: null, teamData: null},
        teamEntries[1]
            ? {teamNum: Number(teamEntries[1][0]), teamData: teamEntries[1][1]}
            : {teamNum: null, teamData: null},
        teamEntries[2]
            ? {teamNum: Number(teamEntries[2][0]), teamData: teamEntries[2][1]}
            : {teamNum: null, teamData: null},
    ]

    return (
        <div className={`flex-1 flex flex-col overflow-hidden ${bg}`}>
            <SectionHeader
                label={`${color === "red" ? "Red" : "Blue"} Alliance`}
                color={color}
            />

            <ul className="flex flex-col flex-1 divide-y divide-zinc-200">
                {teamSlots.map(({teamNum, teamData}, idx) => (
                    <AllianceTeamRow
                        key={idx}
                        color={color}
                        teamNum={teamNum}
                        teamName={teamNum !== null ? teamNames[teamNum] : undefined}
                        teamData={teamData}
                        canLink={
                            !!teamNum &&
                            !permissions?.team?.map(String).includes(String(teamNum))
                        }
                    />
                ))}
            </ul>
        </div>
    )
}


function AllianceTeamRow({
                             color,
                             teamNum,
                             teamName,
                             teamData,
                             canLink = false,
                         }: {
    color: "red" | "blue"
    teamNum: number | null
    teamName?: string
    teamData?: any | null
    canLink?: boolean
}) {
    const textColor = color === "red" ? "text-red-700" : "text-blue-700"
    const logoPath = teamNum ? `/teams/team_icons/${teamNum}.png` : null
    const linkHref = teamNum !== null ? `/data/team/${teamNum}` : ""

    const Content = (
        <div className="flex items-center gap-3 min-w-0">
            <img
                src={logoPath ?? ""}
                alt="logo"
                className={`h-8 w-8 rounded object-contain ring-1 ring-gray-200 ${
                    color === "red" ? "bg-red-500" : "bg-blue-500"
                }`}
                onError={(e) => (e.currentTarget.style.visibility = "hidden")}
            />

            <div className="min-w-0">
                <div className={`font-semibold truncate ${textColor}`}>
                    #{teamNum}
                </div>
                <div className="text-xs text-zinc-500 truncate">
                    {teamName ?? "Unknown Team"}
                </div>
            </div>
        </div>
    )

    return (
        <li className="flex-1 p-4 flex flex-col justify-between">
            {teamNum !== null ? (
                <>
                    {canLink ? (
                        <Link
                            to={linkHref}
                            className="hover:opacity-80 transition-opacity"
                        >
                            {Content}
                        </Link>
                    ) : (
                        Content
                    )}

                    {/* === Match-Specific Metrics === */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-500 mt-2">
                        <span>Auto: {teamData?.auto ?? "—"}</span>
                        <span>Endgame: {teamData?.endgame ?? "—"}</span>
                        <span>Role: {teamData?.role ?? "—"}</span>
                        <span>Reliability: {teamData?.reliability ?? "—"}</span>
                    </div>
                </>
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-zinc-400 text-sm italic">
                    Team slot not assigned
                </div>
            )}
        </li>
    )
}


function SectionHeader({
                           label,
                           color,
                       }: {
    label: string
    color?: "red" | "blue"
}) {
    const colorClass =
        color === "red"
            ? "text-red-700"
            : color === "blue"
                ? "text-blue-700"
                : "text-zinc-600"

    return (
        <div className={`px-5 py-2 border-b border-zinc-200 text-sm font-semibold ${colorClass}`}>
            {label}
        </div>
    )
}
