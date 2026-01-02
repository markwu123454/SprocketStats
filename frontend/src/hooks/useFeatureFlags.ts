import { useAPI } from "@/hooks/useAPI.ts"
import { useClientEnvironment } from "@/hooks/useClientEnvironment.ts"
import { useEffect, useState } from "react"

export type FeatureFlags = {
    offlineScouting: boolean
    pushNotificationWarning: boolean // currently unused
}

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
    offlineScouting: false,
    pushNotificationWarning: false,
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

export default function useFeatureFlags(): FeatureFlags {
    const { getFeatureFlags } = useAPI()
    const { serverOnline } = useClientEnvironment()

    const [featureFlags, setFeatureFlags] = useState<FeatureFlags>(
        loadFromLocalStorage
    )

    useEffect(() => {
        if (!serverOnline) {
            setFeatureFlags(loadFromLocalStorage())
            return
        }

        const fetchFlags = async () => {
            try {
                const response = await getFeatureFlags()
                const flags: FeatureFlags = {
                    ...DEFAULT_FEATURE_FLAGS,
                    ...(response?.feature_flags ?? {}),
                }

                setFeatureFlags(flags)
                saveToLocalStorage(flags)
            } catch {
                setFeatureFlags(loadFromLocalStorage())
            }
        }

        void fetchFlags()
    }, [serverOnline])

    return featureFlags
}
