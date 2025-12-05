import type {AllianceType, MatchType} from "@/types"

export type MatchScoutingData = {
    match: number | null
    match_type: MatchType
    alliance: AllianceType
    teamNumber: number | null
    scouter: string | null

    auto: {

    }

    teleop: {

    }

    postmatch: {
        skill: number
        defenseSkill: number
        climbSpeed: number
        climbSuccess: boolean
        offense: boolean
        defense: boolean
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
        match: null,
        match_type: null,
        alliance: null,
        teamNumber: null,
        auto: {
        },
        teleop: {
        },
        postmatch: {
            skill: 0,
            defenseSkill: 0,
            climbSpeed: 0,
            climbSuccess: false,
            offense: false,
            defense: false,
            faults: {system: false, idle: false, other: false},
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