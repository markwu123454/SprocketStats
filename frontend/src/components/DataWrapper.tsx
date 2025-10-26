// src/context/DataContext.tsx
import React, { createContext, useContext, useEffect, useState, useMemo } from "react"
import { Outlet } from "react-router-dom"
import { useAPI } from "@/hooks/useAPI.ts"

export interface RankingData { [key: string]: any }
export interface TeamData { [key: string]: any }
export interface MatchData { [key: string]: any }
export interface AllianceData { [key: string]: any }

export interface DataSchema {
    ranking: RankingData
    team: Record<number, TeamData>
    match: Record<string, MatchData>
    Alliance: AllianceData
}

export interface DataContextType {
    processedData: DataSchema | null
    loading: boolean
    refresh: () => Promise<void>
}

const DataContext = createContext<DataContextType | undefined>(undefined)
const CACHE_TTL = 60_000
let CACHE: { data: DataSchema | null; timestamp: number } = { data: null, timestamp: 0 }

// ============================================================
// Provider
// ============================================================
export function DataWrapper() {
    const { getProcessedData } = useAPI()
    const [state, setState] = useState<DataContextType>({
        processedData: null,
        loading: false,
        refresh: async () => {},
    })

    async function loadAll() {
        setState((s) => ({ ...s, loading: true }))
        try {
            const data = await getProcessedData()
            if (data) {
                CACHE = { data, timestamp: Date.now() }
            }
            setState({
                processedData: data,
                loading: false,
                refresh: loadAll,
            })
        } catch (err) {
            console.error("DataWrapper fetch error:", err)
            setState((s) => ({ ...s, loading: false }))
        }
    }

    useEffect(() => {
        const cachedValid = CACHE.data && Date.now() - CACHE.timestamp < CACHE_TTL
        if (cachedValid) {
            setState((s) => ({ ...s, processedData: CACHE.data }))
        } else {
            void loadAll()
        }
    }, [])

    const value = useMemo(() => ({ ...state, refresh: loadAll }), [state])

    return (
        <DataContext.Provider value={value}>
            {state.loading && !state.processedData ? (
                <div className="flex h-screen w-screen items-center justify-center text-gray-500 text-sm">
                    Loading event data…
                </div>
            ) : (
                <Outlet />
            )}
        </DataContext.Provider>
    )
}

// ============================================================
// Hook + Selectors
// ============================================================
export function useDataContext() {
    const ctx = useContext(DataContext)
    if (!ctx) throw new Error("useDataContext must be used inside <DataWrapper>")
    return ctx
}

// --- Selectors ---
export function useRankingData(): RankingData | null {
    const { processedData } = useDataContext()
    return processedData?.ranking ?? null
}

export function useTeamData(teamNumber: number): TeamData | null {
    const { processedData } = useDataContext()
    return processedData?.team?.[teamNumber] ?? null
}

export function useMatchData(matchId: string): MatchData | null {
    const { processedData } = useDataContext()
    return processedData?.match?.[matchId] ?? null
}

export function useAllianceData(): AllianceData | null {
    const { processedData } = useDataContext()
    return processedData?.Alliance ?? null
}
