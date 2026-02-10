import {useEffect, useState} from "react"
import {Link, useNavigate} from "react-router-dom"
import {ArrowLeft, RotateCcw, RotateCw} from "lucide-react"
import {getSetting, getSettingSync, setSetting, type Settings} from "@/db/settingsDb.ts"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select"
import {Label} from "@/components/ui/label"
import CardLayoutWrapper from "@/components/wrappers/CardLayoutWrapper.tsx"
import {usePushNotifications} from "@/hooks/usePushNotifications.ts";
import {useAPI} from "@/hooks/useAPI.ts";
import {useClientEnvironment} from "@/hooks/useClientEnvironment.ts";


export default function MorePage() {
    const navigate = useNavigate()
    const [theme, setThemeState] = useState<Settings["theme"]>(() => getSettingSync("theme"))
    const {savePushSettings} = useAPI()
    const env = useClientEnvironment();

    const notificationsAllowed =
        env.os !== "iOS" || env.isIOSPWA;

    const {
        register: registerPush,
        canRegister,
        isIOSBlocked,
        getSubscription,
    } = usePushNotifications({
        enabled: notificationsAllowed,
    });

    const [orientation, setOrientationState] = useState<Settings["field_orientation"]>(
        () => getSettingSync("field_orientation") ?? "0"
    )
    const [visualAngle, setVisualAngle] = useState<number>(() => {
        const o = getSettingSync("field_orientation") ?? "0"
        return Number(o)
    })

    const [deviceType, setDeviceType] = useState<Settings["match_scouting_device_type"]>(
        () => getSettingSync("match_scouting_device_type") ?? "mobile"
    )

    const [abTestVariant, setAbTestVariant] = useState<Settings["match_ab_test"]>(
        () => getSettingSync("match_ab_test") ?? "default"
    )

    const [features, setFeatures] = useState({
        attendance: Boolean(getSettingSync("attendance")),
        match_scouting: Boolean(getSettingSync("match_scouting")),
    })

    const [hasSubscription, setHasSubscription] = useState(false)

    const ROTATE_STEP = 180  // temporary

    const rotate = (dir: 1 | -1) => {
        setOrientationState(o => {
            const next = (Number(o) + dir * ROTATE_STEP + 360) % 360
            return String(next) as Settings["field_orientation"]
        })

        setVisualAngle(a => a + dir * ROTATE_STEP)
    }

    useEffect(() => {
        if (!notificationsAllowed) return;

        const hydrate = async () => {
            if (Notification.permission !== "granted") {
                setHasSubscription(false);
                return;
            }

            const sub = await getSubscription();
            setHasSubscription(!!sub);
        };

        void hydrate();
    }, [notificationsAllowed]);

    const notificationsEnabled =
        Notification.permission === "granted" && hasSubscription

    // Load saved settings
    useEffect(() => {
        const load = async () => {
            const t = await getSetting("theme")
            const f = await getSetting("field_orientation")
            const d = await getSetting("match_scouting_device_type")
            const ab = await getSetting("match_ab_test")
            const att = await getSetting("attendance")
            const ms = await getSetting("match_scouting")

            setFeatures({
                attendance: !!att,
                match_scouting: !!ms
            })

            if (t) setThemeState(t)
            if (f) {
                setOrientationState(f)
                setVisualAngle(Number(f))
            }
            if (d) setDeviceType(d)
            if (ab) setAbTestVariant(ab)
        }
        void load()
    }, [])

    // Persist changes
    useEffect(() => {
        if (theme) void setSetting({theme})
    }, [theme])
    useEffect(() => {
        void setSetting({field_orientation: orientation})
    }, [orientation])
    useEffect(() => {
        if (deviceType) void setSetting({match_scouting_device_type: deviceType})
    }, [deviceType])
    useEffect(() => {
        if (abTestVariant) void setSetting({match_ab_test: abTestVariant})
    }, [abTestVariant])

    // Apply theme class to root
    useEffect(() => {
        const root = document.documentElement
        root.classList.remove("theme-2026", "theme-2025", "theme-dark", "theme-light", "theme-3473", "theme-968")
        root.classList.add(`theme-${theme}`)
    }, [theme])
    useEffect(() => {
        void setSetting({
            attendance: features.attendance,
            match_scouting: features.match_scouting
        })
    }, [features])

    const handleFeatureChange = async (key, value) => {
        const next = {...features, [key]: value}
        setFeatures(next)

        void setSetting(next)

        if (!notificationsEnabled) return

        const sub = await getSubscription()
        if (!sub) return

        await savePushSettings(sub.endpoint, next)
    }


    return (
        <CardLayoutWrapper showLogo={false}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold theme-h1-color">
                    More
                </h1>
                <button
                    onClick={() => navigate("/")}
                    className="transition theme-subtext-color hover:theme-text-color"
                    title="Back to Home"
                >
                    <ArrowLeft className="w-5 h-5"/>
                </button>
            </div>

            {/* Links Section */}
            <div className="mt-4 space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide theme-subtext-color">
                    Links
                </h2>

                <div className="space-y-3">
                    <Link
                        to="/candy"
                        className="block w-full px-4 py-2 rounded-md border transition theme-border theme-button-bg/50 theme-text hover:theme-button-hover text-center"
                    >
                        Candy Data
                    </Link>

                    <Link
                        to="/countdown"
                        className="block w-full px-4 py-2 rounded-md border transition theme-border theme-button-bg/50 theme-text hover:theme-button-hover text-center"
                    >
                        2026 Sprocket Countdown
                    </Link>

                    <Link
                        to="/attendance"
                        className="block w-full px-4 py-2 rounded-md border transition theme-border theme-button-bg/50 theme-text hover:theme-button-hover text-center"
                    >
                        Attendance
                    </Link>
                </div>
            </div>

            <hr className="my-6 theme-border"/>

            {/* Settings Section */}
            <div className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide theme-subtext-color">
                    Scouting Settings
                </h2>

                {/* Theme Selection */}
                <div className="space-y-1">
                    <Label className="theme-subtext-color">Theme</Label>
                    <Select
                        value={theme}
                        onValueChange={(val) =>
                            setThemeState(val as Settings["theme"])
                        }
                    >
                        <SelectTrigger
                            className="w-full border rounded-md transition
                                   theme-button-bg theme-border theme-text theme-button-hover"
                        >
                            <SelectValue placeholder="Select Theme"/>
                        </SelectTrigger>

                        <SelectContent
                            className="rounded-md shadow-lg transition
                                   theme-border theme-button-bg"
                        >
                            {["dark", "light", "2025", "2026", "3473", "968"].map((val) => (
                                <SelectItem
                                    key={val}
                                    value={val}
                                    className="cursor-pointer transition hover:opacity-80 theme-text"
                                >
                                    {val === "3473"
                                        ? "Team 3473 (Sprocket)"
                                        : val === "968"
                                            ? "Team 968 (RAWC)"
                                            : val.charAt(0).toUpperCase() + val.slice(1)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Field Orientation */}
                <div className="space-y-2">
                    <Label className="theme-subtext-color">
                        Field Orientation
                    </Label>
                    <p className="text-sm italic theme-subtext-color">
                        Rotate until the field image matches what you see from your current location.
                    </p>

                    <div className="flex flex-col items-center gap-3">
                        <div
                            className="
                            relative w-64 h-64 border rounded-lg overflow-hidden
                            shadow-[0_0_12px_rgba(0,0,0,0.25)] theme-border
                            transition-transform duration-700 ease-in-out
                        "
                            style={{
                                transform: `rotate(${visualAngle}deg)`,
                            }}
                        >
                            <img
                                src="/seasons/2026/Field.png"
                                alt="Field orientation preview"
                                className="absolute inset-0 w-full h-full object-contain
                                       pointer-events-none select-none"
                            />
                        </div>

                        <div className="flex gap-6 mt-2">
                            <button
                                type="button"
                                onClick={() => rotate(-1)}
                                className="p-2 rounded-full border transition hover:theme-button-hover theme-border"
                                title="Rotate Counterclockwise"
                            >
                                <RotateCcw className="w-5 h-5 theme-text"/>
                            </button>

                            <button
                                type="button"
                                onClick={() => rotate(1)}
                                className="p-2 rounded-full border transition hover:theme-button-hover theme-border"
                                title="Rotate Clockwise"
                            >
                                <RotateCw className="w-5 h-5 theme-text"/>
                            </button>

                        </div>
                    </div>
                </div>

                {/* Match Scouting Device */}
                <div className="space-y-1">
                    <Label className="theme-subtext-color">
                        Match Scouting Device
                    </Label>

                    <Select
                        value={deviceType}
                        onValueChange={(val) =>
                            setDeviceType(val as Settings["match_scouting_device_type"])
                        }
                    >
                        <SelectTrigger
                            className="w-full border rounded-md transition theme-button-bg theme-border theme-text theme-button-hover"
                        >
                            <SelectValue placeholder="Select device"/>
                        </SelectTrigger>

                        <SelectContent
                            className="rounded-md shadow-lg transition theme-border theme-button-bg"
                        >
                            <SelectItem value="mobile" className="theme-text">
                                Phone
                            </SelectItem>
                            <SelectItem value="tablet" className="theme-text">
                                Tablet
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* A/B Test Variant */}
                <div className="space-y-1">
                    <Label className="theme-subtext-color">
                        Match Scouting Interface
                    </Label>
                    <p className="text-xs italic theme-subtext-color mb-2">
                        Choose between different scouting layouts. Changes take effect on next session.
                    </p>

                    <Select
                        value={abTestVariant}
                        onValueChange={(val) =>
                            setAbTestVariant(val as Settings["match_ab_test"])
                        }
                    >
                        <SelectTrigger
                            className="w-full border rounded-md transition theme-button-bg theme-border theme-text theme-button-hover"
                        >
                            <SelectValue placeholder="Select interface"/>
                        </SelectTrigger>

                        <SelectContent
                            className="rounded-md shadow-lg transition theme-border theme-button-bg"
                        >
                            <SelectItem value="default" className="theme-text">
                                Stable
                            </SelectItem>
                            <SelectItem value="a" className="theme-text">
                                Variant A
                            </SelectItem>
                            <SelectItem value="b" className="theme-text">
                                Variant B
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <hr className="my-6 theme-border"/>

                {/* Notification Settings */}
                <div className="space-y-3">
                    <h2 className="text-sm font-semibold uppercase tracking-wide theme-subtext-color">
                        Notifications
                    </h2>

                    {/* Enable Notifications */}
                    {notificationsAllowed && !notificationsEnabled && (
                        <div className="space-y-1">
                            <button
                                disabled={!canRegister}
                                onClick={async () => {
                                    await registerPush();

                                    const sub = await getSubscription();
                                    const hasSub = !!sub;
                                    setHasSubscription(hasSub);

                                    if (hasSub && sub) {
                                        await savePushSettings(sub.endpoint, features);
                                    }
                                }}
                                className="w-full px-4 py-3 rounded-md border transition-all duration-200
                           theme-border theme-button-bg theme-text flex justify-between items-center
                           hover:opacity-90"
                            >
                                <span className="font-medium">Enable Notifications</span>
                                <span className="text-xs uppercase font-bold">Disabled</span>
                            </button>
                        </div>
                    )}

                    {/* iOS Safari message */}
                    {env.os === "iOS" && !env.isIOSPWA && (
                        <p className="text-xs text-yellow-400">
                            On iOS, notifications require installing the app to your home screen.
                        </p>
                    )}

                    {/* Category Toggles */}
                    {notificationsAllowed && (
                        <div className="grid grid-cols-1 gap-3 pt-2">
                            {/* Attendance */}
                            <button
                                disabled={!notificationsEnabled}
                                onClick={() =>
                                    handleFeatureChange("attendance", !features.attendance)
                                }
                                className={`w-full px-4 py-3 rounded-md border transition-all duration-200
                            flex justify-between items-center theme-border theme-button-bg theme-text
                            ${notificationsEnabled ? "hover:opacity-90" : "opacity-40 cursor-not-allowed"}`}
                            >
                                <span className="font-medium">Attendance Notifications</span>
                                <span className="text-xs uppercase font-bold">
                                    {features.attendance ? "On" : "Off"}
                                </span>
                            </button>

                            {/* Match Scouting — TEMP HIDDEN */}
                            {false && (
                                <button
                                    disabled={!notificationsEnabled}
                                    onClick={() =>
                                        handleFeatureChange("match_scouting", !features.match_scouting)
                                    }
                                    className={`w-full px-4 py-3 rounded-md border transition-all duration-200
                                flex justify-between items-center theme-border theme-button-bg theme-text
                                ${notificationsEnabled ? "hover:opacity-90" : "opacity-40 cursor-not-allowed"}`}
                                >
                                    <span className="font-medium">Match Scouting Notifications</span>
                                    <span className="text-xs uppercase font-bold">
                        {features.match_scouting ? "On" : "Off"}
                    </span>
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Privacy Policy */}
            <div className="mt-8 text-center">
                <Link
                    to="/privacy-policy"
                    className="text-xs theme-subtext-color hover:underline"
                >
                    Privacy Policy
                </Link>
            </div>
        </CardLayoutWrapper>
    )
}