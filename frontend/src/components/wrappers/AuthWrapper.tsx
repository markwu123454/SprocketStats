import React, {
    useEffect,
    useState,
    useRef,
    use,
} from "react"
import {Link, Outlet, useLocation} from "react-router-dom"
import {createPortal} from "react-dom"
import {useClientEnvironment} from "@/hooks/useClientEnvironment"
import useFeatureFlags from "@/hooks/useFeatureFlags.ts"
import {useAuth} from "@/hooks/useAuth"

const DEVICE_WARNING_STORAGE_KEY = "device_warning_silenced_routes"

function getSilencedRoutes(): string[] {
    try {
        return JSON.parse(
            localStorage.getItem(DEVICE_WARNING_STORAGE_KEY) ?? "[]"
        )
    } catch {
        return []
    }
}

function silenceRoute(route: string) {
    const existing = new Set(getSilencedRoutes())
    existing.add(route)
    localStorage.setItem(
        DEVICE_WARNING_STORAGE_KEY,
        JSON.stringify([...existing])
    )
}

class InlineRenderGuard extends React.Component<
    {
        onError: () => void
        children: React.ReactNode
    },
    { hasError: boolean }
> {
    state = {hasError: false}

    static getDerivedStateFromError() {
        return {hasError: true}
    }

    componentDidCatch(error: Error) {
        console.error("[AuthGate] Page render failed:", error)
        this.props.onError()
    }

    render() {
        if (this.state.hasError) {
            return null
        }

        return this.props.children
    }
}

const PERMISSION_LABELS: Record<string, string> = {
    dev: "Developer",
    admin: "Administrator",
    match_scouting: "Match Scouting",
    pit_scouting: "Pit Scouting",
}

export default function AuthGate({
    permission,
    device,
    dialogTheme = "dark",
    mode = "auto",
    children,
}: {
    permission: "dev" | "admin" | "match_scouting" | "pit_scouting"
    device?: "mobile" | "desktop"
    dialogTheme?: "light" | "dark"
    mode?: "pessimistic" | "optimistic" | "auto"
    children?: React.ReactNode
}) {
    const location = useLocation()
    const routeKey = location.pathname

    const { status, permissions } = useAuth()
    const { isOnline, serverOnline, deviceType } = useClientEnvironment()
    const featureFlags = useFeatureFlags()

    /* ---------------------------------------------
     * AUTH STATE (DERIVED)
     * -------------------------------------------*/

    const verifying =
        status === "loading" || status === "authenticating"

    const baseAuthorized =
        permissions?.[permission] === true

    const useOptimisticUX =
        mode === "optimistic"
            ? true
            : mode === "pessimistic"
                ? false
                : baseAuthorized

    const isScoutingPermission =
        permission === "match_scouting" || permission === "pit_scouting"

    const offlineAllowed =
        isScoutingPermission &&
        featureFlags.offlineScouting &&
        (!isOnline || !serverOnline)

    const authorized =
        offlineAllowed
            ? true
            : verifying && useOptimisticUX
                ? true
                : baseAuthorized
    // TODO: FIX ME

    const authBlocking =
        (!useOptimisticUX && verifying) || authorized === false

    /* ---------------------------------------------
     * DEVICE MISMATCH STATE
     * -------------------------------------------*/

    const [deviceWarning, setDeviceWarning] = useState(false)
    const [ignoredWarning, setIgnoredWarning] = useState(false)
    const dialogRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        if (!device || !deviceType) return
        if (authorized !== true) return

        const silencedRoutes = getSilencedRoutes()
        if (silencedRoutes.includes(routeKey)) return

        setDeviceWarning(deviceType !== device)
    }, [authorized, device, deviceType, routeKey])

    useEffect(() => {
        if (deviceWarning && !ignoredWarning) {
            dialogRef.current?.focus()
        }
    }, [deviceWarning, ignoredWarning])

    const deviceBlocking =
        !useOptimisticUX && deviceWarning && !ignoredWarning

    /* ---------------------------------------------
     * COMBINED BLOCKING
     * -------------------------------------------*/

    const blocking = authBlocking || deviceBlocking
    useEffect(() => {console.log(mode, status, verifying, baseAuthorized, useOptimisticUX, isScoutingPermission, offlineAllowed, authorized, deviceBlocking, blocking)}, [authorized, baseAuthorized, blocking, deviceBlocking, isScoutingPermission, offlineAllowed, status, useOptimisticUX, verifying])

    /* ---------------------------------------------
     * SCROLL LOCK
     * -------------------------------------------*/

    useEffect(() => {
        if (!blocking) return

        const original = document.body.style.overflow
        document.body.style.overflow = "hidden"

        return () => {
            document.body.style.overflow = original
        }
    }, [blocking])

    /* ---------------------------------------------
     * STYLES
     * -------------------------------------------*/


    const isLight = dialogTheme === "light"
    const overlayBg = isLight
        ? "bg-white text-black"
        : "bg-zinc-800 text-white"
    const border = isLight
        ? "border border-gray-300 shadow-lg"
        : "border border-zinc-700 shadow-xl"

    /* ---------------------------------------------
     * CONTENT
     * -------------------------------------------*/

    const [contentCrashed, setContentCrashed] = useState(false)
    const content = children ?? <Outlet />

    return (
        <>
            {!contentCrashed && (
                <div
                    className={
                        blocking
                            ? "pointer-events-none select-none blur-[1px]"
                            : undefined
                    }
                    aria-hidden={blocking}
                >
                    <InlineRenderGuard onError={() => setContentCrashed(true)}>
                        {content}
                    </InlineRenderGuard>
                </div>
            )}

            {contentCrashed && (
                <div
                    className={`fixed inset-0 ${
                        isLight
                            ? "bg-zinc-100 text-black"
                            : "bg-zinc-950 text-white"
                    }`}
                />
            )}

            {blocking &&
                createPortal(
                    <div
                        className={`fixed inset-0 z-9999 flex items-center justify-center ${
                            isLight
                                ? "bg-zinc-100/80 text-black"
                                : "bg-zinc-950/80 text-white"
                        }`}
                        role="dialog"
                        aria-modal="true"
                    >
                        {!useOptimisticUX && verifying && (
                            <div className="flex flex-col items-center gap-4">
                                <div className="w-8 h-8 border-4 border-t-transparent border-blue-500 rounded-full animate-spin" />
                                <div className="text-lg font-medium">
                                    Checking access…
                                </div>
                            </div>
                        )}

                        {!verifying && authorized === false && (
                            <div
                                className={`rounded-xl p-8 text-center max-w-sm ${overlayBg} ${border}`}
                            >
                                <h2 className="text-2xl font-bold mb-4">
                                    Access Denied
                                </h2>
                                <p className="mb-6">
                                    You lack{" "}
                                    <span className="font-semibold text-red-400">
                                        {PERMISSION_LABELS[permission]}
                                    </span>{" "}
                                    permission or your session expired.
                                </p>
                                <Link
                                    to="/"
                                    className="px-4 py-2 bg-red-600 rounded-md hover:bg-red-700 transition"
                                >
                                    Return to Login
                                </Link>
                            </div>
                        )}

                        {deviceWarning && !ignoredWarning && authorized && (
                            <div
                                ref={dialogRef}
                                tabIndex={-1}
                                className={`rounded-lg p-6 max-w-sm text-center ${overlayBg} ${border}`}
                            >
                                <h2 className="text-xl font-bold mb-4">
                                    Device Mismatch
                                </h2>
                                <p className="mb-6">
                                    Intended for <strong>{device}</strong>.
                                    <br />
                                    You are on <strong>{deviceType}</strong>.
                                </p>

                                <div className="flex flex-col gap-3">
                                    <div className="flex justify-center gap-4">
                                        <Link
                                            to="/"
                                            className="px-4 py-2 rounded bg-zinc-700 hover:bg-zinc-600"
                                        >
                                            Back
                                        </Link>
                                        <button
                                            onClick={() =>
                                                setIgnoredWarning(true)
                                            }
                                            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700"
                                        >
                                            Continue Anyway
                                        </button>
                                    </div>

                                    <button
                                        onClick={() => {
                                            silenceRoute(routeKey)
                                            setIgnoredWarning(true)
                                        }}
                                        className="text-sm text-zinc-400 hover:text-zinc-200 underline"
                                    >
                                        Don’t warn me again on this page
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>,
                    document.body
                )}
        </>
    )
}
