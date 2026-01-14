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
{
        key: "robotSpeed",
        label: "Robot Speed",
        type: "text",
        placeholder: "eg. Slow, Fast"
    },
{
        key: "driverSkill",
        label: "Driver Skill",
        type: "text",
        placeholder: "eg. Experienced, Amateur"
    },
    {section: "Mechanism & Manipulation"},
    {
        key: "fuelCapability",
        label: "Amount of fuel that can be held at once",
        type: "text",
        placeholder: "eg. 8, 10, ∞"
    },
{
        key: "intake",
        label: "Robot Intake Location",
        type: "select",
        options: ["Depo", "Outpost", "Neutral Zone"],
    },
{
        key: "intakeType",
        label: "Intake Type",
        type: "select",
        options: ["Under Bumper", "Between Bumper", "Over Bumper", "Outpost"],
    },
    {section: "Strategy & Function"},

    {
        key: "role",
        label: "Preferred Travel",
        type: "select",
        options: ["Trench", "Bump"],
    },
    {
        key: "fuel",
        label: "Average amount of fuel scored by human players",
        type: "text",
        placeholder: "eg. 5, 10",
    },
    {
        key: "autonStart",
        label: "Auton start location",
        type: "select",
        options: ["Center", "Depot Side", "Outpost Side"],
    },
    {key: "climb", label: "Level capable of climbing to", type: "select", options: ["None", "L1", "L2", "L3"]},
    {
        key: "climbTime",
        label: "Time it takes to climb",
        type: "text",
        placeholder: "eg. 0:30, 1:25",
    },

    {section: "Programming"},

    {section: "Misc"},
    {
        key: "Friendliness",
        label: "Friendliness",
        type: "text",
        placeholder: "Do they want to be here"

    },
    {key: "comments", label: "Robot name", type: "text", placeholder: "e.g. Nautilus"},
    {
        key: "addcomments",
        label: "Additional Comments",
        type: "text",
        placeholder: "Anything else"

    },
]