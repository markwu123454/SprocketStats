import type {AllianceType, MatchType} from "@/types"

type Branches = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L"

export type MatchScoutingData = {
    match: number | null
    match_type: MatchType
    alliance: AllianceType
    teamNumber: number | null
    manualTeam: boolean
    scouter: string | null

    auto: {
        branchPlacement: Record<Branches, { l2: boolean; l3: boolean; l4: boolean }>
        algaePlacement: {
            AB: boolean
            CD: boolean
            EF: boolean
            GH: boolean
            IJ: boolean
            KL: boolean
        }
        missed: { l2: number; l3: number; l4: number; l1: number }
        l1: number
        processor: number
        barge: number
        missAlgae: number
        moved: boolean
    }

    teleop: {
        branchPlacement: Record<Branches, { l2: boolean; l3: boolean; l4: boolean }>
        algaePlacement: {
            AB: boolean
            CD: boolean
            EF: boolean
            GH: boolean
            IJ: boolean
            KL: boolean
        }
        missed: { l2: number; l3: number; l4: number; l1: number }
        l1: number
        processor: number
        barge: number
        missAlgae: number
    }

    postmatch: {
        de_algae: boolean
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
    const branchIDs = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const
    const makeBranches = (): Record<typeof branchIDs[number], { l2: boolean; l3: boolean; l4: boolean }> => {
        const branches = {} as Record<typeof branchIDs[number], { l2: boolean; l3: boolean; l4: boolean }>
        for (const id of branchIDs) branches[id] = {l2: false, l3: false, l4: false}
        return branches
    }

    const makeAlgae = (): Record<"AB" | "CD" | "EF" | "GH" | "IJ" | "KL", boolean> =>
        ({AB: true, CD: true, EF: true, GH: true, IJ: true, KL: true})

    return {
        match: null,
        match_type: null,
        alliance: null,
        teamNumber: null,
        manualTeam: false,
        auto: {
            branchPlacement: makeBranches(),
            algaePlacement: makeAlgae(),
            missed: {l1: 0, l2: 0, l3: 0, l4: 0},
            l1: 0,
            processor: 0,
            barge: 0,
            missAlgae: 0,
            moved: false,
        },
        teleop: {
            branchPlacement: makeBranches(),
            algaePlacement: makeAlgae(),
            missed: {l1: 0, l2: 0, l3: 0, l4: 0},
            l1: 0,
            processor: 0,
            barge: 0,
            missAlgae: 0,
        },
        postmatch: {
            de_algae: false,
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
    {
        key: "cageSet",
        label: "Cage Set",
        type: "select",
        options: ["High", "Low", "No Preference"],
    },
    {
        key: "cgCollapsed",
        label: "Center of Gravity (collapsed) height (inches)",
        type: "number",
        placeholder: "e.g. 10"
    },
    {key: "cgExtended", label: "Center of Gravity (extended) height (inches)", type: "number", placeholder: "e.g. 18"},

    {section: "Mechanism & Manipulation"},

    {key: "intake", label: "Describe the intake", type: "text", placeholder: "e.g. Two rollers with polycord belts"},
    {
        key: "mechanism",
        label: "Scoring mechanism type",
        type: "text",
        placeholder: "e.g. Elevator, Arm, Shooter, Hybrid"
    },
    {
        key: "pieces",
        label: "What game pieces can it handle?",
        type: "select",
        options: ["Coral", "Algae", "Both"],
    },
    {
        key: "levels",
        label: "Which levels can it score on?",
        type: "multi",
        options: ["L1", "L2", "L3", "L4"],
    },

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
    {
        key: "teleopAction",
        label: "Primary teleop role / actions",
        type: "text",
        placeholder: "e.g. Scoring top coral, occasional algae removal"
    },
    {
        key: "cycles",
        label: "How many cycles per game / pieces scored?",
        type: "text",
        placeholder: "e.g. 6–7 cycles, 8 pieces total"
    },
    {key: "climb", label: "Climb or Endgame capability", type: "text", placeholder: "e.g. Can hang on mid bar"},

    {section: "Programming & Misc"},

    {
        key: "programming",
        label: "Programming highlights",
        type: "multi",
        options: [
            {key: "vision", label: "Vision alignment"},
            {key: "path planner", label: "Path planner path gen."},
            {key: "driver assist", label: "Teleop driver assist"},
        ],
    },
    {key: "comments", label: "Robot name", type: "text", placeholder: "e.g. Nautilus"},
]