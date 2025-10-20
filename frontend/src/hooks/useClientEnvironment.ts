import {useEffect, useState} from "react"
import {useAPI} from "./useAPI.ts"

export interface ClientEnvironment {
    isPWA: boolean
    isIOSPWA: boolean
    isStandalone: boolean
    userAgent: string
    os: "iOS" | "Android" | "Windows" | "macOS" | "Linux" | "Other"
    browser: "Chrome" | "Safari" | "Firefox" | "Edge" | "Other"
    deviceType: "mobile" | "tablet" | "desktop"
    isTouchDevice: boolean

    serverOnline: boolean
    serverChecked: boolean   // ← added
    isOnline: boolean
    isWifi: boolean
    networkQuality: number
    qualityLevel: 0 | 1 | 2 | 3 | 4 | 5
    effectiveType: string | null
    rawSpeedMbps: number | null
    rawRTT: number | null

    bluetoothAvailable: boolean
    usbAvailable: boolean
    hasCamera: boolean
    hasMicrophone: boolean

    batteryLevel: number | null
    batteryCharging: boolean | null
}

export function useClientEnvironment(): ClientEnvironment {
    const [env, setEnv] = useState<ClientEnvironment>({
        isPWA: false,
        isIOSPWA: false,
        isStandalone: false,
        userAgent: navigator.userAgent,
        os: "Other",
        browser: "Other",
        deviceType: "desktop",
        isTouchDevice: false,

        serverOnline: false,
        serverChecked: false,     // ← added
        isOnline: navigator.onLine,
        isWifi: false,
        networkQuality: 0,
        qualityLevel: 0,
        effectiveType: null,
        rawSpeedMbps: null,
        rawRTT: null,

        bluetoothAvailable: "bluetooth" in navigator,
        usbAvailable: "usb" in navigator,
        hasCamera: false,
        hasMicrophone: false,

        batteryLevel: null,
        batteryCharging: null,
    })

    const {ping} = useAPI()

    useEffect(() => {
        const updatePlatformInfo = () => {
            const ua = navigator.userAgent

            const isIOS = /iPhone|iPad|iPod/i.test(ua)
            const isAndroid = /Android/i.test(ua)
            const isTablet = /iPad|Tablet/i.test(ua)
            const isMobile = /Mobi|Android|iPhone|iPod/i.test(ua)
            const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0

            let deviceType: ClientEnvironment["deviceType"] = "desktop"
            if (isTablet) deviceType = "tablet"
            else if (isMobile) deviceType = "mobile"

            let os: ClientEnvironment["os"] = "Other"
            if (isIOS) os = "iOS"
            else if (isAndroid) os = "Android"
            else if (navigator.appVersion.includes("Win")) os = "Windows"
            else if (navigator.appVersion.includes("Mac")) os = "macOS"
            else if (navigator.appVersion.includes("Linux")) os = "Linux"

            let browser: ClientEnvironment["browser"] = "Other"
            if (/Chrome/i.test(ua)) browser = "Chrome"
            else if (/Safari/i.test(ua)) browser = "Safari"
            else if (/Firefox/i.test(ua)) browser = "Firefox"
            else if (/Edg/i.test(ua)) browser = "Edge"

            const isStandalone =
                window.matchMedia("(display-mode: standalone)").matches ||
                (navigator as any).standalone === true
            const isPWA = isStandalone || window.location.protocol === "app:"
            const isIOSPWA = isIOS && (navigator as any).standalone === true

            setEnv(prev => ({
                ...prev,
                userAgent: ua,
                os,
                browser,
                deviceType,
                isTouchDevice: isTouch,
                isPWA,
                isStandalone,
                isIOSPWA,
            }))
        }

        const updateNetworkStatus = () => {
            const nav = navigator as any
            const conn = nav.connection || {}
            const type = conn.type ?? null
            const effectiveType = conn.effectiveType ?? null
            const downlink = typeof conn.downlink === "number" ? conn.downlink : null
            const rtt = typeof conn.rtt === "number" ? conn.rtt : null
            const isOnline = navigator.onLine
            const isWifi = type === "wifi" || effectiveType === "4g" || (downlink ?? 0) > 10

            const quality =
                !isOnline || downlink === null || rtt === null
                    ? 0
                    : Math.min(1, (downlink / 10) * 0.7 + (1 - Math.min(rtt / 300, 1)) * 0.3)

            const level: ClientEnvironment["qualityLevel"] =
                !isOnline
                    ? 0
                    : quality > 0.9
                    ? 5
                    : quality > 0.7
                    ? 4
                    : quality > 0.5
                    ? 3
                    : quality > 0.3
                    ? 2
                    : quality > 0.1
                    ? 1
                    : 0

            setEnv(prev => ({
                ...prev,
                isOnline,
                isWifi,
                networkQuality: Math.round(quality * 100) / 100,
                qualityLevel: level,
                effectiveType,
                rawSpeedMbps: downlink,
                rawRTT: rtt,
            }))
        }

        const pingServer = async () => {
            const result = await ping()
            setEnv(prev => ({
                ...prev,
                serverOnline: result,
                serverChecked: true,     // ← mark first ping done
            }))
        }

        updatePlatformInfo()
        updateNetworkStatus()
        void pingServer()

        const interval = setInterval(pingServer, 4500)
        window.addEventListener("online", updateNetworkStatus)
        window.addEventListener("offline", updateNetworkStatus)
        ;((navigator as any).connection)?.addEventListener("change", updateNetworkStatus)

        return () => {
            clearInterval(interval)
            window.removeEventListener("online", updateNetworkStatus)
            window.removeEventListener("offline", updateNetworkStatus)
            ;((navigator as any).connection)?.removeEventListener("change", updateNetworkStatus)
        }
    }, [])

    return env
}
