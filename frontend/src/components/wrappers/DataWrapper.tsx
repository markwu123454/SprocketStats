import {createContext, useContext, useEffect, useState, useMemo} from "react"
import {Outlet, useLocation} from "react-router-dom"
import {useAPI} from "@/hooks/useAPI.ts"


export interface RankingData {
    [key: string]: any
}

export interface TeamData {
    [key: string]: any
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

    const isGuestAdminPage = location.pathname.startsWith("/admin/data/guest");

    const [state, setState] = useState<DataContextType>({
        processedData: null,
        loading: false,
        refresh: async () => {
        },
        authSuccess: false,
        guestName: null,
        permissions: null,
    })

    async function loadAll() {
        setState((s) => ({...s, loading: true}))

        try {
            const token = localStorage.getItem("guest_pw_token") ?? ""
            const result = await getProcessedData(token)

            const processed = result?.raw_data ?? null
            const guestName = result?.guest_name ?? null
            const permissions = result?.permissions ?? null

            // NEW: treat null as auth failure
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
            {isGuestAdminPage ? (
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
                        <div className="flex h-screen w-screen items-center justify-center text-gray-500 text-sm">
                            Loading event data…
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
    return useDataContext().processedData?.team?.[teamNumber] ?? null
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