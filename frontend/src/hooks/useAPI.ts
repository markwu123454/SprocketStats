import type {TeamInfo, MatchScoutingData, MatchType, AllianceType} from '@/types'

const BASE_URL = import.meta.env.VITE_BACKEND_URL;
const UUID_COOKIE = "scouting_uuid"
const NAME_COOKIE = "scouting_name"

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


// --- Hook ---
export function useAPI() {
    let cachedName: string | null = null

    type SubmitPayload = {
        match_type: MatchType;
        alliance: AllianceType;
        scouter: string;
        data: Omit<MatchScoutingData,
            'match' |
            'alliance' |
            'teamNumber' |
            'scouter'
        >;
    }

    const getCachedName = (): string | null => cachedName

    // --- Endpoint: GET /ping ---
    const ping = async (): Promise<boolean> => {
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
    }> => {
        deleteCookie(UUID_COOKIE)
        deleteCookie(NAME_COOKIE)

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
            setCookie(UUID_COOKIE, json.uuid, 1)
            setCookie(NAME_COOKIE, json.name, 1)
            cachedName = json.name
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

    // --- Endpoint: GET /auth/verify ---
    const verify = async (): Promise<{
        success: boolean
        name?: string
        permissions?: {
            dev: boolean
            admin: boolean
            match_scouting: boolean
            pit_scouting: boolean
        }
    }> => {
        try {
            const res = await fetch(`${BASE_URL}/auth/verify`, {
                headers: getAuthHeaders(),
            })
            if (!res.ok) return {success: false}

            const json = await res.json()
            cachedName = json.name
            return {
                success: true,
                name: json.name,
                permissions: json.permissions,
            }
        } catch {
            return {success: false}
        }
    }

    // --- Endpoint: GET /admin/matches/filter ---
    const getFilteredMatches = async (
        scouters?: string[],
        statuses?: string[]
    ): Promise<
        {
            match: number;
            match_type: string;
            team: string;
            alliance: string;
            scouter: string | null;
            status: string;
            last_modified: number;
        }[]
    > => {
        try {
            const params = new URLSearchParams();
            if (scouters)
                for (const s of scouters)
                    params.append("scouters", s);
            if (statuses)
                for (const st of statuses)
                    params.append("statuses", st);

            const res = await fetch(
                `${BASE_URL}/admin/matches/filter?${params.toString()}`,
                {headers: getAuthHeaders()}
            );

            if (!res.ok) {
                console.warn(`getFilteredMatches failed: ${res.status} ${res.statusText}`);
                return [];
            }

            const json = await res.json();
            if (!json || !Array.isArray(json.matches)) {
                console.error("getFilteredMatches: malformed response", json);
                return [];
            }

            return json.matches;
        } catch (err) {
            console.error("getFilteredMatches failed:", err);
            return [];
        }
    };


    // --- Endpoint: GET /team/{team} ---
    const getTeamBasicInfo = async (
        team: number | string
    ): Promise<{
        number: number
        nickname: string
        rookie_year: number | null
        scouted: boolean
    } | null> => {
        try {
            const res = await fetch(`${BASE_URL}/team/${team}`, {
                headers: getAuthHeaders(),
            });

            if (!res.ok) {
                console.warn(`getTeamBasicInfo failed: ${res.status} ${res.statusText}`);
                return null;
            }

            const json = await res.json();

            // --- Strict shape validation ---
            if (
                typeof json.number !== "number" ||
                typeof json.nickname !== "string" ||
                !("rookie_year" in json) ||
                typeof json.scouted !== "boolean"
            ) {
                console.error("getTeamBasicInfo: malformed response", json);
                return null;
            }

            return json;
        } catch (err) {
            console.error("getTeamBasicInfo failed:", err);
            return null;
        }
    };


    // --- Endpoint: POST /scouting/{m_type}/{match}/{team}/submit ---
    const submitData = async (
        match: number,
        team: number,
        fullData: SubmitPayload
    ): Promise<boolean> => {
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
    ): Promise<boolean> => {
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
    ): Promise<boolean> => {
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

    // --- Endpoint: PATCH /scouting/{m_type}/{match}/{team}/state ---
    const updateState = async (
        match: number,
        team: number,
        match_type: MatchType,
        scouter: string,
        phase: "pre" | "auto" | "teleop" | "post" | "submitted"
    ): Promise<boolean> => {
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
    ): Promise<TeamInfo[]> => {
        try {
            const res = await fetch(`${BASE_URL}/match/${m_type}/${match}/${alliance}`, {
                headers: getAuthHeaders(),
            })
            if (!res.ok) {
                console.warn(`getTeamList: ${res.status} ${res.statusText}`)
                return []
            }

            const json = await res.json()
            if (!json || !Array.isArray(json.teams)) {
                console.error("getTeamList: Malformed response", json)
                return []
            }

            return json.teams
        } catch (err) {
            console.error('getTeamList failed:', err)
            return []
        }
    }

    // --- Endpoint: GET /status/All/All ---
    const getAllStatuses = async (): Promise<Record<string, Record<number, {
            status: string;
            scouter: string | null
        }>>
        | null> => {
        try {
            const res = await fetch(`${BASE_URL}/status/All/All`, {
                headers: getAuthHeaders(),
            })
            return res.ok ? await res.json() : null
        } catch (err) {
            console.error('getAllStatuses failed:', err)
            return null
        }
    }

    // --- Endpoint: GET /match/{m_type}/{match}/{alliance}/state ---
    const getScouterState = async (
        match: number,
        m_type: MatchType,
        alliance: 'red' | 'blue'
    ): Promise<{
        timestamp: string | null
        teams: Record<string, { scouter: string | null }>
    } | null> => {
        try {
            const res = await fetch(`${BASE_URL}/match/${m_type}/${match}/${alliance}/state`, {
                headers: getAuthHeaders(),
            });

            if (!res.ok) {
                console.warn(`getScouterState: ${res.status} ${res.statusText}`);
                return null;
            }

            const json = await res.json();

            if (!json || typeof json !== 'object' || !json.teams) {
                console.error('getScouterState: malformed response', json);
                return null;
            }

            return {
                timestamp: json.timestamp ?? null,
                teams: json.teams,
            };
        } catch (err) {
            console.error('getScouterState failed:', err);
            return null;
        }
    };

    // --- Endpoint: GET /pit/teams ---
    const getPitTeams = async (): Promise<
        { team: number | string; scouter: string | null; status: string; last_modified: number }[]
    > => {
        try {
            const res = await fetch(`${BASE_URL}/pit/teams`, {
                headers: getAuthHeaders(),
            });

            if (!res.ok) {
                console.warn(`getPitTeams failed: ${res.statusText}`);
                return [];
            }

            const json = await res.json();
            if (!Array.isArray(json.teams)) {
                console.error("getPitTeams: malformed response", json);
                return [];
            }

            return json.teams;
        } catch (err) {
            console.error("getPitTeams failed:", err);
            return [];
        }
    };

    // --- Endpoint: GET /pit/{team} ---
    const getPitData = async (
        team: number | string
    ): Promise<{
        team: number | string;
        scouter: string | null;
        status: string;
        data: Record<string, any>;
        last_modified: number;
    } | null> => {
        try {
            const res = await fetch(`${BASE_URL}/pit/${team}`, {
                headers: getAuthHeaders(),
            });

            if (!res.ok) {
                console.warn(`getPitData failed: ${res.statusText}`);
                return null;
            }

            return await res.json();
        } catch (err) {
            console.error("getPitData failed:", err);
            return null;
        }
    };

    // --- Endpoint: POST /pit/{team} ---
    const updatePitData = async (
        team: number | string,
        scouter: string,
        data: Record<string, any>,
        status: "pre" | "submitted" | "unclaimed" | "in_progress" = "pre"
    ): Promise<boolean> => {
        try {
            const body = {
                scouter,
                status,
                data,
            };

            const res = await fetch(`${BASE_URL}/pit/${team}`, {
                method: "POST",
                headers: {
                    ...getAuthHeaders(),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                console.warn(`updatePitData failed: ${res.status} ${res.statusText}`);
                return false;
            }

            return true;
        } catch (err) {
            console.error("updatePitData failed:", err);
            return false;
        }
    };

    // --- Endpoint: POST /pit/{team}/submit ---
    const submitPitData = async (
        team: number | string,
        scouter: string,
        data: Record<string, any>
    ): Promise<boolean> => {
        try {
            const body = {
                scouter,
                data,
            };

            const res = await fetch(`${BASE_URL}/pit/${team}/submit`, {
                method: "POST",
                headers: {
                    ...getAuthHeaders(),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                console.warn(`submitPitData failed: ${res.status} ${res.statusText}`);
                return false;
            }

            return true;
        } catch (err) {
            console.error("submitPitData failed:", err);
            return false;
        }
    };

    // --- Endpoint: GET /data/processed ---
    const getProcessedData = async (
        event_key?: string
    ): Promise<Record<string, any> | null> => {
        try {
            const url = new URL(`${BASE_URL}/data/processed`);
            if (event_key) url.searchParams.set("event_key", event_key);

            const res = await fetch(url.toString(), {
                headers: getAuthHeaders(),
            });

            if (!res.ok) {
                console.warn(`getProcessedData failed: ${res.status} ${res.statusText}`);
                return null;
            }

            const json = await res.json();
            return json.data ?? null;
        } catch (err) {
            console.error("getProcessedData failed:", err);
            return null;
        }
    };


    return {
        login,
        verify,
        ping,
        claimTeam,
        unclaimTeam,
        updateState,
        submitData,
        getTeamList,
        getAllStatuses,
        getCachedName,
        getScouterState,
        getPitTeams,
        getPitData,
        updatePitData,
        submitPitData,
        getTeamBasicInfo,
        getFilteredMatches,
        getProcessedData,
    };
}
