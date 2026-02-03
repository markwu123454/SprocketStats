import {useEffect, useRef, useState} from "react"
import {useNavigate} from "react-router-dom"
import {useClientEnvironment} from "@/hooks/useClientEnvironment.ts"
import {getSettingSync, type Settings} from "@/db/settingsDb.ts"
import CardLayoutWrapper from "@/components/wrappers/CardLayoutWrapper.tsx"
import useFeatureFlags from "@/hooks/useFeatureFlags.ts";
import {useAuth} from "@/hooks/useAuth.ts";

declare global {
    interface Window {
        google?: any
    }
}

export default function HomePage() {
    const {name, permissions, error, isAuthenticated, isAuthenticating, isLoading, login, logout} = useAuth()
    const {isOnline, serverOnline} = useClientEnvironment()
    const featureFlags = useFeatureFlags()

    const googleDivRef = useRef<HTMLDivElement | null>(null)
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
        {label: "More", key: "more", path: "/more"},
    ]

    const navigate = useNavigate()

    // Render Google Sign-In button
    const renderGoogleButton = () => {
        let attempts = 0

        const tryRender = () => {
            const gsi = window.google?.accounts?.id
            const div = googleDivRef.current

            if (!gsi || !div) {
                if (attempts++ < 50) {
                    setTimeout(tryRender, 100)
                }
                return
            }

            gsi.initialize({
                client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
                callback: async (response: any) => {
                    const result = await login(response.credential)

                    if (result.success) {
                        setMessageIndex(
                            Math.floor(Math.random() * greetings.length)
                        )
                        gsi.disableAutoSelect()
                    }
                    // errors are already surfaced via useAuth().error
                },
                auto_select: false,
                cancel_on_tap_outside: true,
            })

            const buttonTheme =
                theme === "dark"
                    ? "filled_black"
                    : theme === "2025"
                        ? "filled_blue"
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
        if (!isAuthenticated) return
        if (messageIndex !== null) return

        setMessageIndex(
            Math.floor(Math.random() * greetings.length)
        )
    }, [isAuthenticated, messageIndex, greetings.length])

    useEffect(() => {
        if (isLoading) return
        if (!isAuthenticated) {
            renderGoogleButton()
        }
    }, [serverOnline, isLoading, isAuthenticated])

    // Configure google signin state
    useEffect(() => {
        if (!window.google) return
        if (!isAuthenticated) window.google.accounts.id.prompt()
        else window.google.accounts.id.cancel()
    }, [isAuthenticated])

    const handleNavigate = (path: string | null) => path && navigate(path)

    // Deletes stored data which effectively logs out, and redisplay google button
    const handleLogout = async () => {
        await logout()
        setMessageIndex(null)
        setTimeout(renderGoogleButton, 100)
    }

    const loadingMessage =
        wakingUp
            ? "Waking up backend service..."
            : isLoading
                ? "Checking session…"
                : isAuthenticating
                    ? "Logging you in…"
                    : null;

    return (<>
            <CardLayoutWrapper showLogo={true}>
                <div className="space-y-1">
                    <h1 className="text-2xl font-bold theme-h1-color">
                        {isAuthenticated ? "Welcome back" : "Login"}
                    </h1>
                </div>

                <div className="flex flex-col items-center space-y-2 min-h-17">
                    {loadingMessage ? (
                        <div className="flex flex-col items-center space-y-2">
                            <div
                                className="h-6 w-6 rounded-full border-2 border-zinc-300/30 border-t-zinc-400 animate-spin"/>
                            <p className="text-sm theme-subtext-color">
                                {loadingMessage}
                            </p>
                        </div>
                    ) : isAuthenticated ? (
                        <div className="flex flex-col items-center space-y-2">
                            <div className="h-6 w-6 pointer-events-none" aria-hidden="true"/>
                            <p className="text-sm theme-subtext-color">
                                {greetings[messageIndex!]}
                            </p>
                        </div>
                    ) : (
                        <>
                            <p className="text-sm theme-subtext-color">
                                Sign in with your Google account
                            </p>
                            <div ref={googleDivRef}></div>
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
                            if (key === "more") {
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

                    <div className="pt-4 border-t theme-border text-center min-h-7">
                        {isAuthenticated ? (
                            <p className="text-xs text-zinc-500">
                                Logged in as <span className="text-zinc-400">{name}</span>.{" "}
                                <button
                                    onClick={handleLogout}
                                    className="underline hover:text-zinc-300 transition-colors"
                                >
                                    Log out
                                </button>
                            </p>
                        ) : (
                            <p className="text-xs text-zinc-500 opacity-40">
                                Not signed in
                            </p>
                        )}
                    </div>

                </div>
            </CardLayoutWrapper>
        </>
    )
}
