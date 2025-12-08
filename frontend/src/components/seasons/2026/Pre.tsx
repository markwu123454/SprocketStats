import * as React from "react"
import {useEffect, useRef, useState} from "react"
import {useAPI, getScouterEmail} from "@/hooks/useAPI.ts"
import {useClientEnvironment} from "@/hooks/useClientEnvironment.ts";
import type {MatchScoutingData, TeamInfo} from "@/types"
import {ImageOff} from "lucide-react";

export default function PrePhase({data, setData}: {
    data: MatchScoutingData
    setData: React.Dispatch<React.SetStateAction<MatchScoutingData>>
}) {
    // === Hooks / API ===
    const {claimTeam, unclaimTeam, getTeamList, getScouterState} = useAPI()
    const {isOnline, serverOnline} = useClientEnvironment()

    // === Local State ===
    const [teamList, setTeamList] = useState<TeamInfo[] | null>(null) // available teams
    const [loadingTeams, setLoadingTeams] = useState(false) // UI loading flag for team list
    const [claiming, setClaiming] = useState(false) // debounce flag for team claiming
    const [manualEntry, setManualEntry] = useState(false) // toggle for manual entry mode
    const [manualTeam, setManualTeam] = useState<string>("") // input value in manual mode
    const [iconSrc, setIconSrc] = useState<string | null>(null) // live preview of team icon
    const [lastClaimedTeam, setLastClaimedTeam] = useState<number | null>(null) // backup to restore if user leaves manual entry
    const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({});
    const [teamNames, setTeamNames] = useState<Record<string, string>>({});

    // === Derived constants ===
    const {match, alliance, match_type, teamNumber} = data
    const scouterEmail = getScouterEmail()!
    const inputRef = useRef<HTMLInputElement>(null)

    // === Load team list from server ===
    useEffect(() => {
        if (!(isOnline && serverOnline) || !match || !alliance) {
            setTeamList([]) // reset when not ready
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

        // cancel stale updates
        return () => {
            alive = false
        }
    }, [match, alliance, match_type, isOnline, serverOnline])

    useEffect(() => {
        let alive = true;

        (async () => {
            try {
                const res = await fetch("/teams/team_names.json");
                const json = await res.json();
                if (alive) setTeamNames(json);
            } catch (e) {
                console.error("Failed to load team names", e);
            }
        })();

        return () => {
            alive = false
        };
    }, []);


    // === Live refresh of scouter claim state ===
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
                // merge new scouter data into local list
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
        const id = setInterval(tick, 1000) // 1s poll interval
        return () => {
            alive = false
            clearInterval(id)
        }
    }, [isOnline, serverOnline, match, alliance, match_type])

    // === Manual entry: show icon preview ===
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

    // === Manual entry: update team number in data ===
    useEffect(() => {
        if (!manualEntry) return
        const num = parseInt(manualTeam)
        if (isNaN(num) || num <= 0) return
        setData(d => ({...d, teamNumber: num}))
    }, [manualEntry, manualTeam, setData])

    // === Auto-unclaim previous team when match/alliance changes ===
    useEffect(() => {
        if (!isOnline || !serverOnline) return
        if (!match || !teamNumber) return

        void (async () => {
            try {
                await unclaimTeam(match, teamNumber, match_type, scouterEmail)
            } finally {
                setData(d => ({...d, teamNumber: null}))
            }
        })()
    }, [match, match_type, alliance])

    // === Offline mode: force manual entry ===
    useEffect(() => {
        if (!isOnline) setManualEntry(true)
    }, [isOnline])

    // === Handle selecting a team (claim logic) ===
    const handleTeamSelect = async (newTeamNumber: number) => {
        if (claiming) return
        setClaiming(true)
        try {
            // unclaim old team if different
            if (match && teamNumber !== null && teamNumber !== newTeamNumber) {
                const oldTeamNumber = teamNumber
                setTeamList(prev =>
                    prev?.map(t =>
                        t.number === oldTeamNumber ? {...t, scouter: null} : t
                    ) ?? null
                )
                await unclaimTeam(match, oldTeamNumber, match_type, scouterEmail)
            }

            // update selected team locally
            setData(d => ({...d, teamNumber: newTeamNumber}))

            // claim team on server
            if (match && newTeamNumber !== null) {
                await claimTeam(match, newTeamNumber, match_type, scouterEmail)
            }
        } finally {
            setClaiming(false)
        }
    }

    // === UI ===
    return (
        <div className="p-4 w-full h-full flex flex-col justify gap-2">
            <div>Pre-Match</div>

            {/* === Match Type Selector === */}
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
                                // unclaim before switching type
                                if ((isOnline && serverOnline) && match && teamNumber !== null) {
                                    void unclaimTeam(match, teamNumber, match_type, scouterEmail)
                                }
                                // update match type; clear team if changed
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

            {/* === Match Number Input === */}
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
                        // reset team if match changes
                        setData(d => ({
                            ...d,
                            match: newMatch,
                            teamNumber: d.match === newMatch ? d.teamNumber : null,
                        }))
                    }}
                    className="w-full p-2 rounded bg-zinc-800 border border-zinc-700 text-white"
                />
            </div>

            {/* === Alliance Selector === */}
            <div>
                <label className="block text-lg font-medium mb-1">Select Alliance</label>
                <div className="flex gap-4">
                    {(['red', 'blue'] as const).map(color => (
                        <button
                            key={color}
                            disabled={claiming}
                            onClick={() => {
                                if ((isOnline && serverOnline) && match && teamNumber !== null) {
                                    void unclaimTeam(match, teamNumber, match_type, scouterEmail)
                                }
                                // update alliance; clear team if switching sides
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

            {/* === Team Selection Section === */}
            <div>
                <div className="flex items-center justify-between mb-1">
                    <label className="text-lg font-medium">Select Team</label>
                    {/* toggle manual entry mode */}
                    {(isOnline && serverOnline) && (
                        <button
                            onClick={async () => {
                                if (!manualEntry) {
                                    // entering manual mode — unclaim current
                                    if ((isOnline && serverOnline) && match && teamNumber !== null) {
                                        setLastClaimedTeam(teamNumber)
                                        await unclaimTeam(match, teamNumber, match_type, scouterEmail)
                                        setData(d => ({...d, teamNumber: null}))
                                    }
                                    setManualEntry(true)
                                } else {
                                    // leaving manual mode — restore last claim
                                    if ((isOnline && serverOnline) && match && lastClaimedTeam !== null) {
                                        await claimTeam(match, lastClaimedTeam, match_type, scouterEmail)
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

                {/* Manual entry mode */}
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
                        {/* disabled placeholders for UI spacing */}
                        <button disabled className="w-full py-2 rounded bg-zinc-800 opacity-50">---</button>
                        <button disabled className="w-full py-2 rounded bg-zinc-800 opacity-50">---</button>
                    </div>
                ) : (
                    // === Online team list mode ===
                    <div className="flex flex-col gap-2">
                        {loadingTeams ? (
                            // skeleton placeholders while loading
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
                            // team list or fallback placeholders
                            (teamList === null
                                    ? Array(3).fill(null)
                                    : teamList.length > 0
                                        ? teamList
                                        : Array(3).fill(undefined)
                            ).map((team, i) => {
                                if (!team) {
                                    // placeholder rows when no data
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

                                // state per team
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
                                        } ${(isClaimed || claiming) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >

                                        {/* team color bubble */}
                                        <div
                                            className={`w-10 h-10 rounded flex items-center justify-center ${
                                                alliance === "red"
                                                    ? "bg-red-700"
                                                    : alliance === "blue"
                                                        ? "bg-blue-700"
                                                        : "bg-zinc-600"
                                            }`}
                                        >
                                            {imageErrors[team.number] ? (
                                                <ImageOff className="w-6 h-6 text-zinc-200"/>
                                            ) : (
                                                <img
                                                    src={localIcon}
                                                    alt={team.name}
                                                    className="w-8 h-8 rounded object-contain"
                                                    onError={() =>
                                                        setImageErrors((prev) => ({...prev, [team.number]: true}))
                                                    }
                                                />
                                            )}
                                        </div>

                                        {/* team name and number */}
                                        <div className="text-xl flex items-center gap-1 max-w-full">
                                            <span>{teamNames[team.number] ?? "Unknown Team: "}</span>
                                            <span>{team.number}</span>
                                        </div>

                                        {/* show claim info */}
                                        {isClaimed && (
                                            <span className="text-sm">
                                                {team.scouter === scouterEmail ? "Scouting by you" : `Scouting by ${team.scouter}`}
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
