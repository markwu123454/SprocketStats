import Dexie, { type Table } from "dexie"

// 1. Typed settings object
export type Settings = {
    theme?: "dark" | "light" | "2025" | "2026"
    field_orientation?: "0" | "90" | "180" | "270"
} & Record<string, string | boolean | number | undefined>

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

// 2. Get full settings object or specific key (proper overloads)
export async function getSetting(): Promise<Settings | null>
export async function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K] | null>
export async function getSetting(key?: keyof Settings): Promise<any> {
    const entry = await settingsDB.settings.get(GLOBAL_KEY)
    if (!entry) return null
    return key ? entry.value[key] ?? null : entry.value
}

// 3. Set partial or full settings (atomic)
export async function setSetting(patch: Partial<Settings>) {
    await settingsDB.transaction("rw", settingsDB.settings, async () => {
        const current = (await settingsDB.settings.get(GLOBAL_KEY))?.value ?? {}
        const updated = { ...current, ...patch }
        await settingsDB.settings.put({ key: GLOBAL_KEY, value: updated })

        // Write each key to localStorage for instant retrieval
        for (const [k, v] of Object.entries(patch)) {
            if (v !== undefined) localStorage.setItem(`setting_${k}`, String(v))
        }
    })
}


// 4. Clear all settings
export async function clearSettings() {
    await settingsDB.settings.clear()
}

// 5. Fast, synchronous read (for startup UI only)
export function getSettingSync<K extends keyof Settings>(
    key: K,
    fallback?: Settings[K]
): Settings[K] {
    try {
        // Try from localStorage first (instant)
        const cached = localStorage.getItem(`setting_${key}`)
        if (cached !== null) return cached as Settings[K]

        // Dexie is async by design; don't block on it.
        // So this only works if you previously cached it via setSetting below.
        return fallback ?? null as Settings[K]
    } catch {
        return fallback ?? null as Settings[K]
    }
}
