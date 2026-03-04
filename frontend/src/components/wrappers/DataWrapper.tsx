import {createContext, useContext, useEffect, useState, useMemo} from "react"
import {Outlet, useLocation} from "react-router-dom"
import {useAPI} from "@/hooks/useAPI.ts"


export interface RankingData {
    [key: string]: any
}

export interface TeamShotData {
    x1: number
    y1: number
    x2: number
    y2: number
    fuelShot: number
    fuelScored: number
}

export interface TeamData {
    basic: TeamBasic
    ranking: TeamRanking
    metrics: Record<string, string | number | boolean>
    matches: TeamMatchRow[]
    rp: Record<string, TeamRPMatchData>
    timeline: TeamTimelineRow[]
    breakdown: TeamBreakdownNode
    shots?: TeamShotData[]
    fuel?: Record<string, any>
}

export interface TeamBasic {
    tags: string[]
}

export interface TeamRanking {
    auto: number
    teleop: number
    endgame: number
    rp: number
    rp_pred: number
    rp_avg: number
    rp_avg_pred: number
}

export interface TeamMatchRow {
    match: string | number
    own_alliance: number[]
    opp_alliance: number[]

    [key: string]: string | number | boolean | number[] | null
}

export type TeamRPMatchData = Record<
    string,
    boolean | number | string | Record<string, any>
>

export interface TeamTimelineRow {
    match: string | number

    [scoringKey: string]: number | string
}

export type TeamBreakdownNode = {
    id: string
    label: string
    value?: number
    sumValue?: number
    children?: TeamBreakdownNode[]
}


export interface MatchData {
    [key: string]: any
}

export interface AllianceData {
    [key: string]: any
}

// NEW permissions type
export interface GuestPermissions {
    ranking: boolean
    alliance: boolean
    match: string[]
    team: string[]
}

export interface DataSchema {
    ranking: RankingData
    team: Record<number, TeamData>
    match: Record<string, MatchData>
    Alliance: AllianceData
    issues?: string[]
    match_completed?: Record<string, boolean>
    // New fields
    sb?: any[]
    tba?: any[]
    match_reverse_index?: Record<string, string>
}

// ---------------------------------------------------------------------------
// Transform raw event data (sb/tba format) into DataSchema with TeamData
// ---------------------------------------------------------------------------
function transformEventData(raw: any): DataSchema {
    const sb: any[] = raw.sb ?? []
    const tba: any[] = raw.tba ?? []
    const teamRaw: Record<string, any> = raw.team ?? {}
    const rankingRaw: Record<string, any> = raw.ranking ?? {}
    const teamFuelRaw: Record<string, any> = raw.team_fuel ?? {}
    const matchReverseIndex: Record<string, string> = raw.match_reverse_index ?? {}

    // Collect all team numbers from matches
    const allTeams = new Set<number>()
    for (const m of sb) {
        for (const t of (m.alliances?.red?.team_keys ?? [])) allTeams.add(t)
        for (const t of (m.alliances?.blue?.team_keys ?? [])) allTeams.add(t)
    }

    const completedMatches = sb.filter((m: any) => m.status === 'Completed' && m.result)

    // Accumulate per-team alliance-level stats from qual matches for ranking
    const teamStats: Record<number, { autoSum: number; teleopSum: number; endgameSum: number; scoreSum: number; qualCount: number }> = {}
    for (const t of allTeams) {
        teamStats[t] = {autoSum: 0, teleopSum: 0, endgameSum: 0, scoreSum: 0, qualCount: 0}
    }
    for (const m of completedMatches) {
        if (m.elim) continue
        for (const color of ['red', 'blue']) {
            const teams: number[] = m.alliances?.[color]?.team_keys ?? []
            const r = m.result
            for (const t of teams) {
                if (!teamStats[t]) continue
                teamStats[t].autoSum += (r[`${color}_auto_points`] ?? 0)
                teamStats[t].teleopSum += (r[`${color}_teleop_points`] ?? 0)
                teamStats[t].endgameSum += (r[`${color}_endgame_points`] ?? 0)
                teamStats[t].scoreSum += (r[`${color}_score`] ?? 0)
                teamStats[t].qualCount++
            }
        }
    }

    // Compute sorted lists for ranking
    const teamList = Array.from(allTeams)
    const avg = (t: number, field: 'autoSum' | 'teleopSum' | 'endgameSum' | 'scoreSum') =>
        teamStats[t].qualCount ? teamStats[t][field] / teamStats[t].qualCount : 0
    const rpVal = (t: number): number => rankingRaw.rp?.[String(t)] ?? 0

    const sortedByAuto = [...teamList].sort((a, b) => avg(b, 'autoSum') - avg(a, 'autoSum'))
    const sortedByTeleop = [...teamList].sort((a, b) => avg(b, 'teleopSum') - avg(a, 'teleopSum'))
    const sortedByEndgame = [...teamList].sort((a, b) => avg(b, 'endgameSum') - avg(a, 'endgameSum'))
    const sortedByRp = [...teamList].sort((a, b) => rpVal(b) - rpVal(a))

    const teamData: Record<number, TeamData> = {}
    for (const teamNum of allTeams) {
        const teamMatches = completedMatches
            .filter((m: any) =>
                m.alliances?.red?.team_keys?.includes(teamNum) ||
                m.alliances?.blue?.team_keys?.includes(teamNum)
            )
            .sort((a: any, b: any) => (a.time ?? 0) - (b.time ?? 0))

        const shortKey = (m: any): string => matchReverseIndex[m.key] ?? m.match_name ?? m.key

        // Build matches array
        const matches: TeamMatchRow[] = teamMatches.map((m: any) => {
            const isRed = m.alliances?.red?.team_keys?.includes(teamNum)
            const own = isRed ? 'red' : 'blue'
            const opp = isRed ? 'blue' : 'red'
            const r = m.result
            const ownScore = r[`${own}_score`] ?? 0
            const oppScore = r[`${opp}_score`] ?? 0
            return {
                match: shortKey(m),
                own_alliance: m.alliances[own].team_keys,
                opp_alliance: m.alliances[opp].team_keys,
                result: r.winner === own ? 'W' : (ownScore === oppScore ? 'T' : 'L'),
                score: ownScore,
                opp_score: oppScore,
                auto: r[`${own}_auto_points`] ?? 0,
                teleop: r[`${own}_teleop_points`] ?? 0,
                endgame: r[`${own}_endgame_points`] ?? 0,
            }
        })

        // Qual-only matches for metrics
        const qualMatches = matches.filter(m => String(m.match).startsWith('qm'))
        const n = qualMatches.length || 1

        const metrics: Record<string, number | string> = {
            'Avg Score': +(qualMatches.reduce((s, m) => s + (m.score as number), 0) / n).toFixed(1),
            'Avg Auto': +(qualMatches.reduce((s, m) => s + (m.auto as number), 0) / n).toFixed(1),
            'Avg Teleop': +(qualMatches.reduce((s, m) => s + (m.teleop as number), 0) / n).toFixed(1),
            'Avg Endgame': +(qualMatches.reduce((s, m) => s + (m.endgame as number), 0) / n).toFixed(1),
            'Win Rate': `${(qualMatches.filter(m => m.result === 'W').length / n * 100).toFixed(0)}%`,
            'Qual Matches': qualMatches.length,
        }

        // Per-match RP data
        const rp: Record<string, TeamRPMatchData> = {}
        for (const m of teamMatches) {
            const isRed = m.alliances?.red?.team_keys?.includes(teamNum)
            const own = isRed ? 'red' : 'blue'
            const r = m.result
            rp[shortKey(m)] = {
                energized: r[`${own}_energized_rp`] ?? r[`${own}_rp_1`] ?? false,
                supercharged: r[`${own}_supercharged_rp`] ?? r[`${own}_rp_2`] ?? false,
                win: r.winner === own,
            }
        }

        // Scoring timeline
        const timeline: TeamTimelineRow[] = matches.map(m => ({
            match: m.match as string,
            auto: m.auto as number,
            teleop: m.teleop as number,
            endgame: m.endgame as number,
        }))

        // Score breakdown tree
        const breakdown: TeamBreakdownNode = {
            id: 'total',
            label: 'Total Score',
            children: [
                {id: 'auto', label: 'Auto', value: +(metrics['Avg Auto'] ?? 0)},
                {id: 'teleop', label: 'Teleop', value: +(metrics['Avg Teleop'] ?? 0)},
                {id: 'endgame', label: 'Endgame', value: +(metrics['Avg Endgame'] ?? 0)},
            ],
        }

        // Team ranking
        const rpTotalVal = rpVal(teamNum)
        const qualCount = teamStats[teamNum].qualCount || 1
        const ranking: TeamRanking = {
            auto: sortedByAuto.indexOf(teamNum) + 1,
            teleop: sortedByTeleop.indexOf(teamNum) + 1,
            endgame: sortedByEndgame.indexOf(teamNum) + 1,
            rp: sortedByRp.indexOf(teamNum) + 1,
            rp_pred: 0,
            rp_avg: +(rpTotalVal / qualCount).toFixed(2),
            rp_avg_pred: 0,
        }

        teamData[teamNum] = {
            basic: {tags: []},
            ranking,
            metrics,
            matches,
            rp,
            timeline,
            breakdown,
            shots: teamRaw[String(teamNum)]?.shots ?? [],
            fuel: teamFuelRaw[String(teamNum)] ?? teamRaw[String(teamNum)]?.fuel,
        }
    }

    return {
        ranking: rankingRaw,
        team: teamData,
        match: raw.match ?? {},
        Alliance: raw.alliance ?? {},
        sb,
        tba,
        match_reverse_index: matchReverseIndex
    }
}

export interface DataContextType {
    processedData: DataSchema | null
    loading: boolean
    refresh: () => Promise<void>

    authSuccess: boolean
    guestName: string | null
    permissions: GuestPermissions | null
}

const DataContext = createContext<DataContextType | undefined>(undefined)

const CACHE_TTL = 60_000
let CACHE: {
    data: DataSchema | null
    guestName: string | null
    permissions: GuestPermissions | null
    timestamp: number
} = {data: null, guestName: null, permissions: null, timestamp: 0}

export default function DataWrapper() {
    const {getProcessedData} = useAPI()
    const location = useLocation();

    const hideLoad = location.pathname.startsWith("/data/guest") || location.pathname.startsWith("/guest");

    const [state, setState] = useState<DataContextType>({
        processedData: null,
        loading: false,
        refresh: async () => {
        },
        authSuccess: false,
        guestName: null,
        permissions: null,
    })

    async function loadAll(tokenOverride?: string) {
        setState(s => ({...s, loading: true}))

        try {
            // IMPROVEMENT: Try admin auth first (uses UUID cookie), then guest token
            let token = tokenOverride ?? localStorage.getItem("guest_pw_token") ?? ""

            // Try to fetch data - getProcessedData will use admin UUID if available,
            // otherwise fall back to guest token
            const result = await getProcessedData(token || null)


            // Check if we got data back
            if (!result) {

                // Only show auth failure if we're not on the guest login page
                if (!hideLoad) {
                    setState((s) => ({
                        ...s,
                        loading: false,
                        authSuccess: false,
                        processedData: null,
                        guestName: null,
                        permissions: null,
                    }))
                } else {
                    // On guest page, just stop loading
                    setState((s) => ({
                        ...s,
                        loading: false,
                    }))
                }
                return
            }

            // Extract data from response
            let processed: DataSchema | null = null
            let guestName: string | null = null
            let permissions: GuestPermissions | null = null

            // Check if response has nested structure (raw_data, guest_name, permissions)
            // OR if it's the direct data structure
            if ('raw_data' in result) {
                // Nested structure
                processed = result.raw_data ?? null
                guestName = result.guest_name ?? null
                permissions = result.permissions ?? null
            } else if ('team' in result || 'ranking' in result || 'match' in result) {
                // Direct structure - the API returned the data directly
                processed = result as DataSchema
                guestName = null
                permissions = null
            } else {
                console.error(' DataWrapper: Unknown response structure:', Object.keys(result))
            }

            if (!processed) {
                setState((s) => ({
                    ...s,
                    loading: false,
                    authSuccess: false,
                    processedData: null,
                    guestName: null,
                    permissions: null,
                }))
                return
            }

            // Transform raw event data (sb/tba format) if needed
            if ('sb' in (processed as any)) {
                processed = transformEventData(processed)
            }

            // Normal success
            CACHE = {
                data: processed,
                guestName,
                permissions,
                timestamp: Date.now(),
            }

            setState({
                processedData: processed,
                loading: false,
                refresh: loadAll,
                authSuccess: true,
                guestName,
                permissions,
            })

        } catch (err) {
            console.error("DataWrapper fetch error:", err)

            setState((s) => ({
                ...s,
                loading: false,
                authSuccess: false,
                permissions: null,
            }))
        }
    }


    useEffect(() => {
        const cachedValid = CACHE.data && Date.now() - CACHE.timestamp < CACHE_TTL

        if (cachedValid) {
            setState((s) => ({
                ...s,
                processedData: CACHE.data,
                guestName: CACHE.guestName,
                permissions: CACHE.permissions,
                authSuccess: true,
            }))
        } else {
            void loadAll()
        }
    }, [])

    const value = useMemo(
        () => ({...state, refresh: loadAll}),
        [state]
    )

    const issues = state.processedData?.issues ?? []

    return (
        <DataContext.Provider value={value}>
            {/* NEW: If on admin/data/guest → NEVER block UI with loading */}
            {hideLoad ? (
                <>
                    <Outlet/>
                    {issues.length > 0 && (
                        <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
                            {issues.map((msg, i) => (
                                <div
                                    key={i}
                                    className="bg-red-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg animate-fade-in"
                                >
                                    {msg}
                                </div>
                            ))}
                        </div>
                    )}
                </>
            ) : (
                // Old behavior for normal pages
                <>
                    {state.loading && !state.processedData ? (
                        <div className="flex h-screen w-screen items-center justify-center flex-col gap-4 text-gray-500 text-sm">
                            <div>Loading event data…</div>
                            {!localStorage.getItem("guest_pw_token") && (
                                <div className="text-xs text-gray-400 max-w-md text-center">
                                    No guest token found. Please visit <a href="/guest" className="text-blue-500 underline">/guest</a> to authenticate.
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <Outlet/>
                            {issues.length > 0 && (
                                <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
                                    {issues.map((msg, i) => (
                                        <div
                                            key={i}
                                            className="bg-red-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg animate-fade-in"
                                        >
                                            {msg}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </DataContext.Provider>
    );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useDataContext() {
    const ctx = useContext(DataContext)
    if (!ctx) throw new Error("useDataContext must be used inside <DataWrapper>")
    return ctx
}

export function useRankingData(): RankingData | null {
    return useDataContext().processedData?.ranking ?? null
}

export function useTeamData(teamNumber: number): TeamData | null {
    const data = useDataContext().processedData?.team?.[teamNumber] ?? null
    if (!data) { return null
    }
    return data
}

export function useMatchData(matchId: string): MatchData | null {
    return useDataContext().processedData?.match?.[matchId] ?? null
}

export function useAllianceData(): AllianceData | null {
    return useDataContext().processedData?.Alliance ?? null
}

export function useAuthSuccess(): boolean {
    return useDataContext().authSuccess
}

export function useGuestName(): string | null {
    return useDataContext().guestName
}

export function usePermissions(): GuestPermissions | null {
    return useDataContext().permissions
}

export function useLoading(): boolean {
    return useDataContext().loading
}

export function useMatchCompleted(shortKey: string): boolean | null {
    const { processedData } = useDataContext()

    // Check match_completed dict from calculator output
    if (processedData?.match_completed) {
        return processedData.match_completed[shortKey] ?? false
    }

    // Fallback: check sb entries
    const sb = processedData?.sb
    const reverseIndex = processedData?.match_reverse_index
    if (!sb || !reverseIndex) return null
    const entry = sb.find(
        (m: any) => (reverseIndex[m.key] ?? m.match_name ?? m.key) === shortKey
    )
    if (!entry) return false
    return entry.status === 'Completed'
}