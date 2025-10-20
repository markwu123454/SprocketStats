import type {MatchScoutingData, PitScoutingData} from '@/types'

export type MatchPointer = {
    match_type: "qm" | "sf" | "f"
    match: number
}

export type AccuracyMetrics = {
    l1: number
    l2: number
    l3: number
    l4: number
    algae: number
}

export type MatchDetailPerTeam = {

}

export type Branches = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L"

export type AutoRoute = {
    coral: Record<Branches, { l2: boolean; l3: boolean; l4: boolean }>
    l1: number
    barge: number
    processor: number
    l4_accuracy: number
    l3_accuracy: number
    l2_accuracy: number
    l1_accuracy: number
    barge_accuracy: number
    consistency: number
    use_CD_station: boolean
    use_KL_station: boolean
    start_pos: number
    routine_usage: number
}

export type TeamAggregate = {
    matches: MatchPointer[]
    nickname: string
    icon: string
    scoring: {
        auto: {
            accuracy: AccuracyMetrics
        }
        teleop: {
            accuracy: AccuracyMetrics
        }
        endgame: {

        }
        misc: {
            autos: AutoRoute[]
        }
    }

}

export type MatchAggregate = {
    teams: {
        red: [number, number, number]
        blue: [number, number, number]
    }
    red_point: number
    blue_point: number
    red_ai_point: number
    blue_ai_point: number
    ai_confidence: number
    red_heur_point: number
    blue_heur_point: number
    heur_confidence: number
    red_rp: number
    blue_rp: number
    details: Record<number, MatchDetailPerTeam>
}


export type TeamDataMap = Map<number, TeamAggregate>
export type MatchDataMap = Map<"qm" | "sf" | "f", Map<number, MatchAggregate>>

export type RawData = {
    matchScouting: MatchScoutingData[]
    pitScouting: PitScoutingData[]
}