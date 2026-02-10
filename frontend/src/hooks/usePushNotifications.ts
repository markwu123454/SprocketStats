import {useState} from "react"
import {registerServiceWorker, subscribeToPush} from "@/lib/push"
import {useAPI} from "@/hooks/useAPI"
import {useClientEnvironment} from "@/hooks/useClientEnvironment"

type PushStatus =
    | "unsupported"
    | "blocked"
    | "ready"
    | "granted"
    | "denied"
    | "error"

export function usePushNotifications({ enabled = true } = {}) {
    if (!enabled) {
        return {
            register: async () => {},
            canRegister: false,
            isIOSBlocked: false,
            getSubscription: async () => null,
        };
    }

    const env = useClientEnvironment()
    const {subscribePushNotif} = useAPI()

    const [permission, setPermission] =
        useState<NotificationPermission>(
            typeof Notification !== "undefined" ? Notification.permission : "default"
        )

    const [status, setStatus] = useState<PushStatus>("ready")

    const isSupported =
        typeof navigator !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        typeof Notification !== "undefined"

    const isIOSBlocked =
        env.os === "iOS" && !env.isIOSPWA

    const canRegister =
        isSupported &&
        !isIOSBlocked

    const register = async () => {
        if (!canRegister) {
            setStatus(isIOSBlocked ? "blocked" : "unsupported")
            return
        }

        try {
            const perm = await Notification.requestPermission()
            setPermission(perm)

            if (perm !== "granted") {
                localStorage.setItem("push_prompt_state", "3")
                setStatus("denied")
                return
            }

            const registration = await registerServiceWorker()

            const existing = await registration.pushManager.getSubscription()

            const currentKey = import.meta.env.VITE_VAPID_KEY
            const storedKey = localStorage.getItem("vapid_public_key")

            if (existing && storedKey !== currentKey) {
                await existing.unsubscribe()
            }

            const subscription = await subscribeToPush(
                registration,
                currentKey
            )

            localStorage.setItem("vapid_public_key", currentKey)

            await subscribePushNotif({
                subscription,
                os: env.os,
                browser: env.browser,
                deviceType: env.deviceType,
                isPWA: env.isPWA,
                isIOSPWA: env.isIOSPWA,
            })

            localStorage.setItem("push_prompt_state", "2")
            setStatus("granted")
        } catch (err) {
            console.error("Push registration failed", err)
            setStatus("error")
        }
    }

    const getSubscription = async (): Promise<PushSubscription | null> => {
        if (!("serviceWorker" in navigator)) return null
        const reg = await navigator.serviceWorker.ready
        return reg.pushManager.getSubscription()
    }


    return {
        register,
        permission,
        status,
        canRegister,
        isIOSBlocked,
        getSubscription,
    }
}