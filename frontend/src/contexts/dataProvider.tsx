import {createContext, useContext, useEffect, useState, type ReactNode} from "react"

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
    move?: number           // optional in teleop
    coral_cycle: number
    algae_cycle: number
    total?: number           // optional in teleop
}


const LargeDataContext = createContext<ScoutingData | null>(null)

const UUID_COOKIE = "scouting_uuid"

function getCookie(name: string): string | null {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
    return match ? match[2] : null
}

export function getAuthHeaders(): HeadersInit {
    const uuid = getCookie(UUID_COOKIE)
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
    }
    if (uuid) headers['x-uuid'] = uuid
    return headers
}


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

    useEffect(() => {
        let cancelled = false

        async function fetchData() {
            try {
                const res = await fetch(`${import.meta.env.VITE_API_URL}/data/processed`, {
                    method: 'GET',
                    headers: {
                        ...getAuthHeaders(),
                        'Content-Type': 'application/json'
                    },
                })

                if (!res.ok) console.error("Large data fetch failed", await res.json())

                const json = await res.json()

                // Attempt to parse json.data if it's a string
                const parsed = typeof json.data === "string" ? JSON.parse(json.data) : json

                if (!cancelled) setData(parsed)
            } catch (err) {
                console.error("Large data fetch failed", err)
            }
        }

        void fetchData()

        return () => {
            cancelled = true
        }
    }, [])


    if (!data) return <div className="p-4 text-center">Loading data...</div>

    return (
        <LargeDataContext.Provider value={data}>
            {children}
        </LargeDataContext.Provider>
    )
}
