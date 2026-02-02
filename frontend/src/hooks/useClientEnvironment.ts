import { useEffect, useSyncExternalStore } from "react";
import { useAPI } from "./useAPI.ts";

export interface ClientEnvironment {
    isPWA: boolean;
    isIOSPWA: boolean;
    isStandalone: boolean;
    userAgent: string;
    os: "iOS" | "Android" | "Windows" | "macOS" | "Linux" | "Other";
    browser: "Chrome" | "Safari" | "Firefox" | "Edge" | "Other";
    deviceType: "mobile" | "tablet" | "desktop";
    isTouchDevice: boolean;

    serverOnline: boolean;
    serverChecked: boolean;
    isOnline: boolean;
    isWifi: boolean;
    networkQuality: number;
    qualityLevel: 0 | 1 | 2 | 3 | 4 | 5;
    effectiveType: string | null;
    rawSpeedMbps: number | null;
    rawRTT: number | null;

    bluetoothAvailable: boolean;
    usbAvailable: boolean;
    hasCamera: boolean;
    hasMicrophone: boolean;

    batteryLevel: number | null;
    batteryCharging: boolean | null;
}

// Singleton store
class ClientEnvironmentStore {
    private listeners = new Set<() => void>();
    private state: ClientEnvironment;
    private pingInterval: NodeJS.Timeout | null = null;
    private pingFn: (() => Promise<boolean>) | null = null;

    constructor() {
        this.state = {
            isPWA: false,
            isIOSPWA: false,
            isStandalone: false,
            userAgent: navigator.userAgent,
            os: "Other",
            browser: "Other",
            deviceType: "desktop",
            isTouchDevice: false,

            serverOnline: false,
            serverChecked: false,
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
        };

        this.initialize();
    }

    private initialize() {
        this.updatePlatformInfo();
        this.updateNetworkStatus();

        window.addEventListener("online", this.updateNetworkStatus);
        window.addEventListener("offline", this.updateNetworkStatus);
        ((navigator as any).connection)?.addEventListener("change", this.updateNetworkStatus);
    }

    private updatePlatformInfo = () => {
        const ua = navigator.userAgent;

        const isIOS = /iPhone|iPad|iPod/i.test(ua);
        const isAndroid = /Android/i.test(ua);
        const isTablet = /iPad|Tablet/i.test(ua);
        const isMobile = /Mobi|Android|iPhone|iPod/i.test(ua);
        const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

        let deviceType: ClientEnvironment["deviceType"] = "desktop";
        if (isTablet) deviceType = "tablet";
        else if (isMobile) deviceType = "mobile";

        let os: ClientEnvironment["os"] = "Other";
        if (isIOS) os = "iOS";
        else if (isAndroid) os = "Android";
        else if (navigator.appVersion.includes("Win")) os = "Windows";
        else if (navigator.appVersion.includes("Mac")) os = "macOS";
        else if (navigator.appVersion.includes("Linux")) os = "Linux";

        let browser: ClientEnvironment["browser"] = "Other";
        if (/Chrome/i.test(ua)) browser = "Chrome";
        else if (/Safari/i.test(ua)) browser = "Safari";
        else if (/Firefox/i.test(ua)) browser = "Firefox";
        else if (/Edg/i.test(ua)) browser = "Edge";

        const isStandalone =
            window.matchMedia("(display-mode: standalone)").matches ||
            (navigator as any).standalone === true;
        const isPWA = isStandalone || window.location.protocol === "app:";
        const isIOSPWA = isIOS && (navigator as any).standalone === true;

        this.setState({
            userAgent: ua,
            os,
            browser,
            deviceType,
            isTouchDevice: isTouch,
            isPWA,
            isStandalone,
            isIOSPWA,
        });
    };

    private updateNetworkStatus = () => {
        const nav = navigator as any;
        const conn = nav.connection || {};
        const type = conn.type ?? null;
        const effectiveType = conn.effectiveType ?? null;
        const downlink = typeof conn.downlink === "number" ? conn.downlink : null;
        const rtt = typeof conn.rtt === "number" ? conn.rtt : null;
        const isOnline = navigator.onLine;
        const isWifi = type === "wifi" || effectiveType === "4g" || (downlink ?? 0) > 10;

        const quality =
            !isOnline || downlink === null || rtt === null
                ? 0
                : Math.min(1, (downlink / 10) * 0.7 + (1 - Math.min(rtt / 300, 1)) * 0.3);

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
                : 0;

        this.setState({
            isOnline,
            isWifi,
            networkQuality: Math.round(quality * 100) / 100,
            qualityLevel: level,
            effectiveType,
            rawSpeedMbps: downlink,
            rawRTT: rtt,
        });
    };

    initializePing(pingFn: () => Promise<boolean>) {
        if (this.pingInterval) return; // Already initialized

        this.pingFn = pingFn;

        const pingServer = async () => {
            if (!this.pingFn) return;
            const result = await this.pingFn();
            this.setState({
                serverOnline: result,
                serverChecked: true,
            });
        };

        void pingServer(); // Initial ping
        this.pingInterval = setInterval(pingServer, 4500);
    }

    private setState(partial: Partial<ClientEnvironment>) {
        this.state = { ...this.state, ...partial };
        this.listeners.forEach(listener => listener());
    }

    getState() {
        return this.state;
    }

    subscribe(listener: () => void) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
}

// Create singleton instance
const store = new ClientEnvironmentStore();

// Hook that uses the singleton store
export function useClientEnvironment(): ClientEnvironment {
    const { ping } = useAPI();

    // Initialize ping once
    useEffect(() => {
        store.initializePing(ping);
    }, [ping]);

    // Subscribe to store updates using React's useSyncExternalStore
    const env = useSyncExternalStore(
        (listener) => store.subscribe(listener),
        () => store.getState(),
        () => store.getState()
    );

    return env;
}