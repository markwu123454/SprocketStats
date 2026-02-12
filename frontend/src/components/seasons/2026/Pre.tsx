import * as React from "react"
import {useEffect, useRef, useState, useMemo, useCallback} from "react"
import {useAPI, getScouterEmail} from "@/hooks/useAPI.ts"
import {useClientEnvironment} from "@/hooks/useClientEnvironment.ts"
import type {MatchScoutingData, TeamInfo} from "@/types"
import {ImageOff} from "lucide-react"

// ─── Utility: derive icon src synchronously from team number ───
function getTeamIconSrc(teamNumber: string): string | null {
    if (!teamNumber || teamNumber.trim() === "") return null
    const num = parseInt(teamNumber)
    if (isNaN(num)) return null
    return `/teams/team_icons/${num}.png`
}

export default function PrePhase({data, setData}: {
    data: MatchScoutingData
    setData: React.Dispatch<React.SetStateAction<MatchScoutingData>>
}) {
    // === Hooks / API ===
    const {scoutingAction, getScouterSchedule} = useAPI()
    const {isOnline, serverOnline} = useClientEnvironment()

    // === Local State ===
    const [teamList, setTeamList] = useState<TeamInfo[] | null>(null)
    const [loadingTeams, setLoadingTeams] = useState(false)
    const [claiming, setClaiming] = useState(false)
    const [manualTeam, setManualTeam] = useState<string>("")
    const [lastClaimedTeam, setLastClaimedTeam] = useState<number | null>(null)
    const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({})
    const [teamNames, setTeamNames] = useState<Record<string, string>>({})
    const [schedule, setSchedule] = useState<Awaited<ReturnType<typeof getScouterSchedule>>>([])
    const [iconValid, setIconValid] = useState(false) // tracks whether manual icon loaded successfully

    // === Derived values (single source of truth) ===
    // manualEntry is derived from data.manualTeam — no separate local state
    const manualEntry = data.manualTeam ?? false

    const {match, alliance, match_type, teamNumber} = data
    const scouterEmail = getScouterEmail()!
    const inputRef = useRef<HTMLInputElement>(null)

    const ready = isOnline && serverOnline && match_type !== null && match !== null && match > 0 && alliance !== null

    // Derive icon src from manualTeam input (no effect needed)
    const candidateIconSrc = useMemo(() => getTeamIconSrc(manualTeam), [manualTeam])

    // We still need to validate the image loads, but we derive the *candidate* path
    // and only use an effect for the async image probe
    useEffect(() => {
        if (!candidateIconSrc) {
            setIconValid(false)
            return
        }
        const img = new Image()
        img.src = candidateIconSrc
        img.onload = () => setIconValid(true)
        img.onerror = () => setIconValid(false)
    }, [candidateIconSrc])

    const iconSrc = candidateIconSrc
        ? (iconValid ? candidateIconSrc : "/placeholder.png")
        : null

    // === Helper: set manualEntry via data (single source of truth) ===
    const setManualEntryMode = useCallback((enabled: boolean) => {
        setData(d => ({...d, manualTeam: enabled}))
    }, [setData])

    // === Helper: apply scouting result to team list ===
    // Stable function — uses setState updater form, no external deps
    const applyScoutingResultRef = useRef((
        res: Awaited<ReturnType<typeof scoutingAction>>
    ) => {
        if (!res?.match) return
        setTeamList(prev =>
            !prev ? prev : prev.map(t => {
                const row = res.match.find(r => r.team === t.number)
                if (!row) return t
                return {
                    ...t,
                    scouter: row.scouterEmail,
                    name: row.scouterName,
                    assigned_scouter: row.assignedScouterEmail,
                    assigned_name: row.assignedScouterName,
                }
            })
        )
    })
    const applyScoutingResult = applyScoutingResultRef.current

    // === Helper: unclaim current team ===
    const unclaimIfNeeded = useCallback(async () => {
        if (!ready || !isOnline || !serverOnline || !match || teamNumber === null) return
        try {
            applyScoutingResultRef.current(
                await scoutingActionRef.current(match, teamNumber, match_type, alliance, "unclaim")
            )
        } finally {
            setData(d => ({...d, teamNumber: null}))
        }
    }, [ready, isOnline, serverOnline, match, teamNumber, match_type, alliance, setData])

    // === Load team names (once) ===
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const res = await fetch("/teams/team_names.json")
                const json = await res.json()
                if (alive) setTeamNames(json)
            } catch (e) {
                console.error("Failed to load team names", e)
            }
        })()
        return () => {
            alive = false
        }
    }, [])

    // === Stable ref for scoutingAction (avoids interval re-creation) ===
    const scoutingActionRef = useRef(scoutingAction)
    scoutingActionRef.current = scoutingAction

    // === Load team list when match/alliance are ready ===
    useEffect(() => {
        if (!ready) return
        let alive = true
        setLoadingTeams(true)

        void (async () => {
            const res = await scoutingActionRef.current(match, null, match_type, alliance, "info")
            if (!alive || !res?.match) return

            setTeamList(
                res.match.map(r => ({
                    number: r.team,
                    teamName: teamNames[r.team] ?? `Team ${r.team}`,
                    scouterName: null,
                    logo: `/teams/team_icons/${r.team}.png`,
                    scouter: r.scouterEmail,
                    assigned_scouter: r.assignedScouterEmail,
                    assigned_name: r.assignedScouterName,
                }))
            )
            setLoadingTeams(false)
        })()

        return () => {
            alive = false
        }
    }, [isOnline, serverOnline, match, match_type, alliance])

    // === Live refresh of scouter claim state (polling) ===
    // Deps are ONLY the primitive values that determine whether polling should run.
    // scoutingAction and applyScoutingResult are accessed via stable refs.
    const teamListReady = (teamList?.length ?? 0) > 0

    useEffect(() => {
        if (!ready || !teamListReady) return

        let alive = true
        let ticking = false

        const tick = async () => {
            if (ticking) return
            ticking = true
            try {
                const res = await scoutingActionRef.current(match, null, match_type, alliance, "info")
                if (alive) applyScoutingResultRef.current(res)
            } finally {
                ticking = false
            }
        }

        // Don't fire immediately — the load effect above already fetched
        const id = setInterval(tick, 1000)
        return () => {
            alive = false;
            clearInterval(id)
        }
    }, [ready, teamListReady, match, match_type, alliance])

    // === Stable ref for getScouterSchedule ===
    const getScouterScheduleRef = useRef(getScouterSchedule)
    getScouterScheduleRef.current = getScouterSchedule

    // === Load schedule ===
    useEffect(() => {
        if (!(isOnline && serverOnline)) return
        let alive = true
        void (async () => {
            const res = await getScouterScheduleRef.current()
            if (alive) setSchedule(res)
        })()
        return () => {
            alive = false
        }
    }, [isOnline, serverOnline])

    // === Sync manualTeam input from data.teamNumber when entering manual mode ===
    useEffect(() => {
        if (!manualEntry || !data.teamNumber) return
        setManualTeam(String(data.teamNumber))
    }, [manualEntry, data.teamNumber])

    // === Manual entry: update team number in data ===
    useEffect(() => {
        if (!manualEntry) return
        const num = parseInt(manualTeam)
        if (isNaN(num) || num <= 0) return
        setData(d => ({...d, teamNumber: num}))
    }, [manualEntry, manualTeam, setData])

    // === Offline mode: force manual entry ===
    useEffect(() => {
        if (!isOnline) {
            setData(d => ({...d, manualTeam: true}))
        }
    }, [isOnline, setData])

    // === Handle selecting a team (claim logic) ===
    const claimAttemptRef = useRef(0)

    const handleTeamSelect = useCallback(async (newTeamNumber: number) => {
        if (claiming || !ready || !match) return

        setClaiming(true)
        const attemptId = ++claimAttemptRef.current
        const previousTeam = teamNumber

        try {
            let res
            if (previousTeam !== null && previousTeam !== newTeamNumber) {
                res = await scoutingActionRef.current(match, newTeamNumber, match_type, alliance, "switch")
            } else if (previousTeam === null) {
                res = await scoutingActionRef.current(match, newTeamNumber, match_type, alliance, "claim")
            } else {
                setClaiming(false)
                return
            }

            if (claimAttemptRef.current !== attemptId) return

            applyScoutingResultRef.current(res)

            if (res?.action === "success") {
                setData(d => ({...d, teamNumber: newTeamNumber}))
            } else {
                setData(d => ({...d, teamNumber: null}))
            }
        } catch (e) {
            console.error("Team selection failed", e)
            if (claimAttemptRef.current === attemptId) {
                setData(d => ({...d, teamNumber: null}))
            }
        } finally {
            if (claimAttemptRef.current === attemptId) {
                setClaiming(false)
            }
        }
    }, [claiming, ready, match, teamNumber, match_type, alliance, setData])

    // === Handle clicking on assigned match ===
    // FIX: pass values directly to claim call instead of reading from state after setTimeout
    const handleScheduleClick = useCallback(async (scheduleItem: typeof schedule[number]) => {
        await unclaimIfNeeded()

        const nextMatchType = scheduleItem.match_type
        const nextMatch = scheduleItem.match_number
        const nextAlliance = scheduleItem.alliance
        const nextTeam = scheduleItem.robot

        setData(d => ({
            ...d,
            match_type: nextMatchType,
            match: nextMatch,
            alliance: nextAlliance,
            teamNumber: null,
        }))

        // Use the values directly — don't rely on state being updated
        if (isOnline && serverOnline) {
            try {
                const res = await scoutingActionRef.current(
                    nextMatch,
                    nextTeam,
                    nextMatchType,
                    nextAlliance,
                    "claim"
                )
                applyScoutingResultRef.current(res)
                if (res?.action === "success") {
                    setData(d => ({...d, teamNumber: nextTeam}))
                }
            } catch (e) {
                console.error("Auto-claim failed", e)
            }
        }
    }, [unclaimIfNeeded, isOnline, serverOnline, setData])

    // === Toggle manual entry mode ===
    const toggleManualEntry = useCallback(async () => {
        if (!manualEntry) {
            // Entering manual mode — unclaim current
            if (isOnline && serverOnline && match && teamNumber !== null && ready) {
                setLastClaimedTeam(teamNumber)
                applyScoutingResultRef.current(
                    await scoutingActionRef.current(match, teamNumber, match_type, alliance, "unclaim")
                )
                setData(d => ({...d, teamNumber: null}))
            }
            setManualEntryMode(true)
        } else {
            // Leaving manual mode — restore last claim
            if (isOnline && serverOnline && match && lastClaimedTeam !== null && ready) {
                applyScoutingResultRef.current(
                    await scoutingActionRef.current(match, lastClaimedTeam, match_type, alliance, "claim")
                )
                setData(d => ({...d, teamNumber: lastClaimedTeam}))
            }
            setManualEntryMode(false)
        }
    }, [manualEntry, isOnline, serverOnline, match, teamNumber, ready, match_type, alliance, lastClaimedTeam, setData, setManualEntryMode])

    // === UI ===
    return (
        <div className="p-4 w-full h-full flex flex-col justify gap-2 relative">

            <div>Pre-Match</div>

            {/* Match Type Selector */}
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
                            onClick={async () => {
                                if (data.match_type !== key) await unclaimIfNeeded()
                                setData(d => ({
                                    ...d,
                                    match_type: key,
                                    teamNumber: d.match_type === key ? d.teamNumber : null,
                                }))
                            }}
                            className={`py-1 w-[33%] h-10 rounded text-base ${
                                data.match_type === key ? "bg-zinc-400 text-white" : "bg-zinc-700 text-white"
                            } ${claiming ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Match Number Input */}
            <div>
                <label className="block text-lg font-medium mb-1">Match Number</label>
                <input
                    type="text"
                    inputMode="numeric"
                    defaultValue={match === 0 ? "" : match!}
                    ref={inputRef}
                    disabled={claiming}
                    onChange={async (e) => {
                        const raw = e.target.value.replace(/\s/g, '')
                        const newMatch = /^-?\d*\.?\d+$/.test(raw) ? parseFloat(raw) : 0
                        if (newMatch !== match) await unclaimIfNeeded()
                        setData(d => ({
                            ...d,
                            match: newMatch,
                            teamNumber: d.match === newMatch ? d.teamNumber : null,
                        }))
                    }}
                    className="w-full p-2 rounded bg-zinc-800 border border-zinc-700 text-white"
                />
            </div>

            {/* Alliance Selector */}
            <div>
                <label className="block text-lg font-medium mb-1">Select Alliance</label>
                <div className="flex gap-4">
                    {(['red', 'blue'] as const).map(color => (
                        <button
                            key={color}
                            disabled={claiming}
                            onClick={async () => {
                                if (data.alliance !== color) await unclaimIfNeeded()
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

            {/* Team Selection Section */}
            <div>
                <div className="flex items-center justify-between mb-1">
                    <label className="text-lg font-medium">Select Team</label>
                    {(isOnline && serverOnline) && (
                        <button
                            onClick={toggleManualEntry}
                            className="text-sm text-zinc-400 hover:text-zinc-300"
                        >
                            {manualEntry ? "I see my team" : "I don't see my team"}
                        </button>
                    )}
                </div>

                {manualEntry ? (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                            <div
                                className={`shrink-0 w-16 h-16 rounded flex items-center justify-center ${
                                    alliance === 'red' ? 'bg-red-700'
                                        : alliance === 'blue' ? 'bg-blue-700'
                                            : 'bg-zinc-700'
                                }`}
                            >
                                {iconSrc && (
                                    <img src={iconSrc} alt="Team icon" className="w-12 h-12 object-contain rounded"/>
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
                    <div className="flex flex-col gap-2">
                        {loadingTeams ? (
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
                                        <button key={i} disabled className="w-full py-2 rounded bg-zinc-800 opacity-50">
                                            ---
                                        </button>
                                    )
                                }

                                const isAssignedToMe = team.assigned_scouter === scouterEmail
                                const isSelected = teamNumber === team.number
                                const isClaimed = team.scouter !== null && team.number !== teamNumber
                                const localIcon = `/teams/team_icons/${team.number}.png`

                                return (
                                    <button
                                        key={team.number}
                                        disabled={isClaimed || claiming}
                                        onClick={() => handleTeamSelect(team.number)}
                                        className={`w-full py-2 px-4 rounded flex items-center justify-center gap-3 
                                        ${isSelected ? 'bg-zinc-500' : 'bg-zinc-700'}
                                        ${isAssignedToMe ? 'ring-2 ring-yellow-400' : ''}
                                        ${(isClaimed || claiming) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        <div
                                            className={`w-10 h-10 rounded flex items-center justify-center ${
                                                alliance === "red" ? "bg-red-700"
                                                    : alliance === "blue" ? "bg-blue-700"
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

                                        <div className="text-xl flex items-center gap-1 max-w-full">
                                            <span>{teamNames[team.number] ?? "Unknown Team: "}</span>
                                            <span>{team.number}</span>
                                        </div>

                                        {isSelected ? (
                                            <span
                                                className={`text-xs font-semibold ${isAssignedToMe ? "text-yellow-400" : "text-green-400"}`}>
                                                Claimed!
                                            </span>
                                        ) : isAssignedToMe ? (
                                            <span className="text-yellow-400 text-xs font-semibold">
                                                Assigned to you
                                            </span>
                                        ) : null}
                                        {isClaimed && (
                                            <span className="text-zinc-400 text-xs">
                                                {team.scouter === scouterEmail
                                                    ? "Scouting by you"
                                                    : `Scouting by ${team.name ?? "another scouter"}`}
                                            </span>
                                        )}
                                    </button>
                                )
                            })
                        )}
                    </div>
                )}
            </div>

            {schedule.length > 0 && (
                <div className="mt-4">
                    <div className="text-sm font-medium text-zinc-300 mb-2">
                        Your Upcoming Assignments
                    </div>
                    <div className="flex flex-col gap-1">
                        {schedule.map((s, i) => (
                            <button
                                key={i}
                                onClick={() => handleScheduleClick(s)}
                                className="text-xs flex justify-between items-center px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors cursor-pointer"
                            >
                                <span>
                                    {s.match_type?.toUpperCase()} {s.match_number}
                                    {s.set_number != 1 ? `-${s.set_number}` : ""}
                                </span>
                                <span className={`font-medium ${
                                    s.alliance === "red" ? "text-red-400" : "text-blue-400"
                                }`}>
                                    Team {s.robot}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}