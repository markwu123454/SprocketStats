export type {
  MatchScoutingData,
} from "@/components/seasons/2026/yearConfig"

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
