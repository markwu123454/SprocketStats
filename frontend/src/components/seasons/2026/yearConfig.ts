import type {AllianceType, MatchType} from "@/types"

export type Shots = {
    x1: number
    y1: number
    x2: number
    y2: number
    fuelShot: number
    fuelScored: number
}

export type MatchScoutingData = {
    match_type: MatchType
    match: number | null
    alliance: AllianceType
    teamNumber: number | null
    manualTeam: boolean
    scouter: string | null

    auto: {
        shootLocation: Shots[]
        climb: "none" | "attempted" | "climb"
    }

    teleop: {
        shootLocation: Shots[]
        bumpL: number
        trenchL: number
        bumpR: number
        trenchR: number
    }

    postmatch: {
        climb: "none" | "attempted" | "low" | "mid" | "high"
        climbSpeed: number
        climbSuccess: boolean
        offense: boolean
        defense: boolean
        skill: number
        defenseSkill: number
        faults: {
            system: boolean
            idle: boolean
            other: boolean
        }
        notes: string
    }
}

export const createDefaultScoutingData = (): Omit<MatchScoutingData, "scouter"> => {
    return {
        match_type: null,
        match: null,
        alliance: null,
        teamNumber: null,
        manualTeam: false,

        auto: {
            shootLocation: [],
            climb: "none",
        },

        teleop: {
            shootLocation: [],
            bumpL: 0,
            trenchL: 0,
            bumpR: 0,
            trenchR: 0,
        },

        postmatch: {
            climb: "none",
            climbSpeed: 0,
            climbSuccess: false,
            offense: false,
            defense: false,
            skill: 0,
            defenseSkill: 0,
            faults: {
                system: false,
                idle: false,
                other: false,
            },
            notes: "",
        },
    }
}


export const pitQuestions = [
    {section: "Robot Info"},

    {key: "camera", label: "Robot Photos", type: "camera"},

    {key: "drivebase", label: "Drivebase Type", placeholder: "e.g. Swerve, Tank", type: "text"},

    {section: "Mechanism & Manipulation"},

    {section: "Strategy & Function"},

    {
        key: "role",
        label: "Defense or Offense",
        type: "select",
        options: ["Defense", "Offense", "Both"],
    },
    {
        key: "autonStart",
        label: "Auton start location",
        type: "select",
        options: ["Center Field", "Processor Side", "Opposite Side"],
    },
    {key: "climb", label: "Climb or Endgame capability", type: "text", placeholder: "e.g. Can hang on mid bar"},

    {section: "Programming"},

    {section: "Misc"},

    {key: "comments", label: "Robot name", type: "text", placeholder: "e.g. Nautilus"},
]