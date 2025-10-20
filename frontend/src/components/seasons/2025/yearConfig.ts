import type {AllianceType, MatchType} from "@/types"
import type {Branches} from "@/types/data.ts";

export type MatchScoutingData = {
    match: number | null
    match_type: MatchType
    alliance: AllianceType
    teamNumber: number | null
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

export const createDefaultScoutingData = (): Omit<MatchScoutingData, "scouter"> => ({
    match: null,
    match_type: null,
    alliance: null,
    teamNumber: null,
    auto: {
        branchPlacement: Object.fromEntries(
            (["A","B","C","D","E","F","G","H","I","J","K","L"] as const)
            .map(id => [id, { l2: false, l3: false, l4: false }])
        ) as Record<
            "A"|"B"|"C"|"D"|"E"|"F"|"G"|"H"|"I"|"J"|"K"|"L",
            { l2: boolean; l3: boolean; l4: boolean }
        >,
        algaePlacement: { AB: true, CD: true, EF: true, GH: true, IJ: true, KL: true },
        missed: { l1: 0, l2: 0, l3: 0, l4: 0 },
        l1: 0,
        processor: 0,
        barge: 0,
        missAlgae: 0,
        moved: false,
    },
    teleop: {
        branchPlacement: Object.fromEntries(
            (["A","B","C","D","E","F","G","H","I","J","K","L"] as const)
            .map(id => [id, { l2: false, l3: false, l4: false }])
        ) as Record<
            "A"|"B"|"C"|"D"|"E"|"F"|"G"|"H"|"I"|"J"|"K"|"L",
            { l2: boolean; l3: boolean; l4: boolean }
        >,
        algaePlacement: { AB: true, CD: true, EF: true, GH: true, IJ: true, KL: true },
        missed: { l1: 0, l2: 0, l3: 0, l4: 0 },
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
        faults: { system: false, idle: false, other: false },
        notes: "",
    },
})


export type PitScoutingData = {
    team: number;

    // Robot Specs
    widthInches: number;
    lengthInches: number;
    heightExtendedInches: number;
    heightCollapsedInches: number;
    weightPounds: number;

    drivebaseType: string;
    hoursOfDrivePractice: number;
    intakeDescription: string;

    climbLevel: "shallow" | "deep"; // was: cageSetting
    role: "Defense" | "Offense" | "Both";

    autonStartPosition: ("Center" | "Left Wing" | "Right Wing" | "Stage Edge" | "Far Side")[];
    teleopPlayArea: ("AB Zone" | "CD Zone" | "EF Zone" | "GH Zone" | "IJ Zone" | "KL Zone")[];

    additionalComments?: string;
};

export type UIInfo = {
    red: {
        score: number
        coral: number
        algae: number
    }
    blue: {
        score: number
        coral: number
        algae: number
    }
}

export const defaultUIINFO = {
    red: {
        score: 0,
        coral: 0,
        algae: 0
    },
    blue: {
        score: 0,
        coral: 0,
        algae: 0
    }
}


