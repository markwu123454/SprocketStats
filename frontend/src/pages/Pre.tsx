import type {MatchScoutingData, TeamInfo} from "@/types"
import * as React from "react"
import {useEffect, useRef, useState} from "react"
import {getScouterName, useAPI} from "@/hooks/useAPI.ts"
import {useClientEnvironment} from "@/hooks/useClientEnvironment.ts";

export default function Pre({
                                data,
                                setData,
                            }: {
    data: MatchScoutingData
    setData: React.Dispatch<React.SetStateAction<MatchScoutingData>>
}) {
    const {claimTeam, unclaimTeam, getTeamList, getScouterState} = useAPI()
    const {isOnline, serverOnline} = useClientEnvironment()

    const [teamList, setTeamList] = useState<TeamInfo[] | null>(null)
    const [loadingTeams, setLoadingTeams] = useState(false)
    const [claiming, setClaiming] = useState(false)
    const [manualEntry, setManualEntry] = useState(false)
    const [manualTeam, setManualTeam] = useState<string>("")
    const [iconSrc, setIconSrc] = useState<string | null>(null)
    const [lastClaimedTeam, setLastClaimedTeam] = useState<number | null>(null)

    const {match, alliance, match_type, teamNumber} = data
    const scouter = getScouterName()!
    const inputRef = useRef<HTMLInputElement>(null)

    // === Load team list ===
    useEffect(() => {
        if (!(isOnline && serverOnline) || !match || !alliance) {
            setTeamList([])
            return
        }
        let alive = true
        setLoadingTeams(true)
        void (async () => {
            const teams = await getTeamList(match, match_type, alliance)
            if (alive) {
                setTeamList(teams)
                setLoadingTeams(false)
            }
        })()
        return () => {
            alive = false
        }
    }, [match, alliance, match_type, isOnline, serverOnline])

    // === Refresh scouter state ===
    useEffect(() => {
        if (!(isOnline && serverOnline) || !match || !alliance) return
        let alive = true
        let ticking = false
        const tick = async () => {
            if (ticking) return
            ticking = true
            const state = await getScouterState(match, match_type, alliance)
            if (alive && state) {
                const teamsMap = state.teams
                setTeamList(prev =>
                    !prev
                        ? prev
                        : prev.map(t =>
                            t.number in teamsMap
                                ? {...t, scouter: teamsMap[t.number].scouter}
                                : t
                        )
                )
            }
            ticking = false
        }
        void tick()
        const id = setInterval(tick, 1000)
        return () => {
            alive = false
            clearInterval(id)
        }
    }, [isOnline, serverOnline, match, alliance, match_type])

    // === Manual entry image preview ===
    useEffect(() => {
        if (!manualTeam || manualTeam.trim() === "") {
            setIconSrc(null)
            return
        }
        const num = parseInt(manualTeam)
        if (isNaN(num)) {
            setIconSrc(null)
            return
        }
        const path = `/teams/team_icons/${num}.png`
        const img = new Image()
        img.src = path
        img.onload = () => setIconSrc(path)
        img.onerror = () => setIconSrc("/placeholder.png")
    }, [manualTeam])

    // === Manual entry hook to sync team number ===
    useEffect(() => {
        if (!manualEntry) return
        const num = parseInt(manualTeam)
        if (isNaN(num) || num <= 0) return

        setData(d => ({
            ...d,
            teamNumber: num,
        }))
    }, [manualEntry, manualTeam, setData])

    useEffect(() => {
        if (!isOnline || !serverOnline) return
        if (!match || !teamNumber) return

        void (async () => {
            try {
                await unclaimTeam(match, teamNumber, match_type, scouter)
            } finally {
                setData(d => ({
                    ...d,
                    teamNumber: null,
                }))
            }
        })()
    }, [match, match_type, alliance])


    // === Offline auto-activate manual entry ===
    useEffect(() => {
        if (!isOnline) {
            setManualEntry(true)
        }
    }, [isOnline])

    const handleTeamSelect = async (newTeamNumber: number) => {
        if (claiming) return
        setClaiming(true)
        try {
            if (match && teamNumber !== null && teamNumber !== newTeamNumber) {
                const oldTeamNumber = teamNumber
                setTeamList(prev =>
                    prev?.map(t =>
                        t.number === oldTeamNumber ? {...t, scouter: null} : t
                    ) ?? null
                )
                await unclaimTeam(match, oldTeamNumber, match_type, scouter)
            }

            setData(d => ({
                ...d,
                teamNumber: newTeamNumber,
            }))

            if (match && newTeamNumber !== null) {
                await claimTeam(match, newTeamNumber, match_type, scouter)
            }
        } finally {
            setClaiming(false)
        }
    }


    return (
        <div className="p-4 w-full h-full flex flex-col justify gap-2">
            <div>Pre-Match</div>

            {/* Match Type */}
            <div>
                <label className="block text-lg font-medium mb-1">Match Type</label>
                <div className="flex gap-2 grid-cols-3">
                    {([
                        ["qm", "Qualifications"],
                        ["sf", "Playoffs"],
                        ["f", "Finals"],
                    ] as const).map(([key, label]) => (
                        <button
                            key={key}
                            disabled={claiming}
                            onClick={() => {
                                if ((isOnline && serverOnline) && match && teamNumber !== null) {
                                    void unclaimTeam(match, teamNumber, match_type, scouter)
                                }
                                setData(d => ({
                                    ...d,
                                    match_type: key,
                                    teamNumber: d.match_type === key ? d.teamNumber : null,
                                }))
                            }}
                            className={`py-1 w-[33%] h-10 rounded text-base ${
                                data.match_type === key
                                    ? "bg-zinc-400 text-white"
                                    : "bg-zinc-700 text-white"
                            } ${claiming ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Match Number */}
            <div>
                <label className="block text-lg font-medium mb-1">Match Number</label>
                <input
                    type="text"
                    inputMode="numeric"
                    defaultValue={match === 0 ? "" : match!}
                    ref={inputRef}
                    disabled={claiming}
                    onChange={(e) => {
                        const raw = e.target.value.replace(/\s/g, '')
                        const newMatch = /^-?\d*\.?\d+$/.test(raw) ? parseFloat(raw) : 0
                        setData(d => ({
                            ...d,
                            match: newMatch,
                            teamNumber: d.match === newMatch ? d.teamNumber : null,
                        }))
                    }}
                    className="w-full p-2 rounded bg-zinc-800 border border-zinc-700 text-white"
                />
            </div>

            {/* Alliance */}
            <div>
                <label className="block text-lg font-medium mb-1">Select Alliance</label>
                <div className="flex gap-4">
                    {(['red', 'blue'] as const).map(color => (
                        <button
                            key={color}
                            disabled={claiming}
                            onClick={() => {
                                if ((isOnline && serverOnline) && match && teamNumber !== null) {
                                    void unclaimTeam(match, teamNumber, match_type, scouter)
                                }
                                setData(d => ({
                                    ...d,
                                    alliance: color,
                                    teamNumber: d.alliance === color ? d.teamNumber : null,
                                }))
                            }}
                            className={`w-16 h-16 rounded ${alliance === color ? 'outline-2 ' : ''} ${
                                color === 'red' ? 'bg-red-600 outline-red-300' : 'bg-blue-600 outline-blue-300'
                            } ${claiming ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                    ))}
                </div>
            </div>

            {/* Team Selection */}
            <div>
                <div className="flex items-center justify-between mb-1">
                    <label className="text-lg font-medium">Select Team</label>
                    {(isOnline && serverOnline) && (
                        <button
                            onClick={async () => {
                                if (!manualEntry) {
                                    // entering manual mode: unclaim current team
                                    if ((isOnline && serverOnline) && match && teamNumber !== null) {
                                        setLastClaimedTeam(teamNumber)
                                        await unclaimTeam(match, teamNumber, match_type, scouter)
                                        setData(d => ({...d, teamNumber: null}))
                                    }
                                    setManualEntry(true)
                                } else {
                                    // leaving manual mode: reclaim last team
                                    if ((isOnline && serverOnline) && match && lastClaimedTeam !== null) {
                                        await claimTeam(match, lastClaimedTeam, match_type, scouter)
                                        setData(d => ({...d, teamNumber: lastClaimedTeam}))
                                    }
                                    setManualEntry(false)
                                }
                            }}
                            className="text-sm text-zinc-400 hover:text-zinc-300"
                        >
                            I don’t see my team
                        </button>
                    )}
                </div>

                {manualEntry ? (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                            <div
                                className={`flex-shrink-0 w-16 h-16 rounded flex items-center justify-center ${
                                    alliance === 'red'
                                        ? 'bg-red-700'
                                        : alliance === 'blue'
                                            ? 'bg-blue-700'
                                            : 'bg-zinc-700'
                                }`}
                            >
                                {iconSrc && (
                                    <img
                                        src={iconSrc}
                                        alt="Team icon"
                                        className="w-12 h-12 object-contain rounded"
                                    />
                                )}
                            </div>
                            <input
                                type="text"
                                inputMode="numeric"
                                placeholder="Enter team number"
                                value={manualTeam}
                                onChange={(e) => setManualTeam(e.target.value)}
                                className="flex-1 min-w-0 p-2 rounded bg-zinc-800 border border-zinc-700 text-white"
                            />
                        </div>
                        <button disabled className="w-full py-2 rounded bg-zinc-800 opacity-50">---</button>
                        <button disabled className="w-full py-2 rounded bg-zinc-800 opacity-50">---</button>
                    </div>
                ) : (
                    // existing team list
                    <div className="flex flex-col gap-2">
                        {loadingTeams ? (
                            // Skeleton loading for team list
                            Array.from({length: 3}).map((_, i) => (
                                <div
                                    key={i}
                                    className="w-full py-2 px-4 rounded bg-zinc-800 flex items-center gap-3 animate-pulse"
                                >
                                    <div className="w-10 h-10 rounded bg-zinc-700"/>
                                    <div className="flex flex-col flex-1 gap-2">
                                        <div className="h-4 bg-zinc-700 rounded w-2/3"/>
                                        <div className="h-3 bg-zinc-700 rounded w-1/3"/>
                                    </div>
                                </div>
                            ))
                        ) : (
                            (teamList === null
                                    ? Array(3).fill(null)
                                    : teamList.length > 0
                                        ? teamList
                                        : Array(3).fill(undefined)
                            ).map((team, i) => {
                                if (!team) {
                                    return (
                                        <button
                                            key={i}
                                            disabled
                                            className="w-full py-2 rounded bg-zinc-800 opacity-50"
                                        >
                                            ---
                                        </button>
                                    )
                                }
                                const isSelected = teamNumber === team.number
                                const isClaimed = team.scouter !== null && team.number !== teamNumber
                                const localIcon = `/teams/team_icons/${team.number}.png`
                                return (
                                    <button
                                        key={team.number}
                                        disabled={isClaimed || claiming}
                                        onClick={() => handleTeamSelect(team.number)}
                                        className={`w-full py-2 px-4 rounded flex items-center justify-center gap-3 ${
                                            isSelected ? 'bg-zinc-500' : 'bg-zinc-700'
                                        } ${
                                            (isClaimed || claiming)
                                                ? 'opacity-50 cursor-not-allowed'
                                                : ''
                                        }`}
                                    >
                                        <div className={`w-10 h-10 rounded flex items-center justify-center ${
                                            alliance === 'red'
                                                ? 'bg-red-700'
                                                : alliance === 'blue'
                                                    ? 'bg-blue-700'
                                                    : 'bg-zinc-600'
                                        }`}>
                                            <img
                                                src={localIcon}
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).src =
                                                        team.logo ?? '/placeholder.png'
                                                }}
                                                alt={team.name}
                                                className="w-8 h-8 rounded object-contain"
                                            />
                                        </div>
                                        <div className="text-xl flex items-center gap-1 max-w-full">
                                            <span>{team.nickname}</span>
                                            <span>{team.number}</span>
                                        </div>

                                        {isClaimed && (
                                            <span className="text-sm">
                                                {`Scouting by ${team.scouter === scouter ? 'you' : team.scouter}`}
                                            </span>
                                        )}
                                    </button>
                                )
                            })
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
