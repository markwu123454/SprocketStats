import {createContext, useContext, useEffect, useState, type ReactNode} from "react"
import {useAPI} from "@/hooks/useAPI"   // <-- use your existing API hook

export type ScoutingData = {
    team_data: {
        [teamNumber: number]: {
            match: [string, number][]
            elo: {
                team: number
                auto: number
                teleop_coral: number
                teleop_algae: number
                climb: number
                defense: number
            }
            ai_stats: {
                auto: number
                teleop_coral: number
                teleop_algae: number
                climb: number
                defense: number
                cluster: number
            }
            ranking: {
                auto: number
                teleop_coral: number
                teleop_algae: number
                climb: number
                overall: number
            }
            ranking_pct: {
                auto: number
                teleop_coral: number
                teleop_algae: number
                climb: number
                overall: number
            }
        }
        _cluster_summary: {
            [clusterId: number]: {
                auto: number
                teleop_coral: number
                teleop_algae: number
                climb: number
                defense: number
            }
        }
    }

    match_data: {
        [matchType: string]: {
            [matchNum: number]: {
                blue: AllianceData
                red: AllianceData
            }
        }
    }
}

type AllianceData = {
    [teamNumber: number]: {
        teleop_scoring_location: {
            l1: {
                accuracy: number
                total_attempt: number
            }
        }
        score_breakdown: {
            auto: ScoringBreakdown
            teleop: ScoringBreakdown
            climb: number
            total: number
        }
        score_actions: {
            auto: ScoringActions
            teleop: ScoringActions
            climb: number
        }
    }
}

type ScoringBreakdown = {
    l4: number
    l3: number
    l2: number
    l1: number
    barge: number
    processor: number
    move: number
    coral: number
    algae: number
    total: number
}

type ScoringActions = {
    l4: number
    l3: number
    l2: number
    l1: number
    barge: number
    processor: number
    move?: number
    coral_cycle: number
    algae_cycle: number
    total?: number
}


const LargeDataContext = createContext<ScoutingData | null>(null)

export function useLargeData(): ScoutingData {
    const data = useContext(LargeDataContext)
    if (!data) throw new Error("useLargeData must be used inside LargeDataWrapper")
    return data
}

interface LargeDataWrapperProps {
    children: ReactNode
}

export function LargeDataWrapper({children}: LargeDataWrapperProps) {
    const [data, setData] = useState<ScoutingData | null>(null)
    const {getProcessedData} = useAPI() // use centralized API

    useEffect(() => {
        let cancelled = false

        async function loadData() {
            const processed = await getProcessedData()
            if (!cancelled && processed) {
                // Parse JSONB data field if it’s stored as string in backend
                const parsed = typeof processed === "string" ? JSON.parse(processed) : processed
                setData(parsed as ScoutingData)
            }
        }

        void loadData()
        return () => {
            cancelled = true
        }
    }, [getProcessedData])

    if (!data) return <div className="p-4 text-center">Loading data...</div>

    return (
        <LargeDataContext.Provider value={data}>
            {children}
        </LargeDataContext.Provider>
    )
}
