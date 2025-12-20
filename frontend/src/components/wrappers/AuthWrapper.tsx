import React, {
    useEffect,
    useState,
    useCallback,
    useRef,
} from "react"
import {Outlet, useNavigate} from "react-router-dom"
import {createPortal} from "react-dom"
import {useAPI} from "@/hooks/useAPI"
import {useClientEnvironment} from "@/hooks/useClientEnvironment"

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
    permission: keyof typeof PERMISSION_LABELS
    device?: "mobile" | "desktop"
    dialogTheme?: "light" | "dark"
    mode?: "pessimistic" | "optimistic" | "auto"
    children?: React.ReactNode
}) {
    const navigate = useNavigate()
    const {verify} = useAPI()
    const {isOnline, serverOnline, deviceType} = useClientEnvironment()

    const cachedPerms = useRef<Record<string, boolean>>(
        JSON.parse(localStorage.getItem("perms") ?? "{}")
    )

    const effectiveOptimistic =
        mode === "optimistic"
            ? true
            : mode === "pessimistic"
                ? false
                : !!cachedPerms.current[permission]

    const [authorized, setAuthorized] = useState<boolean | null>(
        effectiveOptimistic ? true : null
    )
    const [verifying, setVerifying] = useState(true)
    const [deviceWarning, setDeviceWarning] = useState(false)
    const [ignoredWarning, setIgnoredWarning] = useState(false)

    const dialogRef = useRef<HTMLDivElement | null>(null)

    const memoizedVerify = useCallback(async () => {
        setVerifying(true)

        if (
            (!isOnline || !serverOnline) &&
            (permission === "match_scouting" || permission === "pit_scouting")
        ) {
            setAuthorized(true)
            setVerifying(false)
            return
        }

        const result = await verify()
        const perms = result.permissions ?? {}
        const success = result.success && !!perms[permission]

        setAuthorized(success)
        setVerifying(false)

        if (result.success) {
            localStorage.setItem("perms", JSON.stringify(perms))
        }
    }, [isOnline, serverOnline, verify, permission])

    useEffect(() => {
        if (authorized !== true || !device) return
        if (!deviceType) return // or deviceType === "unknown"

        setDeviceWarning(deviceType !== device)
    }, [authorized, device, deviceType])


    useEffect(() => {
        void memoizedVerify()
    }, [memoizedVerify])

    useEffect(() => {
        if (authorized === true && device && deviceType !== device) {
            setDeviceWarning(true)
        }
    }, [authorized, device, deviceType])

    const blocking =
        (verifying && !effectiveOptimistic) ||
        authorized === false ||
        (deviceWarning && !ignoredWarning)

    /** 🔒 Scroll lock */
    useEffect(() => {
        if (!blocking) return

        const original = document.body.style.overflow
        document.body.style.overflow = "hidden"

        return () => {
            document.body.style.overflow = original
        }
    }, [blocking])

    useEffect(() => {
        if (deviceWarning && !ignoredWarning) {
            dialogRef.current?.focus()
        }
    }, [deviceWarning, ignoredWarning])

    const isLight = dialogTheme === "light"
    const overlayBg = isLight
        ? "bg-white text-black"
        : "bg-zinc-800 text-white"
    const border = isLight
        ? "border border-gray-300 shadow-lg"
        : "border border-zinc-700 shadow-xl"

    /** ✅ NOT BLOCKING → NO DOM WRAPPER */
    if (!blocking) {
        return <>{children ?? <Outlet/>}</>
    }

    /** ⛔ BLOCKING UI (PORTAL) */
    return createPortal(
        <div
            className={`fixed inset-0 z-[9999] flex items-center justify-center ${
                isLight ? "bg-zinc-100 text-black" : "bg-zinc-950 text-white"
            }`}
            role="dialog"
            aria-modal="true"
        >
            {verifying && !effectiveOptimistic && (
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-4 border-t-transparent border-blue-500 rounded-full animate-spin"/>
                    <div className="text-lg font-medium">Checking access…</div>
                </div>
            )}

            {!verifying && authorized === false && (
                <div className={`rounded-xl p-8 text-center max-w-sm ${overlayBg} ${border}`}>
                    <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
                    <p className="mb-6">
                        You lack{" "}
                        <span className="font-semibold text-red-400">
                            {PERMISSION_LABELS[permission]}
                        </span>{" "}
                        permission or your session expired.
                    </p>
                    <button
                        onClick={() => navigate("/")}
                        className="px-4 py-2 bg-red-600 rounded-md hover:bg-red-700 transition"
                    >
                        Return to Login
                    </button>
                </div>
            )}

            {deviceWarning && !ignoredWarning && (
                <div
                    ref={dialogRef}
                    tabIndex={-1}
                    className={`rounded-lg p-6 max-w-sm text-center ${overlayBg} ${border}`}
                >
                    <h2 className="text-xl font-bold mb-4">Device Mismatch</h2>
                    <p className="mb-6">
                        Intended for <strong>{device}</strong> devices.<br/>
                        You are on <strong>{deviceType}</strong>.
                    </p>
                    <div className="flex justify-center gap-4">
                        <button
                            onClick={() => navigate("/")}
                            className="px-4 py-2 rounded bg-zinc-700 hover:bg-zinc-600"
                        >
                            Back
                        </button>
                        <button
                            onClick={() => setIgnoredWarning(true)}
                            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700"
                        >
                            Continue Anyway
                        </button>
                    </div>
                </div>
            )}
        </div>,
        document.body
    )
}
