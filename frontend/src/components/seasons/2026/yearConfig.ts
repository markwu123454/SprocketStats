import type {AllianceType, MatchType} from "@/types"

// ---------------------------------------------------------------------------
// Core Action Types (from A.tsx)
// ---------------------------------------------------------------------------

export type MatchPhase = "prestart" | "auto" | "between" | "teleop" | "post"

export type SubPhaseName =
    | "auto"
    | "transition"
    | "shift_1"
    | "shift_2"
    | "shift_3"
    | "shift_4"
    | "endgame"

export type StartingAction = {
    type: "starting"
    x: number
    y: number
}

export type ScoreAction = {
    type: "score"
    x: number
    y: number
    score: number
    timestamp: number
    phase: MatchPhase
    subPhase: SubPhaseName | null
}

export type PassAction = {
    type: "passing"
    timestamp: number
    phase: MatchPhase
    subPhase: SubPhaseName | null
}

export type ClimbAction = {
    type: "climb"
    timestamp: number
    level: "L1" | "L2" | "L3"
    success: boolean
    phase: MatchPhase
    subPhase: SubPhaseName | null
}

export type DefenseAction = {
    type: "defense"
    timestamp: number
    phase: MatchPhase
    subPhase: SubPhaseName | null
}

export type TraversalAction = {
    type: "traversal"
    timestamp: number
    phase: MatchPhase
    subPhase: SubPhaseName | null
}

export type IdleAction = {
    type: "idle"
    timestamp: number
    phase: MatchPhase
    subPhase: SubPhaseName | null
}

export type IntakeAction = {
    type: "intake"
    timestamp: number
    phase: MatchPhase
    subPhase: SubPhaseName | null
}

export type ShootingAction = {
    type: "shooting"
    timestamp: number
    phase: MatchPhase
    subPhase: SubPhaseName | null
}

export type Actions =
    | StartingAction
    | ScoreAction
    | ClimbAction
    | PassAction
    | DefenseAction
    | TraversalAction
    | IdleAction
    | IntakeAction
    | ShootingAction

// ---------------------------------------------------------------------------
// Match Scouting Data Structure
// ---------------------------------------------------------------------------

export type MatchScoutingData = {
    match_type: MatchType
    match: number | null
    alliance: AllianceType
    teamNumber: number | null
    manualTeam: boolean
    scouter: string | null

    // Starting position
    startPosition: { x: number; y: number } | null

    // All actions during the match (zone changes, scores, climbs)
    actions: Actions[]

    // Post-match qualitative data
    postmatch: {
        skill: number // 0-1
        defenseSkill: number // 0-1
        role: "Shooter" | "Intake" | "Defense" | "Generalist" | "Useless"
        traversalLocation: "Trench" | "Bump" | "No Preference" // slider?
        teleopClimbPos: "Center" | "Left" | "Right" | "Left Side" | "Right Side" | null
        autoClimbPos: "Center" | "Left" | "Right" | "Left Side" | "Right Side" | null
        intakePos: {
            neutral: boolean
            depot: boolean
            outpost: boolean
            opponent: boolean
        }
        faults: {
            system: boolean
            idle: boolean
            other: boolean
        }
        notes: string
    }
}

// ---------------------------------------------------------------------------
// Default Data Factory
// ---------------------------------------------------------------------------

export const createDefaultScoutingData = (): Omit<MatchScoutingData, "scouter"> => {
    return {
        match_type: null,
        match: null,
        alliance: null,
        teamNumber: null,
        manualTeam: false,

        startPosition: null,
        actions: [],

        postmatch: {
            // stashing strat
            skill: 0,
            defenseSkill: 0,
            role: "Useless",
            traversalLocation: "No Preference",
            teleopClimbPos: null,
            autoClimbPos: null,
            intakePos: {
                neutral: false,
                depot: false,
                outpost: false,
                opponent: false,
            },
            faults: {
                system: false,
                idle: false,
                other: false,
            },
            notes: "",
        },
    }
}

// ---------------------------------------------------------------------------
// Pit Scouting Questions
// ---------------------------------------------------------------------------

export const pitQuestions = [
    {section: "Robot Info"},

    {
        key: "driveBase",
        label: "Drive Base Type",
        type: "select",
        options: ["Swerve", "Tank", "Mecanum", "H-Drive"],
    },
    {
        key: "robotSpeed",
        label: "Robot Speed",
        type: "select",
        options: ["Slow", "Medium", "Fast", "Very Fast"],
    },
    {
        key: "driverSkill",
        label: "Driver Skill",
        type: "text",
        placeholder: "eg. Experienced, Amateur, Rookie"
    },

    {section: "Mechanism & Manipulation"},

    {
        key: "gameElementCapacity",
        label: "Game element capacity",
        type: "text",
        placeholder: "eg. 1, 3, 5+"
    },
    {
        key: "intakeLocation",
        label: "Primary Intake Location",
        type: "select",
        options: ["Ground", "Station", "Both"],
    },
    {
        key: "intakeType",
        label: "Intake Type",
        type: "select",
        options: ["Under Bumper", "Between Bumper", "Over Bumper", "Other"],
    },
    {
        key: "scoringLocations",
        label: "Scoring Locations",
        type: "text",
        placeholder: "eg. High, Mid, Low"
    },

    {section: "Strategy & Function"},

    {
        key: "preferredZone",
        label: "Preferred Operating Zone",
        type: "text",
        placeholder: "eg. Neutral, Shooting, Transition"
    },
    {
        key: "avgCycleTime",
        label: "Average cycle time (seconds)",
        type: "text",
        placeholder: "eg. 10, 15, 20",
    },
    {
        key: "autonStart",
        label: "Auton start location",
        type: "select",
        options: ["Left", "Center", "Right", "Flexible"],
    },
    {
        key: "autonCapabilities",
        label: "Autonomous capabilities",
        type: "text",
        placeholder: "eg. Scores 3, mobility only"
    },
    {
        key: "climb",
        label: "Level capable of climbing to",
        type: "select",
        options: ["None", "L1", "L2", "L3"],
    },
    {
        key: "climbTime",
        label: "Time it takes to climb",
        type: "text",
        placeholder: "eg. 0:15, 0:30, 1:00",
    },

    {section: "Programming & Vision"},

    {
        key: "visionTracking",
        label: "Vision tracking capabilities",
        type: "select",
        options: ["None", "AprilTags", "Object Detection", "Both"],
    },
    {
        key: "autoAlignment",
        label: "Auto-alignment for scoring",
        type: "select",
        options: ["Yes", "No", "Partial"],
    },

    {section: "Defense & Durability"},

    {
        key: "defensiveCapability",
        label: "Defensive capability",
        type: "select",
        options: ["None", "Light", "Moderate", "Heavy"],
    },
    {
        key: "durability",
        label: "Robot durability/robustness",
        type: "select",
        options: ["Fragile", "Average", "Robust", "Tank"],
    },

    {section: "Misc"},

    {
        key: "teamAttitude",
        label: "Team Attitude",
        type: "text",
        placeholder: "Enthusiastic, focused, etc."
    },
    {
        key: "robotName",
        label: "Robot name",
        type: "text",
        placeholder: "e.g. Nautilus, Phoenix"
    },
    {
        key: "addcomments",
        label: "Additional Comments",
        type: "text",
        placeholder: "Anything else noteworthy"
    },
]
