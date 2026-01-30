/**
 * useAuth returns:
 *
 * status             – Current authentication state
 * name               – Authenticated user display name
 * email              – Authenticated user email
 * permissions        – Granted permission flags
 * expiresAt          – Session expiration timestamp (ms)
 * error              – Last authentication error, if any
 *
 * isAuthenticated    – True when authenticated
 * isLoading          – True during initial session restore
 * isAuthenticating   – True during login request
 *
 * login              – Authenticate using a credential
 * logout             – Terminate the current session
 * refresh            – Verify and refresh the session
 */

import {useCallback, useEffect, useRef, useState} from "react"
import {useAPI} from "@/hooks/useAPI"

export type Permissions = {
    dev: boolean
    admin: boolean
    match_scouting: boolean
    pit_scouting: boolean
    guest_access?: unknown
}

type AuthStatus = "loading" | "authenticating" | "authenticated" | "unauthenticated"

type AuthState = {
    status: AuthStatus
    name: string | null
    email: string | null
    permissions: Permissions | null
    error: string | null
}

const VERIFY_TTL_MS = 10 * 60 * 1000      // 10 minutes
const REFRESH_SKEW_MS = 30 * 1000         // refresh 30s early

type PersistedAuth = {
    v: 1
    name: string
    email: string
    permissions: Permissions
    expiresAt: number
}

const AUTH_STORAGE_KEY = "auth:v1"

export function useAuth() {
    const {login: apiLogin, verify: apiVerify, logout: apiLogout} = useAPI()

    const expiresAtRef = useRef<number | null>(null)

    const persisted = loadPersistedAuth()
    function loadPersistedAuth(): PersistedAuth | null {
        try {
            const raw = localStorage.getItem(AUTH_STORAGE_KEY)
            if (!raw) return null

            const data = JSON.parse(raw) as PersistedAuth
            if (data.v !== 1) return null
            if (Date.now() > data.expiresAt) return null

            return data
        } catch {
            return null
        }
    }

    const [auth, setAuth] = useState<AuthState>(() => {
        if (persisted) {
            return {
                status: "authenticated",
                name: persisted.name,
                email: persisted.email,
                permissions: persisted.permissions,
                expiresAt: persisted.expiresAt,
                error: null,
            }
        }

        return {
            status: "loading",
            name: null,
            email: null,
            permissions: null,
            expiresAt: null,
            error: null,
        }
    })

    const refreshTimer = useRef<number | null>(null)
    const refreshRef = useRef<() => Promise<boolean>>(async () => false)

    const scheduleRefresh = useCallback((expiresAt: number) => {
        clearRefreshTimer()

        const delay = expiresAt - Date.now() - REFRESH_SKEW_MS
        if (delay <= 0) {
            void refreshRef.current?.()
            return
        }

        refreshTimer.current = window.setTimeout(() => {
            void refreshRef.current?.()
        }, delay)
    }, [])

    const clearRefreshTimer = () => {
        if (refreshTimer.current !== null) {
            clearTimeout(refreshTimer.current)
            refreshTimer.current = null
        }
    }

    const setUnauthenticated = useCallback((error?: string) => {
        clearRefreshTimer()
        localStorage.removeItem(AUTH_STORAGE_KEY)

        setAuth({
            status: "unauthenticated",
            name: null,
            email: null,
            permissions: null,
            error: error ?? null,
        })
    }, [])


    const setAuthenticated = useCallback((data: {
        name: string
        email: string
        permissions: Permissions
    }) => {
        const expiresAt = Date.now() + VERIFY_TTL_MS
        expiresAtRef.current = expiresAt

        const persisted: PersistedAuth = {
            v: 1,
            name: data.name,
            email: data.email,
            permissions: data.permissions,
            expiresAt,
        }

        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(persisted))

        setAuth({
            status: "authenticated",
            name: data.name,
            email: data.email,
            permissions: data.permissions,
            error: null,
        })

        scheduleRefresh(expiresAt)
    }, [scheduleRefresh])

    const refresh = useCallback(async () => {
        const res = await apiVerify()

        if (!res.success || !res.name || !res.permissions) {
            setUnauthenticated()
            return false
        }

        setAuthenticated({
            name: res.name,
            email: res.email,
            permissions: res.permissions,
        })

        return true
    }, [apiVerify, setAuthenticated, setUnauthenticated])

    const login = useCallback(
        async (credential: string) => {
            setAuth(prev => ({
                ...prev,
                status: "authenticating",
                error: null,
            }))

            const res = await apiLogin(credential)

            if (!res.success || !res.name || !res.email || !res.permissions) {
                setUnauthenticated(res.error)
                return {success: false, error: res.error}
            }

            setAuthenticated({
                name: res.name,
                email: res.email,
                permissions: res.permissions,
            })

            return {success: true}
        },
        [apiLogin, setAuthenticated, setUnauthenticated]
    )

    const logout = useCallback(async () => {
        clearRefreshTimer()
        await apiLogout()
        setUnauthenticated()
    }, [apiLogout, setUnauthenticated])

    // Initial session restore
    useEffect(() => {
        let mounted = true

        const init = async () => {
            const ok = await refresh()
            if (!ok && mounted) {
                setUnauthenticated()
            }
        }

        void init()

        return () => {
            mounted = false
            clearRefreshTimer()
        }
    }, [refresh, setUnauthenticated])

    useEffect(() => {
        refreshRef.current = refresh
    }, [refresh])

    return {
        // state
        status: auth.status,
        name: auth.name,
        email: auth.email,
        permissions: auth.permissions,
        expiresAt: expiresAtRef.current,
        error: auth.error,

        // derived
        isAuthenticated: auth.status === "authenticated",
        isLoading: auth.status === "loading",
        isAuthenticating: auth.status === "authenticating",

        // actions
        login,
        logout,
        refresh,
    }
}
