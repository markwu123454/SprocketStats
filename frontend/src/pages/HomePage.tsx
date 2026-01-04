import {useEffect, useRef, useState} from "react"
import {useNavigate} from "react-router-dom"
import {useAPI} from "@/hooks/useAPI.ts"
import {useClientEnvironment} from "@/hooks/useClientEnvironment.ts"
import {getSettingSync, type Settings} from "@/db/settingsDb.ts"
import CardLayoutWrapper from "@/components/wrappers/CardLayoutWrapper.tsx"
import useFeatureFlags from "@/hooks/useFeatureFlags.ts";

declare global {
    interface Window {
        google?: any
    }
}

export default function HomePage() {
    const {login, verify, logout} = useAPI()
    const {isOnline, serverOnline} = useClientEnvironment()
    const featureFlags = useFeatureFlags()

    const googleDivRef = useRef<HTMLDivElement | null>(null)
    const [name, setName] = useState<string | null>(null)
    const [permissions, setPermissions] = useState<{
        dev: boolean
        admin: boolean
        match_scouting: boolean
        pit_scouting: boolean
        guest_access?: unknown
    } | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [messageIndex, setMessageIndex] = useState<number | null>(null)
    const [theme] = useState<Settings["theme"]>(() => getSettingSync("theme"))
    const wakingUp = isOnline && !serverOnline

    const greetings = [
        `Welcome, ${name}, to FIRST Age.`,
        `Logged in as ${name}.`,
        `Session active for ${name}.`,
        `Authenticated. Good to have you back, ${name}.`,
        `Scouting interface ready for ${name}.`,
    ]

    const privilegeButtons = [
        {label: "Dev", key: "dev", path: "/dev"},
        {label: "Admin Panel & Data", key: "admin", path: "/admin"},
        {label: "Match Scouting", key: "match_scouting", path: "/scouting/match"},
        {label: "Pit Scouting", key: "pit_scouting", path: "/scouting/pit"},
        {label: "Settings", key: "settings", path: "/settings"},
    ]

    const navigate = useNavigate()

    // Restore session on load
    useEffect(() => {
        const load = async () => {
            const result = await verify()
            if (result.success && result.name && result.permissions) {
                setName(result.name)
                setPermissions(result.permissions)
                setMessageIndex(Math.floor(Math.random() * greetings.length))
            }
        }
        void load()
    }, [])

    // Render Google Sign-In button
    const renderGoogleButton = () => {
        let attempts = 0
        const tryRender = () => {
            const gsi = window.google?.accounts?.id
            const div = googleDivRef.current
            if (!gsi || !div) {
                if (attempts++ < 50) setTimeout(tryRender, 100)
                return
            }

            gsi.initialize({
                client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
                callback: async (response: any) => {
                    const result = await login(response.credential)
                    if (result.success && result.name && result.permissions) {
                        setName(result.name)
                        setPermissions(result.permissions)
                        setError(null)
                        setMessageIndex(Math.floor(Math.random() * greetings.length))
                        gsi.disableAutoSelect()
                    } else {
                        setError(result.error ?? "Login failed")
                        setName(null)
                        setPermissions(null)
                    }
                },
                auto_select: false,
                cancel_on_tap_outside: true,
            })

            const buttonTheme =
                theme === "dark" ? "filled_black"
                    : theme === "2025" ? "filled_blue"
                        : "outline"

            gsi.renderButton(div, {
                theme: buttonTheme,
                size: "large",
                shape: "pill",
                text: "continue_with",
                width: 300,
            })
        }
        tryRender()
    }

    useEffect(() => {
        renderGoogleButton()
    }, [serverOnline])

    // Configure google signin state
    useEffect(() => {
        if (!window.google) return
        if (!name && !permissions) window.google.accounts.id.prompt()
        else window.google.accounts.id.cancel()
    }, [name, permissions])

    const handleNavigate = (path: string | null) => path && navigate(path)

    // Deletes stored data which effectively logs out, and redisplay google button
    const handleLogout = async () => {
        await logout?.()
        setName(null)
        setPermissions(null)
        setError(null)
        setMessageIndex(null)
        setTimeout(() => renderGoogleButton(), 100) // re-render login
    }

    return (
        <CardLayoutWrapper showLogo={true}>
            <div className="space-y-1">
                <h1 className="text-2xl font-bold theme-h1-color">
                    Login
                </h1>
            </div>

            <div className="flex flex-col items-center space-y-4">
                {wakingUp ? (
                    <div className="flex flex-col items-center space-y-2">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-zinc-400"/>
                        <p className="text-sm theme-subtext-color">
                            Waking up backend service...
                        </p>
                    </div>
                ) : name && permissions ? (
                    <>
                        <p className="text-sm theme-subtext-color">
                            {greetings[messageIndex!]}
                        </p>
                    </>
                ) : (
                    <>
                        <p className="text-sm theme-subtext-color">
                            Sign in with your Google account
                        </p>
                        <div id="googleSignInDiv" ref={googleDivRef}></div>
                        {error && <p className="text-red-500 text-sm">{error}</p>}
                    </>
                )}
            </div>

            <div
                className="space-y-2 pt-2 border-t transition-colors duration-500 theme-border"
            >
                <p className="text-sm theme-subtext-color">
                    Available Options
                </p>

                <div className="grid grid-cols-1 gap-3">
                    {privilegeButtons.map(({label, key, path}) => {
                        const isScoutingPage =
                            key === "match_scouting" || key === "pit_scouting";
                        const isRestrictedOffline = key === "dev" || key === "admin";
                        const offline = !isOnline || !serverOnline;

                        let enabled: boolean;

                        // Settings ALWAYS enabled
                        if (key === "settings") {
                            enabled = true;
                        }
                        // Scouting pages: offline OK only if feature flag allows it
                        else if (isScoutingPage && offline) {
                            enabled = Boolean(featureFlags.offlineScouting);
                        }
                        // Restricted pages (dev/admin): offline forbidden
                        else if (isRestrictedOffline && offline) {
                            enabled = false;
                        }
                        // Normal permission logic
                        else {
                            enabled = Boolean(
                                permissions?.[key as keyof typeof permissions]
                            );
                        }

                        return (
                            <button
                                key={key}
                                disabled={!enabled}
                                onClick={() => handleNavigate(path)}
                                className={`${
                                    enabled
                                        ? "theme-button-bg hover:theme-button-hover theme-text w-full flex items-center justify-between px-3 py-3 rounded transition text-sm"
                                        : "opacity-50 theme-button-bg cursor-not-allowed w-full flex items-center justify-between px-3 py-3 rounded transition text-sm"
                                }`}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>

                <div className="pt-4 border-t theme-border text-center">
                    {name && permissions && (<p className="text-xs text-zinc-500">
                        Logged in as <span className="text-zinc-400">{name}</span>.{" "}
                        <button
                            onClick={handleLogout}
                            className="underline hover:text-zinc-300 transition-colors"
                        >
                            Log out
                        </button>
                    </p>)}
                </div>

            </div>
        </CardLayoutWrapper>
    )
}
