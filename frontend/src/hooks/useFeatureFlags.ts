import { useAPI } from "@/hooks/useAPI.ts"
import { useClientEnvironment } from "@/hooks/useClientEnvironment.ts"
import { useEffect, useState } from "react"

export type FeatureFlags = {
    offlineScouting: boolean
    pushNotificationWarning: boolean // currently unused
    showAttendanceTimeForComp: boolean
    forcePWA: boolean
    confirmBeforeUpload: boolean
    shotMadeSlider: boolean
}

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
    offlineScouting: false,
    pushNotificationWarning: false,
    showAttendanceTimeForComp: true,
    forcePWA: false,
    confirmBeforeUpload: true,
    shotMadeSlider: true,

}

const STORAGE_KEY = "feature_flags"

function loadFromLocalStorage(): FeatureFlags {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return DEFAULT_FEATURE_FLAGS

        const parsed = JSON.parse(raw) as Partial<FeatureFlags>

        return {
            ...DEFAULT_FEATURE_FLAGS,
            ...parsed,
        }
    } catch {
        return DEFAULT_FEATURE_FLAGS
    }
}

function saveToLocalStorage(flags: FeatureFlags) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(flags))
    } catch {
        // ignore — persistence is optional
    }
}

// Singleton state
let cachedFlags: FeatureFlags | null = null
let isFetching = false
const listeners = new Set<(flags: FeatureFlags) => void>()

function notifyListeners(flags: FeatureFlags) {
    listeners.forEach(listener => listener(flags))
}

function subscribeToFlags(listener: (flags: FeatureFlags) => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

async function fetchFeatureFlagsOnce(
    getFeatureFlags: () => Promise<any>,
    serverOnline: boolean
): Promise<FeatureFlags> {
    // If already cached, return immediately
    if (cachedFlags) {
        return cachedFlags
    }

    // If not online, load from localStorage
    if (!serverOnline) {
        const flags = loadFromLocalStorage()
        cachedFlags = flags
        notifyListeners(flags)
        return flags
    }

    // If already fetching, wait for the current fetch
    if (isFetching) {
        return new Promise(resolve => {
            const unsubscribe = subscribeToFlags(flags => {
                unsubscribe()
                resolve(flags)
            })
        })
    }

    // Start fetching
    isFetching = true

    try {
        const response = await getFeatureFlags()
        const flags: FeatureFlags = {
            ...DEFAULT_FEATURE_FLAGS,
            ...(response?.feature_flags ?? {}),
        }

        cachedFlags = flags
        saveToLocalStorage(flags)
        notifyListeners(flags)
        return flags
    } catch {
        const flags = loadFromLocalStorage()
        cachedFlags = flags
        notifyListeners(flags)
        return flags
    } finally {
        isFetching = false
    }
}

export default function useFeatureFlags(): FeatureFlags {
    const { getFeatureFlags } = useAPI()
    const { serverOnline } = useClientEnvironment()

    const [featureFlags, setFeatureFlags] = useState<FeatureFlags>(
        () => cachedFlags ?? loadFromLocalStorage()
    )

    useEffect(() => {
        // Subscribe to flag changes
        const unsubscribe = subscribeToFlags(setFeatureFlags)

        // Fetch flags (will use cache if available)
        void fetchFeatureFlagsOnce(getFeatureFlags, serverOnline)

        return () => {
            unsubscribe()
        }
    }, [getFeatureFlags, serverOnline])

    return featureFlags
}