import React, {useEffect, useState} from "react"
import {useNavigate} from "react-router-dom"
import {useAPI} from "@/hooks/useAPI.ts"
import {useClientEnvironment} from "@/hooks/useClientEnvironment.ts"

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
                                     children,
                                 }: {
    permission: "dev" | "admin" | "match_scouting" | "pit_scouting"
    device?: "mobile" | "desktop"
    dialogTheme?: "light" | "dark"
    children: React.ReactNode
}) {
    const [authorized, setAuthorized] = useState<boolean | null>(null)
    const [deviceWarning, setDeviceWarning] = useState<boolean>(false)
    const [ignoredWarning, setIgnoredWarning] = useState<boolean>(false)

    const navigate = useNavigate()
    const {verify} = useAPI()
    const {isOnline, serverOnline, deviceType} = useClientEnvironment()

    useEffect(() => {
        const checkAuth = async () => {
            if ((!isOnline || !serverOnline) && (permission === "match_scouting" || permission === "pit_scouting")) {
                setAuthorized(true)
                return
            }

            const result = await verify()
            const perms = result.permissions as Partial<Record<typeof permission, boolean>>
            const allowed = result.success && !!perms[permission]
            setAuthorized(allowed)
        }

        void checkAuth()
    }, [permission, isOnline, serverOnline, verify])

    useEffect(() => {
        if (authorized !== true) return // skip if not authorized yet
        if (device && deviceType !== device) {
            setDeviceWarning(true)
        }
    }, [authorized, device, deviceType])


    const isLight = dialogTheme === "light"
    const overlayBg = isLight ? "bg-white text-black" : "bg-zinc-800 text-white"
    const border = isLight ? "border border-gray-300 shadow-lg" : "border border-zinc-700 shadow-xl"

    if (authorized === null) {
        return (
            <div className={`w-screen h-screen  text-white flex items-center justify-center ${isLight ? "bg-zinc-100" : "bg-zinc-950"}`}>
                <div>Checking access…</div>
            </div>
        )
    }

    if (!authorized) {
        return (
            <div className="w-screen h-screen bg-zinc-950 text-white flex flex-col items-center justify-center">
                <div className={`rounded-xl p-8 text-center max-w-sm ${overlayBg} ${border}`}>
                    <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
                    <p className="mb-6">
                        You lack <span
                        className="font-semibold text-red-400">{PERMISSION_LABELS[permission]}</span> permission or your
                        session expired.
                    </p>
                    <button
                        onClick={() => navigate("/")}
                        className="px-4 py-2 bg-red-600 rounded-md hover:bg-red-700 transition"
                    >
                        Return to Login
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="relative min-h-screen w-screen">
            <div className={deviceWarning && !ignoredWarning ? "brightness-50 pointer-events-none" : ""}>
                {children}
            </div>

            {deviceWarning && !ignoredWarning && (
                <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center z-50">
                    <div className={`rounded-lg p-6 max-w-sm text-center ${overlayBg} ${border}`}>
                        <h2 className="text-xl font-bold mb-4">Device Mismatch</h2>
                        <p className="mb-6">
                            This page is intended for <strong>{device}</strong> devices.<br/>
                            You're currently on a <strong>{deviceType}</strong>.
                        </p>
                        <div className="flex justify-center gap-4">
                            <button
                                className={`px-4 py-2 rounded font-medium transition ${
                                    isLight
                                        ? "bg-gray-200 text-black hover:bg-gray-400"
                                        : "bg-zinc-700 text-white hover:bg-zinc-600"
                                }`}
                                onClick={() => navigate("/")}>
                                {isLight ? "Return" : "Back"}
                            </button>

                            <button
                                className={`px-4 py-2 rounded font-medium transition ${
                                    isLight
                                        ? "bg-blue-600 text-white hover:bg-blue-700"
                                        : "bg-blue-500 text-white hover:bg-blue-400"
                                }`}
                                onClick={() => setIgnoredWarning(true)}>
                                {isLight ? "Proceed" : "Continue Anyway"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
