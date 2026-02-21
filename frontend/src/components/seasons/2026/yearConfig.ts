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
        defenseSkill: number | null // 0-1
        speed: number // 0-1
        role: "Shooter" | "Intake" | "Defense" | "Generalist" | "Useless"
        traversalLocation: "Trench" | "Bump" | "No Preference" // slider?
        teleopClimbPos: "Front Center" | "Front Left" | "Front Right" | "Side Left" | "Side Right" | null
        autoClimbPos: "Front Center" | "Front Left" | "Front Right" | "Side Left" | "Side Right" | null
        intakePos: {
            neutral: boolean
            depot: boolean
            outpost: boolean
            opponent: boolean
        }
        faults: {
            // Connection / control
            disconnected: boolean       // robot goes dark / loses comms entirely
            brownout: boolean           // flickering, sluggish, brief power loss behavior
            disabled: boolean           // robot stops moving but lights stay on

            // Mobility
            immobilized: boolean
            erratic_driving: boolean    // spun uncontrollably, drifted, couldn't go straight

            // Game piece handling
            jam: boolean                // game piece visibly stuck in/on robot

            // Structure
            structural_failure: boolean // a visible piece of robot detaches

            failed_auto: boolean        // robot have auto but it's obvious it isn't working as intended

            other: boolean
        }
        messed_up: boolean
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
            speed: 0,
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
                // Connection / control
                disconnected: false,       // robot goes dark / loses comms entirely
                brownout: false,           // flickering, sluggish, brief power loss behavior
                disabled: false,           // robot stops moving but lights stay on

                // Mobility
                immobilized: false,        // can still function but can't drive (e.g. stuck on field element)
                erratic_driving: false,    // spun uncontrollably, drifted, couldn't go straight

                // Game piece handling
                jam: false,                // game piece visibly stuck in/on robot

                // Structure
                structural_failure: false, // a visible piece of robot detaches

                failed_auto: false,        // robot have auto but it's obvious it isn't working as intended

                other: false,
            },
            messed_up: false,
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
        label: "Drive base type",
        type: "select",
        options: ["Swerve", "Tank", "Mecanum", "H-Drive"],
    },
    {
        key: "robotSpeed",
        label: "Robot speed",
        type: "select",
        options: ["Gear 1", "Gear 2", "Gear 3", "Not swerve"],
    },
    {
        key: "driverPractice",
        label: "Driver practice time (hrs)",
        type: "number",
        placeholder: "eg. 5, 10, 15"
    },

    {section: "Mechanism & Manipulation"},

    {
        key: "gameElementCapacity",
        label: "Game element capacity",
        type: "number",
        placeholder: "eg. 10, 30, 50"
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
        type: "multi",
        options: ["Between Bumper", "Over Bumper", "Source", "None"],
    },

    {section: "Strategy & Function"},

    {
        key: "preferredZone",
        label: "Preferred Intake Zone",
        type: "select",
        options: ["Neutral", "Source", "Depot"]
    },
    {
        key: "avgCycle",
        label: "Average cycles per match",
        type: "number",
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
        label: "Time it takes to climb (sec)",
        type: "number",
        placeholder: "eg. 10, 15, 20",
    },
    {
        key: "traversal",
        label: "Trench or bump",
        type: "select",
        options: ["Trench", "Bump", "Both", "None"],
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

    {section: "Misc"},

    {
        key: "teamAttitude",
        label: "Team Attitude",
        type: "multi",
        options: ["Enthusiastic", "Uninterested", "Nice", "Rude", "Condescending"],
    },
    {
        key: "robotName",
        label: "Robot name",
        type: "text",
        placeholder: "e.g. Nautilus, Phoenix"
    },
    {
        key: "funFacts",
        label: "Fun facts",
        type: "text",
        placeholder: "Anything else cool to know"
    },
]
