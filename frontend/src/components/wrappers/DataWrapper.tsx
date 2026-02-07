import {createContext, useContext, useEffect, useState, useMemo} from "react"
import {Outlet, useLocation} from "react-router-dom"
import {useAPI} from "@/hooks/useAPI.ts"


export interface RankingData {
    [key: string]: any
}

export interface TeamData {
    basic: TeamBasic
    ranking: TeamRanking
    metrics: Record<string, string | number | boolean>
    matches: TeamMatchRow[]
    rp: Record<string, TeamRPMatchData>
    timeline: TeamTimelineRow[]
    breakdown: TeamBreakdownNode
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