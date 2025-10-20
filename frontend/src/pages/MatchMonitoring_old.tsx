import {useEffect, useState} from 'react'
import {getAuthHeaders, useAPI} from '@/hooks/useAPI.ts'
import {Badge} from '@/components/ui/badge'
import type {TeamInfo, UIInfo, MatchScoutingData, MatchType} from '@/types'
import field_overlay from '@/assets/2025_FMS_In-Match.png'
import {defaultUIINFO} from "@/components/seasons/2025/yearConfig.ts";
import {Input} from '@/components/ui/input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select.tsx";


export default function MatchMonitoringLayout() {
    const {getAllStatuses, getTeamList} = useAPI()
    const [teamStatuses, setTeamStatuses] = useState<
        { match: string; team: number; status: string; scouter: string | null }[]
    >([])
    const [activeOnly, setActiveOnly] = useState<
        { match: string; team: number; status: string; scouter: string | null }[]
    >([])

    const [matchNum, setMatchNum] = useState(2)
    const [matchType, setMatchType] = useState<MatchType>("f")
    const [matchRed, setMatchRed] = useState<TeamInfo[]>([])
    const [matchBlue, setMatchBlue] = useState<TeamInfo[]>([])
    const [lastTimestamp, setLastTimestamp] = useState<string>("0")

    const [matchInfo, setMatchInfo] = useState<UIInfo>(defaultUIINFO);

    const [fullMatchInfo, setFullMatchInfo] = useState<MatchScoutingData[]>([])

    const loadStatuses = async () => {
        const all = await getAllStatuses()
        if (!all) return

        const allTeams = []
        const active = []

        for (const match in all) {
            for (const teamStr in all[match]) {
                const {status, scouter} = all[match][teamStr]
                const entry = {
                    match,
                    team: Number(teamStr),
                    status,
                    scouter,
                }

                if (status !== 'unclaimed') {
                    allTeams.push(entry)
                }

                if (status !== 'unclaimed' && status !== 'submitted') {
                    active.push(entry)
                }
            }
        }

        setTeamStatuses(allTeams) // full list
        setActiveOnly(active)     // active only
    }

    const handleMatchJump = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newMatchNum = parseInt(e.target.value);
        if (!isNaN(newMatchNum) && newMatchNum > 0) {
            setMatchNum(newMatchNum);
        }
    };

    // Function to handle match type change
    const handleMatchTypeChange = (type: MatchType) => {
        setMatchType(type);
    };

    const loadTeams = async (m: number) => {
        const red = await getTeamList(m, matchType, 'red')
        const blue = await getTeamList(m, matchType, 'blue')
        setMatchRed(red)
        setMatchBlue(blue)
    }

    useEffect(() => {
        void loadStatuses()
        void loadTeams(matchNum)

        const interval = setInterval(() => {
            void loadStatuses()
        }, 2000)
        return () => clearInterval(interval)
    }, [matchNum, matchType])

    const nextMatch = () => {
        setActiveOnly((prev) =>
            prev.filter((entry) => entry.match !== String(matchNum))
        )
        setMatchNum((n) => n + 1)
    }

    const prevMatch = () => {
        setActiveOnly((prev) =>
            prev.filter((entry) => entry.match !== String(matchNum))
        )
        setMatchNum((n) => n - 1)
    }

    const statusColor = (status: string) => {
        switch (status) {
            case 'pre':
                return 'bg-yellow-700 text-yellow-100'
            case 'auto':
                return 'bg-blue-700 text-blue-100'
            case 'teleop':
                return 'bg-purple-700 text-purple-100'
            case 'post':
                return 'bg-green-700 text-green-100'
            default:
                return 'bg-zinc-600 text-white'
        }
    }

    const renderTeamStatus = (team: TeamInfo) => {
        const entry = teamStatuses.find(
            (e) => e.match === String(matchNum) && e.team === team.number
        )

        let bg = 'bg-red-700 text-red-100'
        if (entry) {
            if (entry.status === 'submitted') {
                bg = 'bg-green-700 text-green-100'
            } else {
                bg = 'bg-blue-700 text-blue-100'
            }
        }

        return (
            <div
                key={team.number}
                className={`p-3 rounded text-center text-white font-bold ${bg}`}
            >
                {team.number}
            </div>
        )
    }


    useEffect(() => {
        const alliances: ("red" | "blue")[] = ["red", "blue"]

        const info: UIInfo = {
            red: {score: 0, coral: 0, algae: 0},
            blue: {score: 0, coral: 0, algae: 0},
        }

        for (const alliance of alliances) {
            const entries = fullMatchInfo.filter(e => e.alliance === alliance)

            let algae = 0
            let coral = 0

            for (const entry of entries) {
                const phases: ("auto" | "teleop")[] = ["auto", "teleop"]

                for (const phase of phases) {
                    // It works fine, TODO:figure out error
                    const phaseData = entry.data?.[phase]
                    if (!phaseData) continue

                    if (typeof phaseData.barge === "number") {
                        algae += phaseData.barge
                    }

                    if (phaseData.branchPlacement && typeof phaseData.branchPlacement === "object") {
                        for (const branch of Object.values(phaseData.branchPlacement)) {
                            if (branch && typeof branch === "object") {
                                coral += Object.values(branch).filter(Boolean).length
                            }
                        }
                    }

                    if (typeof phaseData.l1 === "number") {
                        coral += phaseData.l1
                    }

                    // ─── Score Calculation ─────────────────────────────────────────────
                    let scoreAdd = 0

                    if (phase === "auto") {
                        // Branch placements
                        for (const branch of Object.values(phaseData.branchPlacement ?? {})) {
                            if (!branch) continue
                            if (branch.l4) scoreAdd += 7
                            if (branch.l3) scoreAdd += 6
                            if (branch.l2) scoreAdd += 4
                        }
                        // Flat placements
                        scoreAdd += (phaseData.l1 ?? 0) * 3
                        scoreAdd += (phaseData.processor ?? 0) * 6
                        scoreAdd += (phaseData.barge ?? 0) * 4
                        if (phaseData.moved) scoreAdd += 3
                    } else {
                        // Teleop scoring
                        for (const branch of Object.values(phaseData.branchPlacement ?? {})) {
                            if (!branch) continue
                            if (branch.l4) scoreAdd += 5
                            if (branch.l3) scoreAdd += 4
                            if (branch.l2) scoreAdd += 3
                            if (branch.l1) scoreAdd += 2
                        }
                        scoreAdd += (phaseData.l1 ?? 0) * 2
                        scoreAdd += (phaseData.processor ?? 0) * 6
                        scoreAdd += (phaseData.barge ?? 0) * 4
                    }

                    // Apply to total alliance score
                    info[alliance].score += scoreAdd

                }
            }

            info[alliance].algae = algae
            info[alliance].coral = coral
        }

        setMatchInfo(info)
    }, [fullMatchInfo])


    const renderfieldoverlay = () => {
        return (
            <div className="font-roboto w-full aspect-[1260/75] relative text-[1em] px-4 select-none">
                <img
                    src={field_overlay}
                    alt="Scoreboard Background"
                    className="w-full h-auto"
                />
                <div className="absolute inset-0 text-white text-sm h-full w-full">
                    {/* Top label */}
                    <div
                        className="absolute top-[1%] left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[1.4cqw]">
                        {(() => {
                            if (matchType === "qm") return `Qualification ${matchNum} of 84`
                            if (matchType === "f") return `Finals ${matchNum}`

                            if (matchType === "sf") {
                                if (matchNum <= 4) return `Upper Bracket – Round 1 – Match ${matchNum}`
                                if (matchNum <= 6) return `Lower Bracket – Round 2 – Match ${matchNum}`
                                if (matchNum <= 8) return `Upper Bracket – Round 2 – Match ${matchNum}`
                                if (matchNum <= 10) return `Lower Bracket – Round 3 – Match ${matchNum}`
                                if (matchNum === 11) return `Lower Bracket – Round 4 – Match 11`
                                if (matchNum === 12) return `Upper Bracket – Round 4 – Match 12`
                                if (matchNum === 13) return `Lower Bracket – Round 5 – Match 13`
                            }

                            return `${matchType} ${matchNum} of 84`
                        })()}
                    </div>

                    {/* Red algae count */}
                    <div
                        className="absolute top-[50%] left-[13.6%] -translate-x-1/2 flex flex-col gap-1 text-center text-[1.6cqw]">
                        <div className="w-8">{matchInfo.red.algae}</div>
                    </div>
                    {/* Red coral count */}
                    <div
                        className="absolute top-[50%] left-[5.8%] -translate-x-1/2 flex flex-col gap-1 text-center text-[1.6cqw]">
                        <div className="w-8">{matchInfo.red.coral}</div>
                    </div>

                    {/* Blue algae count */}
                    <div
                        className="absolute top-[50%] right-[3.5%] -translate-x-1/2 flex flex-col gap-1 text-center text-[1.6cqw]">
                        <div className="w-8">{matchInfo.blue.algae}</div>
                    </div>
                    {/* Blue coral count */}
                    <div
                        className="absolute top-[50%] right-[11.2%] -translate-x-1/2 flex flex-col gap-1 text-center text-[1.6cqw]">
                        <div className="w-8">{matchInfo.blue.coral}</div>
                    </div>

                    {/* Red alliance info */}
                    <div className="absolute top-[57%] left-[32%] -translate-x-1/2 flex gap-2 items-center text-[1cqw]">
                        {matchRed.map(team => (
                            <div key={team.number} className="flex items-center gap-1 pl-2">
                                <img src={team.logo} alt={`Team ${team.number}`}
                                     className="w-[2cqw] h-[2cqw] object-contain"/>
                                <span className="font-mono text-[1cqw] min-w-[4ch] text-center">{team.number}</span>
                            </div>
                        ))}
                    </div>

                    {/* Blue alliance info */}
                    <div
                        className="absolute top-[57%] right-[16.5%] -translate-x-1/2 flex gap-2 items-center text-[1cqw]">
                        {matchBlue.map(team => (
                            <div key={team.number} className="flex items-center gap-1 pl-2">
                                <img src={team.logo} alt={`Team ${team.number}`}
                                     className="w-[2cqw] h-[2cqw] object-contain"/>
                                <span className="font-mono text-[1cqw] min-w-[4ch] text-center">{team.number}</span>
                            </div>
                        ))}
                    </div>


                    {/* Red score */}
                    <div
                        className="absolute top-[35%] left-[43.6%] -translate-x-1/2 flex gap-2 items-center text-[3cqw]">
                        <span className="font-bold ml-2">{matchInfo.red.score}</span>
                    </div>

                    {/* Blue score */}
                    <div
                        className="absolute top-[35%] right-[44.4%] translate-x-1/2 flex gap-2 items-center text-[3cqw]">
                        <span className="font-bold ml-2">{matchInfo.blue.score}</span>
                    </div>
                </div>
            </div>
        )
    }


    return (
        <div className="flex flex-col h-screen bg-zinc-900">
            {/* Scoreboard Header */}
            <div className="p-6">
                {renderfieldoverlay()}
            </div>
            {/* Scrollable Main Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* 3-Column Match Layout */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <h3 className="text-red-400 text-xl font-semibold mb-2">Red Alliance</h3>
                        <div className="space-y-2">
                            {matchRed.map(renderTeamStatus)}
                        </div>
                    </div>
                    <div>
                        <h3 className="text-white text-xl font-semibold mb-2">Active Scouting</h3>
                        {activeOnly.length === 0 ? (
                            <p className="text-zinc-500">No active teams</p>
                        ) : (
                            <div className="grid gap-2">
                                {activeOnly.map(({match, team, status, scouter}) => (
                                    <div
                                        key={`${match}-${team}`}
                                        className="flex flex-col gap-1 p-3 rounded bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 transition"
                                    >
                                        <div className="text-sm text-zinc-400 font-mono">
                                            Match {match} – Team {team}
                                        </div>
                                        <div className="flex justify-between items-center">
                                            {scouter ? (
                                                <Badge className="text-sm text-zinc-300 italic">by {scouter}</Badge>
                                            ) : (
                                                <Badge className="text-sm text-zinc-500">—</Badge>
                                            )}
                                            <Badge className={`text-xs px-2 py-1 rounded ${statusColor(status)}`}>
                                                {status.toUpperCase()}
                                            </Badge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div>
                        <h3 className="text-blue-400 text-xl font-semibold mb-2">Blue Alliance</h3>
                        <div className="space-y-2">
                            {matchBlue.map(renderTeamStatus)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Sticky Bottom Controls */}
            <div className="flex justify-between items-center px-6 py-4 bg-zinc-950 text-white text-lg">
                <button onClick={prevMatch} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded">Prev</button>

                {/* Match Type Dropdown */}
                <Select value={matchType} onValueChange={handleMatchTypeChange}>
                    <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="Select Match Type"/>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="qm">Qualification</SelectItem>
                        <SelectItem value="sf">Semi-Finals</SelectItem>
                        <SelectItem value="f">Finals</SelectItem>
                    </SelectContent>
                </Select>

                {/* Match Number Jump Input */}
                <div className="flex items-center gap-2">
                    <span>Jump to Match:</span>
                    <Input
                        type="text"
                        value={matchNum === 0 ? '' : matchNum} // Display empty string when matchNum is 0
                        onChange={(e) => {
                            const value = e.target.value;
                            const parsedValue = parseInt(value);

                            // Update matchNum if the input is a valid number or empty
                            if (value === '') {
                                setMatchNum(0);  // Treat empty input as 0 internally
                            } else if (!isNaN(parsedValue) && parsedValue >= 1) {
                                setMatchNum(parsedValue);  // Update with a valid number
                            }
                        }}
                        className="w-20 p-2 bg-zinc-800 text-white rounded"
                        min={1}
                    />

                </div>

                <button onClick={nextMatch} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded">Next</button>
            </div>
        </div>
    )
}

