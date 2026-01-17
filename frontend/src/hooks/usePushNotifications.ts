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

export function usePushNotifications() {
    const env = useClientEnvironment()
    const {subscribePushNotif} = useAPI()

    const [permission, setPermission] =
        useState<NotificationPermission>(Notification.permission)

    const [status, setStatus] = useState<PushStatus>("ready")

    const isSupported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window

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
                setStatus("denied")
                return
            }

            const registration = await registerServiceWorker()

            const subscription = await subscribeToPush(
                registration,
                import.meta.env.VITE_VAPID_KEY
            )

            await subscribePushNotif({
                subscription,
                os: env.os,
                browser: env.browser,
                deviceType: env.deviceType,
                isPWA: env.isPWA,
                isIOSPWA: env.isIOSPWA,
            })

            setStatus("granted")
        } catch (err) {
            console.error("Push registration failed", err)
            setStatus("error")
        }
    }

    return {
        register,
        permission,
        status,
        canRegister,
        isIOSBlocked,
    }
}
