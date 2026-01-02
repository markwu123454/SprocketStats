import type {AllianceType, MatchScoutingData, MatchType, TeamInfo} from '@/types'
import {useCallback} from "react";

const BASE_URL = import.meta.env.VITE_BACKEND_URL;
const UUID_COOKIE = "scouting_uuid"
const NAME_COOKIE = "scouting_name"
const EMAIL_COOKIE = "scouting_email"

// --- Cookie utilities ---
function setCookie(name: string, value: string, days: number) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString()
    document.cookie = `${name}=${value}; expires=${expires}; path=/`
}

function getCookie(name: string): string | null {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
    return match ? match[2] : null
}

function deleteCookie(name: string) {
    document.cookie = `${name}=; Max-Age=0; path=/`
}

export function getAuthHeaders(): HeadersInit {
    const uuid = getCookie(UUID_COOKIE)
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
    }
    if (uuid) headers['x-uuid'] = uuid
    return headers
}

export function getScouterName(): string | null {
    return getCookie(NAME_COOKIE)
}

export function getScouterEmail(): string | null {
    return getCookie(EMAIL_COOKIE)
}

// --- General utilities ---

async function apiRequest<T>(
    path: string,
    options: {
        method?: string;
        query?: Record<string, string | number | null | undefined>;
        body?: unknown;
        headers?: HeadersInit;
    } = {}
): Promise<T | null> {
    try {
        // Build query string
        let url = `${BASE_URL}${path}`;
        if (options.query) {
            const qs = new URLSearchParams();
            for (const [k, v] of Object.entries(options.query)) {
                if (v !== undefined && v !== null) qs.append(k, String(v));
            }
            url += `?${qs.toString()}`;
        }

        const res = await fetch(url, {
            method: options.method ?? "GET",
            headers: {
                ...getAuthHeaders(),
                ...(options.headers ?? {}),
                ...(options.body ? {"Content-Type": "application/json"} : {}),
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
        });

        if (!res.ok) {
            console.warn(`API ${options.method ?? "GET"} ${url} failed: ${res.status}`);
            return null;
        }

        // If response has JSON, return it; otherwise return null
        const text = await res.text();
        return text ? (JSON.parse(text) as T) : (null as T);
    } catch (err) {
        console.error(`API error for ${path}:`, err);
        return null;
    }
}


export function useAPI() {

    // --- Endpoint: GET /ping ---
    const ping = async (): Promise<
        boolean
    > => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);

        try {
            const res = await fetch(`${BASE_URL}/ping`, {
                method: "GET",
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (!res.ok) return false;

            const data = await res.json();
            return data.ping === "pong";
        } catch {
            return false;
        }
    };


    // --- Endpoint: POST /auth/login ---
    const login = async (credential: string): Promise<{
        success: boolean
        name?: string
        error?: string
        permissions?: {
            dev: boolean
            admin: boolean
            match_scouting: boolean
            pit_scouting: boolean
        }
    }
    > => {
        deleteCookie(UUID_COOKIE)
        deleteCookie(NAME_COOKIE)
        deleteCookie(EMAIL_COOKIE)

        try {
            // Send credential (Google ID token) to backend
            const res = await fetch(`${BASE_URL}/auth/login`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({credential}),
            })

            if (!res.ok) {
                const msg = await res.text()
                return {success: false, error: `Login failed: ${res.statusText} ${msg}`}
            }

            const json = await res.json()
            setCookie(UUID_COOKIE, json.uuid, 3)
            setCookie(NAME_COOKIE, json.name, 3)
            setCookie(EMAIL_COOKIE, json.email, 3)

            return {
                success: true,
                name: json.name,
                permissions: json.permissions,
            }
        } catch (err) {
            console.error("login failed:", err)
            return {success: false, error: "Network error"}
        }
    }


    // --- Endpoint: Local logout ---
    const logout = async (): Promise<void> => {
        try {
            deleteCookie(UUID_COOKIE)
            deleteCookie(NAME_COOKIE)
            deleteCookie(EMAIL_COOKIE)

        } catch (err) {
            console.error("logout failed:", err)
        }
    }


    // --- Endpoint: GET /metadata ---
    const getMetadata = async () => {
        return apiRequest<{
            current_event: string
            feature_flags: {
                offlineScouting: boolean
                pushNotificationWarning: boolean
            }
        }>("/metadata")
    }

    const getFeatureFlags = async () => {
        return apiRequest<{
            feature_flags: {
                offlineScouting: boolean
                pushNotificationWarning: boolean
            }
        }>("/metadata/feature_flags")
    }


    // --- Endpoint: GET /auth/verify ---
    const verify = useCallback(async (): Promise<{
        success: boolean
        name: string
        permissions: {
            dev: boolean
            admin: boolean
            match_scouting: boolean
            pit_scouting: boolean
        }
    }
    > => {
        try {
            const res = await fetch(`${BASE_URL}/auth/verify`, {
                headers: getAuthHeaders(),
            })
            if (!res.ok) return {
                success: false,
                name: "",
                permissions: {
                    dev: false,
                    admin: false,
                    match_scouting: false,
                    pit_scouting: false,
                },
            }

            const json = await res.json()

            return {
                success: true,
                name: json.name,
                permissions: json.permissions ?? {
                    dev: false,
                    admin: false,
                    match_scouting: false,
                    pit_scouting: false,
                },
            }
        } catch {
            return {
                success: false,
                name: "",
                permissions: {
                    dev: false,
                    admin: false,
                    match_scouting: false,
                    pit_scouting: false,
                },
            }
        }
    }, []) // <-- stable identity


    // --- Endpoint: GET /admin/matches/active ---
    const getActiveMatches = async (): Promise<{
        [matchType: string]: {
            [matchNumber: number]: {
                time: number | null;
                red: Record<number, {
                    scouter: string | null;
                    name: string | null;
                    phase: string;
                    assigned_scouter: string | null;
                    assigned_name: string | null;
                }>;
                blue: Record<number, {
                    scouter: string | null;
                    name: string | null;
                    phase: string;
                    assigned_scouter: string | null;
                    assigned_name: string | null;
                }>;
            };
        };
    }> => {
        const res = await apiRequest<{
            [matchType: string]: {
                [matchNumber: number]: {
                    time: number | null;
                    red: Record<number, {
                        scouter: string | null;
                        name: string | null;
                        phase: string;
                        assigned_scouter: string | null;
                        assigned_name: string | null;
                    }>;
                    blue: Record<number, {
                        scouter: string | null;
                        name: string | null;
                        phase: string;
                        assigned_scouter: string | null;
                        assigned_name: string | null;
                    }>;
                };
            };
        }>(
            "/admin/matches/active"
        );

        return res ?? {};
    };


    // --- Endpoint: GET /team/{team} ---
    const getPitScoutStatus = async (
        team: number | string
    ): Promise<
        {
            scouted: boolean
        }
    > => {
        const response = await apiRequest<{ scouted?: boolean }>(`/team/${team}`);

        return {scouted: response?.scouted ?? false};
    };


    // --- Endpoint: POST /scouting/{m_type}/{match}/{team}/submit ---
    const submitData = async (
        match: number,
        team: number,
        fullData: {
            match_type: MatchType;
            alliance: AllianceType;
            scouter: string;
            data: Omit<MatchScoutingData,
                'match' |
                'match_type' |
                'alliance' |
                'teamNumber' |
                'scouter'
            >;
        }
    ): Promise<
        boolean
    > => {
        try {
            const {match_type, alliance, scouter, data} = fullData;
            const body = {match_type, alliance, scouter, ...data};

            const res = await fetch(`${BASE_URL}/scouting/${match_type}/${match}/${team}/submit`, {
                method: 'POST',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            return res.ok;
        } catch (err) {
            console.error('submitData failed:', err);
            return false;
        }
    };


    // --- Endpoint: PATCH /scouting/{m_type}/{match}/{team}/claim ---
    const claimTeam = async (
        match: number,
        team: number,
        match_type: MatchType,
        scouter: string
    ): Promise<
        boolean
    > => {
        try {
            const query = new URLSearchParams({scouter});
            const res = await fetch(
                `${BASE_URL}/scouting/${match_type}/${match}/${team}/claim?${query.toString()}`,
                {
                    method: "PATCH",
                    headers: getAuthHeaders(),
                }
            );
            return res.ok;
        } catch (err) {
            console.error("claimTeam failed:", err);
            return false;
        }
    };


    // --- Endpoint: PATCH /scouting/{m_type}/{match}/{team}/unclaim ---
    const unclaimTeam = async (
        match: number,
        team: number,
        match_type: MatchType,
        scouter: string
    ): Promise<
        boolean
    > => {
        try {
            const query = new URLSearchParams({scouter});
            const res = await fetch(
                `${BASE_URL}/scouting/${match_type}/${match}/${team}/unclaim?${query.toString()}`,
                {
                    method: "PATCH",
                    headers: getAuthHeaders(),
                }
            );
            return res.ok;
        } catch (err) {
            console.error("unclaimTeam failed:", err);
            return false;
        }
    };


    const unclaimTeamBeacon = (
        match: number,
        team: number,
        match_type: MatchType,
        scouter: string
    ) => {
        try {
            const url = `${BASE_URL}/scouting/${match_type}/${match}/${team}/unclaim-beacon?scouter=${encodeURIComponent(scouter)}`;
            navigator.sendBeacon(url);
        } catch (err) {
            console.warn("unclaimTeamBeacon failed:", err);
        }
    };


    // --- Endpoint: PATCH /scouting/{m_type}/{match}/{team}/state ---
    const updateState = async (
        match: number,
        team: number,
        match_type: MatchType,
        scouter: string,
        phase: "pre" | "auto" | "teleop" | "post" | "submitted"
    ): Promise<
        boolean
    > => {
        try {
            // Prevent updates from non-owners
            if (!scouter) {
                console.warn("updateState aborted: missing scouter");
                return false;
            }

            // Build query — backend still expects scouter for verification
            const query = new URLSearchParams({scouter, status: phase});

            const res = await fetch(
                `${BASE_URL}/scouting/${match_type}/${match}/${team}/state?${query.toString()}`,
                {
                    method: "PATCH",
                    headers: getAuthHeaders(),
                }
            );

            // Handle explicit rejections
            if (res.status === 403) {
                console.warn("updateState rejected: not current scouter");
                return false;
            }
            if (res.status === 400) {
                console.warn("updateState rejected: cannot regress phase");
                return false;
            }

            return res.ok;
        } catch (err) {
            console.error("updateState failed:", err);
            return false;
        }
    };


    // --- Endpoint: GET /match/{m_type}/{match}/{alliance} ---
    const getTeamList = async (
        match: number,
        m_type: MatchType,
        alliance: 'red' | 'blue'
    ): Promise<
        TeamInfo[]
    > => {
        const res = await apiRequest<{ teams: TeamInfo[] }>(`/match/${m_type}/${match}/${alliance}`);
        return res?.teams ?? [];
    }


    // --- Endpoint: GET /match/{m_type}/{match}/{alliance}/state ---
    const getScouterState = async (
        match: number,
        m_type: MatchType,
        alliance: 'red' | 'blue'
    ): Promise<{
        timestamp: string | null
        teams: Record<string, {
            scouter: string | null
            name: string
            assigned_scouter: string | null
            assigned_name: string
        }>
    } | null> => {
        return await apiRequest<{
            timestamp: string | null
            teams: Record<string, {
                scouter: string | null
                name: string
                assigned_scouter: string | null
                assigned_name: string
            }>
        }>(`/match/${m_type}/${match}/${alliance}/state`);
    };


    // --- Endpoint: GET /scouter/schedule ---
    const getScouterSchedule = async () => {
        const res = await apiRequest<{
            assignments: {
                match_type: MatchType;
                match_number: number;
                set_number: number;
                alliance: AllianceType;
                robot: number;
            }[];
        }>("/scouter/schedule");

        return res?.assignments ?? [];
    };


    // --- Endpoint: GET /matches/schedule ---
    const getAllMatches = async () => {
        return await apiRequest<{
            matches: {
                key: string
                event_key: string
                match_type: MatchType
                match_number: number
                set_number: number
                scheduled_time: string | null
                actual_time: string | null
                red1: number | null
                red2: number | null
                red3: number | null
                blue1: number | null
                blue2: number | null
                blue3: number | null
                red1_scouter: string | null
                red2_scouter: string | null
                red3_scouter: string | null
                blue1_scouter: string | null
                blue2_scouter: string | null
                blue3_scouter: string | null
            }[]
            scouters: {
                email: string
                name: string
            }[]
        }>("/matches/schedule");
    };


    // --- Endpoint: PATCH /matches/schedule ---
    const updateMatchSchedule = async (
        matches: {
            key: string
            scheduled_time: string | null
            actual_time: string | null
            red1: number | null
            red2: number | null
            red3: number | null
            blue1: number | null
            blue2: number | null
            blue3: number | null
            red1_scouter: string | null
            red2_scouter: string | null
            red3_scouter: string | null
            blue1_scouter: string | null
            blue2_scouter: string | null
            blue3_scouter: string | null
        }[]
    ): Promise<{ status: "ok" } | null> => {
        return await apiRequest<{ status: "ok" }>(
            "/matches/schedule",
            {
                method: "PATCH",
                body: {matches},
            }
        );
    };


    // --- Endpoint: POST /pit/{team}/submit ---
    const submitPitData = async (
        team: number | string,
        scouter: string,
        data: Record<string, any>
    ): Promise<
        boolean
    > => {
        return (await apiRequest(`/pit/${team}/submit`, {
            method: "POST",
            body: {scouter, data},
        })) !== null;
    };


    // --- Endpoint: GET /data/processed ---
    const getProcessedData = async (
        token: string | null,   // guest token
        event_key?: string
    ): Promise<Record<string, any> | null> => {

        // Start with admin headers (from cookies)
        const headers: HeadersInit = {
            ...getAuthHeaders(),  // includes x-uuid if present
        };

        // Decide endpoint based on whether admin UUID exists
        let endpoint = "/data/processed/admin";

        // If NO admin UUID exists, fall back to guest endpoint + token
        if (!headers["x-uuid"]) {
            endpoint = "/data/processed/guest";

            if (token) {
                headers["x-guest-password"] = token;
            }
        }

        const query: Record<string, string> = {};
        if (event_key) query.event_key = event_key;

        const res = await apiRequest<Record<string, any>>(endpoint, {
            query,
            headers,
        });

        return res ?? null;
    };


    // --- Endpoint: GET /data/candy ---
    const getCandyData = async (): Promise<Record<string, any> | null> => {
        return await apiRequest<Record<string, any>>("/data/candy");
    };


    const getLatency = async (): Promise<{
        client_to_server_ns: number | null,
        server_to_client_ns: number | null,
        roundtrip_ns: number | null,
        db_latency: {
            tcp_latency_ns: number | null,
            db_query_latency_ns: number | null
        } | null
    }
    > => {
        try {
            const url = `${BASE_URL}/latency`;

            const clientRequestSentNs = performance.timeOrigin
                ? BigInt(Math.floor((performance.timeOrigin + performance.now()) * 1e6))
                : BigInt(Date.now()) * 1_000_000n;


            const res = await fetch(url, {
                headers: {
                    "client-sent-ns": clientRequestSentNs.toString()
                }
            });

            const clientReceivedNs = performance.timeOrigin
                ? BigInt(Math.floor((performance.timeOrigin + performance.now()) * 1e6))
                : BigInt(Date.now()) * 1_000_000n;

            if (!res.ok) {
                console.warn(`measure latency failed: ${res.status} ${res.statusText}`);
                return {client_to_server_ns: null, server_to_client_ns: null, roundtrip_ns: null, db_latency: null};
            }

            const json = await res.json();

            const serverReceiveNs = BigInt(json.server_receive_ns);
            const serverFinishNs = BigInt(json.server_finish_ns);

            const clientToServerNs = serverReceiveNs - clientRequestSentNs;

            const serverToClientNs = clientReceivedNs - serverFinishNs;

            const roundTripNs = clientReceivedNs - clientRequestSentNs;

            return {
                client_to_server_ns: clientToServerNs > 0n ? Number(clientToServerNs) : null,
                server_to_client_ns: serverToClientNs > 0n ? Number(serverToClientNs) : null,
                roundtrip_ns: roundTripNs > 0n ? Number(roundTripNs) : null,
                db_latency: json.latency ?? null,
            };
        } catch (err) {
            console.error("measureServerLatency failed:", err);
            return {client_to_server_ns: null, server_to_client_ns: null, roundtrip_ns: null, db_latency: null};
        }
    };


    return {
        login,
        logout,
        getMetadata,
        verify,
        ping,
        claimTeam,
        unclaimTeam,
        unclaimTeamBeacon,
        updateState,
        submitData,
        getTeamList,
        getScouterSchedule,
        getScouterState,
        submitPitData,
        getPitScoutStatus,
        getActiveMatches,
        getProcessedData,
        getCandyData,
        getLatency,
        getAllMatches,
        updateMatchSchedule,
        getFeatureFlags,
    };
}
