import { useAPI } from "@/hooks/useAPI.ts";
import { useClientEnvironment } from "@/hooks/useClientEnvironment.ts";
import { useEffect, useRef, useState } from "react";

export type FeatureFlags = {
    offlineScouting: boolean;
    pushNotificationWarning: boolean;
    showAttendanceTimeForComp: boolean;
    forcePWA: boolean;
    confirmBeforeUpload: boolean;
    shotMadeSlider: boolean;
};

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
    offlineScouting: false,
    pushNotificationWarning: false,
    showAttendanceTimeForComp: true,
    forcePWA: false,
    confirmBeforeUpload: true,
    shotMadeSlider: true,
};

const STORAGE_KEY = "feature_flags";
const POLL_INTERVAL_MS = 5_000;

// -------------------------------------------------------------------------
// Storage helpers
// -------------------------------------------------------------------------

function loadFromStorage(): FeatureFlags {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_FEATURE_FLAGS;
        return { ...DEFAULT_FEATURE_FLAGS, ...(JSON.parse(raw) as Partial<FeatureFlags>) };
    } catch {
        return DEFAULT_FEATURE_FLAGS;
    }
}

function saveToStorage(flags: FeatureFlags): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
    } catch { /* persistence is optional */ }
}

// -------------------------------------------------------------------------
// Fetch — module-level dedup so concurrent hook instances share one request
// -------------------------------------------------------------------------

let inflightFetch: Promise<FeatureFlags> | null = null;
let lastFetchAt = 0;
const MIN_FETCH_INTERVAL_MS = POLL_INTERVAL_MS * 0.9; // slightly under poll rate

async function fetchFlags(
    getFeatureFlags: () => Promise<any>,
    serverOnline: boolean,
): Promise<FeatureFlags> {
    if (!serverOnline) return loadFromStorage();

    // Throttle: return cached storage if called too soon
    if (Date.now() - lastFetchAt < MIN_FETCH_INTERVAL_MS) return loadFromStorage();

    // Deduplicate concurrent calls
    if (inflightFetch) return inflightFetch;

    lastFetchAt = Date.now();

    inflightFetch = getFeatureFlags()
        .then((response): FeatureFlags => {
            const flags: FeatureFlags = {
                ...DEFAULT_FEATURE_FLAGS,
                ...(response?.feature_flags ?? {}),
            };
            saveToStorage(flags);
            return flags;
        })
        .catch((): FeatureFlags => {
            // Reset so a retry can happen sooner after a failure
            lastFetchAt = 0;
            return loadFromStorage();
        })
        .finally(() => {
            inflightFetch = null;
        });

    return inflightFetch;
}

// -------------------------------------------------------------------------
// Hook
// -------------------------------------------------------------------------

export default function useFeatureFlags(): FeatureFlags {
    const { getFeatureFlags } = useAPI();
    const { serverOnline } = useClientEnvironment();
    const [flags, setFlags] = useState<FeatureFlags>(loadFromStorage);
    const serverOnlineRef = useRef(serverOnline);

    useEffect(() => {
        serverOnlineRef.current = serverOnline;
    }, [serverOnline]);

    useEffect(() => {
        let cancelled = false;

        async function refresh() {
            const updated = await fetchFlags(getFeatureFlags, serverOnlineRef.current);
            if (!cancelled) setFlags(updated);
        }

        refresh();
        const id = setInterval(refresh, POLL_INTERVAL_MS);

        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [getFeatureFlags]);

    return flags;
}