import Dexie, {type Table} from "dexie"

// 1. Typed settings object
export type Settings = {
    theme?: "dark" | "light" | "2025" | "2026" | "3473" | "968"
    field_orientation?: "0" | "90" | "180" | "270"
    match_scouting_device_type?: "mobile" | "tablet"
    match_ab_test?: "default" | "a" | "b"
    debug?: boolean
} & Record<string, string | boolean | number | undefined>

export const DEFAULT_SETTINGS: Required<Pick<Settings, "theme" | "field_orientation">> &
    Omit<Settings, "theme" | "field_orientation"> = {
    theme: "2026",
    field_orientation: "0",
    match_scouting_device_type: "mobile",
    match_ab_test: "default",
    debug: "false"
}

export interface SettingRow {
    key: "global"
    value: Settings
}

const GLOBAL_KEY = "global" as const

class SettingsDB extends Dexie {
    settings!: Table<SettingRow, string>

    constructor() {
        super("SettingsDB")
        this.version(1).stores({
            settings: "&key"
        })
    }
}

export const settingsDB = new SettingsDB()

// Get full settings object or specific key (proper overloads)
export function getSetting(): Promise<Settings>
export function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K]>
export async function getSetting<K extends keyof Settings>(
    key?: K
) {
    const entry = await settingsDB.settings.get(GLOBAL_KEY)

    const value: Settings = {
        ...DEFAULT_SETTINGS,
        ...(entry?.value ?? {})
    }

    if (key === undefined) {
        return value
    }

    return value[key]
}


// Set partial or full settings (atomic)
export async function setSetting(patch: Partial<Settings>) {
    await settingsDB.transaction("rw", settingsDB.settings, async () => {
        const current = (await settingsDB.settings.get(GLOBAL_KEY))?.value ?? {}
        const updated = {...current, ...patch}
        await settingsDB.settings.put({key: GLOBAL_KEY, value: updated})

        // Mirror to localStorage for instant sync access
        for (const [k, v] of Object.entries(patch)) {
            if (v !== undefined) localStorage.setItem(`setting_${k}`, String(v))
        }
    })
}

// Fast, synchronous read (for startup UI only)
export function getSettingSync<K extends keyof Settings>(
    key: K
): Settings[K] {
    try {
        const cached = localStorage.getItem(`setting_${key}`)
        if (cached !== null) {
            if (cached === "true") return true as Settings[K]
            if (cached === "false") return false as Settings[K]
            return cached as Settings[K]
        }
    } catch { /* empty */
    }
    return DEFAULT_SETTINGS[key] as Settings[K]
}

