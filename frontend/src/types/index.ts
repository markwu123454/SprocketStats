export type {
  MatchScoutingData,
  PitScoutingData,
  UIInfo,
} from "@/components/seasons/2025/yearConfig"

export type TeamMetricSummary = {
    label: string
    summary: number
    reliability: number
    unit: string
}

export type TeamCapability = {
    label: string
    enabled: string
}

export type TeamRankingInfo = {
    label: string
    rank?: number
    percentile?: number
}

export type TeamMatchRecord = {
    match: string
    result: string
    score: number
    pred_ai: number
    pred_heur: number
    pred_elo: number
    teammates: [number, number, number]
    opponents: [number, number, number]
}

export type TeamEloPerField = {
    elo: number
    expectedPoints: number
    stdDev: number
    matches: number
}

export type TeamDetail = {
    rank: number
    logoUrl: string
    nickname: string
    metrics: Record<string, number>
    scoring: Record<string, number>
    elo?: Record<string, TeamEloPerField> // TODO:Remove
    summary: TeamMetricSummary[]
    capabilities: TeamCapability[]
    rankings: TeamRankingInfo[]
    matches: TeamMatchRecord[]
}

export type AlliancePerformance = {
    teams: [number, number, number]
    AIPredictedScore: number
    HeuristicPredictedScore: number
    actualScore: number
    calculatedScore: number
    teamData: Record<number, TeamDetail>
}

export type MatchAllianceData = {
    scheduledTime: number
    red: AlliancePerformance
    blue: AlliancePerformance
}

export type MatchMetaData = {
    averageExpectedPoints: Record<string, number>
    averageElo: Record<string, number>
    eloToPointScale?: number
    matchCount: number
}

export type MatchType = 'qm' | 'sf' | 'f' | null
export type AllianceType = 'red' | 'blue' | null

// TODO: maybe merge phase and scouting status?
export type Phase = 'pre' | 'auto' | 'teleop' | 'post'

export type ScoutingStatus = 'pre' | 'auto' | 'teleop' | 'post' | 'offline' | 'completed' | 'submitted'

export type TeamInfo = {
    number: number
    name: string
    logo: string
}
