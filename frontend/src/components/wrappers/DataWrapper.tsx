import {createContext, useContext, useEffect, useState, useMemo, useRef, useCallback} from "react"
import {Outlet, useLocation} from "react-router-dom"
import {useAPI} from "@/hooks/useAPI.ts"
import {MessageSquare, X} from "lucide-react";

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
    next_match?: string
}

export interface DataContextType {
    processedData: DataSchema | null
    loading: boolean
    refresh: () => Promise<void>

    authSuccess: boolean
    guestName: string | null
    permissions: GuestPermissions | null
    error: { status: number; message: string } | null
}

const DataContext = createContext<DataContextType | undefined>(undefined)

const CACHE_TTL = 60_000
let CACHE: {
    data: DataSchema | null
    guestName: string | null
    permissions: GuestPermissions | null
    timestamp: number
} = {data: null, guestName: null, permissions: null, timestamp: 0}


// Add this component before the DataWrapper export:

function FeedbackToast({onSubmit}: {
    onSubmit: (feedback: string, name?: string) => void
}) {
    const [expanded, setExpanded] = useState(false)
    const [name, setName] = useState("")
    const [feedback, setFeedback] = useState("")
    const [submitted, setSubmitted] = useState(false)
    const [dismissed, setDismissed] = useState(false)

    if (dismissed) return null

    if (submitted) {
        return (
            <div
                className="fixed bottom-4 right-4 z-500 bg-green-600 text-purple-100 text-sm px-4 py-2 rounded-lg shadow-lg animate-fade-in">
                Thanks for your feedback!
            </div>
        )
    }

    if (!expanded) {
        return (
            <div
                className="fixed bottom-4 right-4 z-500 flex items-center gap-2 bg-purple-900/90 border border-purple-700 text-purple-100 text-sm px-4 py-3 rounded-lg shadow-lg animate-fade-in cursor-pointer backdrop-blur-sm"
                onClick={() => setExpanded(true)}>
                <MessageSquare className="w-4 h-4 text-purple-400"/>
                <span>Have feedback on the data?</span>
                <button
                    className="ml-2 text-purple-400 hover:text-purple-100"
                    onClick={(e) => {
                        e.stopPropagation();
                        setDismissed(true)
                    }}
                >
                    <X className="w-4 h-4"/>
                </button>
            </div>
        )
    }

    return (
        <div
            className="fixed bottom-4 right-4 z-500 bg-purple-950/95 border border-purple-700 text-purple-100 text-sm rounded-lg shadow-lg animate-fade-in w-80 p-4 flex flex-col gap-3 backdrop-blur-sm">
            <div className="flex justify-between items-center">
                <span className="font-medium text-purple-200">Feedback & Suggestions</span>
                <button className="text-purple-400 hover:text-purple-100" onClick={() => setDismissed(true)}>
                    <X className="w-4 h-4"/>
                </button>
            </div>
            <input
                className="w-full bg-purple-900/40 border border-purple-800 rounded-md px-3 py-2 text-sm text-purple-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                placeholder="Name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
            />
            <textarea
                className="w-full bg-purple-900/40 border border-purple-800 rounded-md px-3 py-2 text-sm text-purple-200 resize-none focus:outline-none focus:ring-1 focus:ring-purple-500"
                rows={3}
                placeholder="What could be improved?"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
            />
            <button
                className="bg-purple-700 hover:bg-purple-600 disabled:opacity-40 rounded-md px-3 py-2 text-sm font-semibold text-white transition"
                disabled={!feedback.trim()}
                onClick={() => {
                    onSubmit(feedback.trim(), name.trim() || undefined)
                    setSubmitted(true)
                    setTimeout(() => setDismissed(true), 2000)
                }}
            >
                Submit
            </button>
        </div>
    )
}

function DataWrapper() {
    const {getProcessedData, postDataFeedback} = useAPI()
    const location = useLocation();

    const [showFeedback, setShowFeedback] = useState(false)
    const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const navCountRef = useRef(0)
    const timeReachedRef = useRef(false)
    const navReachedRef = useRef(false)

    const hideLoad = location.pathname.startsWith("/data/guest") || location.pathname.startsWith("/guest");

    const [state, setState] = useState<DataContextType>({
        processedData: null,
        loading: false,
        refresh: async () => {
        },
        authSuccess: false,
        guestName: null,
        permissions: null,
        error: null
    })

    // Track navigation count
    useEffect(() => {
        if (!state.authSuccess) return
        navCountRef.current += 1
        if (navCountRef.current >= 3) {
            navReachedRef.current = true
            if (timeReachedRef.current) setShowFeedback(true)
        }
    }, [location.pathname, state.authSuccess])

// 5 minute timer
    useEffect(() => {
        if (!state.authSuccess) return
        if (feedbackTimerRef.current) return
        feedbackTimerRef.current = setTimeout(() => {
            timeReachedRef.current = true
            if (navReachedRef.current) setShowFeedback(true)
        }, 5 * 60 * 1000)
        return () => {
            if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
        }
    }, [state.authSuccess])


    const handleFeedback = useCallback(async (feedback: string, name?: string) => {
        await postDataFeedback(feedback, state.guestName ?? "", name)
    }, [state.guestName])

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
                error: null
            })

        } catch (err: any) {
            console.error("DataWrapper fetch error:", err)
            const status = err?.status ?? err?.response?.status ?? 0
            const message =
                status === 401 || status === 403 ? "Authentication failed" :
                    status === 404 ? "Event data not found" :
                        status >= 500 ? "Server error" :
                            "Failed to load event data"

            setState((s) => ({
                ...s,
                loading: false,
                authSuccess: false,
                permissions: null,
                error: {status, message},
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
                        <div
                            className="flex h-screen w-screen items-center justify-center flex-col gap-4 text-gray-500 text-sm">
                            <div>Loading event data…</div>
                        </div>
                    ) : !state.authSuccess || !state.processedData ? (
                        <div
                            className="flex h-screen w-screen items-center justify-center flex-col gap-4 text-gray-500 text-sm">
                            <div>Failed to load event data.</div>
                            {state.error && (
                                <div className="text-xs text-gray-400">
                                    Error {state.error.status}: {state.error.message}
                                </div>
                            )}
                            {state.error && (state.error.status === 401 || state.error.status === 403) &&
                                !localStorage.getItem("guest_pw_token") && (
                                    <div className="text-xs text-gray-400 max-w-md text-center">
                                        No guest token found. Please visit{" "}
                                        <a href="/guest" className="text-blue-500 underline">/guest</a> to authenticate.
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
            {showFeedback && state.permissions?.team?.length && (
                <FeedbackToast
                    onSubmit={handleFeedback}
                />
            )}
        </DataContext.Provider>
    );
}

export default DataWrapper

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
    if (!data) {
        return null
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

export function useNextMatchID(): string | null {
    return useDataContext().processedData?.next_match ?? null
}