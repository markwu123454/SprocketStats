import {useEffect, useState} from "react"
import {useNavigate} from "react-router-dom"
import {ArrowLeft, RotateCcw, RotateCw} from "lucide-react"
import {getSetting, getSettingSync, setSetting, type Settings} from "@/db/settingsDb.ts"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select"
import {Label} from "@/components/ui/label"
import ThemedWrapper from "@/components/wrappers/ThemedWrapper.tsx"

export default function SettingLayout() {
    const navigate = useNavigate()
    const [theme, setThemeState] = useState<Settings["theme"]>(() => getSettingSync("theme", "2026"))
    const [orientation, setOrientationState] = useState<Settings["field_orientation"]>(
        () => getSettingSync("field_orientation", "0")
    )
    const [angle, setAngle] = useState<number>(
        () => (getSettingSync("field_orientation", "0") === "180" ? 180 : 0)
    )

    // Load saved settings
    useEffect(() => {
        const load = async () => {
            const t = await getSetting("theme")
            const f = await getSetting("field_orientation")
            if (t) setThemeState(t)
            if (f) {
                setOrientationState(f)
                setAngle(f === "180" ? 180 : 0)
            }
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

    // Apply theme class to root
    useEffect(() => {
        const root = document.documentElement
        root.classList.remove("theme-2026", "theme-2025", "theme-dark", "theme-light", "theme-3473")
        root.classList.add(`theme-${theme}`)
    }, [theme])

    return (
        <ThemedWrapper theme={theme ?? "2026"} showLogo={false}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <h1
                    className="text-2xl font-bold"
                    style={{color: "var(--themed-h1-color)"}}
                >
                    Settings
                </h1>
                <button
                    onClick={() => navigate("/")}
                    className="transition text-[var(--themed-subtext-color)] hover:text-[var(--themed-text-color)]"
                    title="Back to Home"
                >
                    <ArrowLeft className="w-5 h-5"/>
                </button>
            </div>

            <div className="space-y-4">
                {/* Theme Selection */}
                <div className="space-y-1">
                    <Label style={{color: "var(--themed-subtext-color)"}}>Theme</Label>
                    <Select
                        value={theme}
                        onValueChange={(val) => setThemeState(val as Settings["theme"])}
                    >
                        <SelectTrigger
                            className="
            w-full border rounded-md transition
            bg-[var(--themed-button-bg)] border-[var(--themed-border-color)]
            text-[var(--themed-text-color)]
            hover:bg-[var(--themed-button-hover)]
        "
                        >
                            <SelectValue placeholder="Select Theme"/>
                        </SelectTrigger>

                        <SelectContent
                            className="rounded-md shadow-lg border transition"
                            style={{
                                background:
                                    theme === "dark"
                                        ? "#18181b"
                                        : theme === "light"
                                            ? "#ffffff"
                                            : theme === "2025"
                                                ? "#0b234f"
                                                : theme === "2026"
                                                    ? "#fff8e5"
                                                    : "#4c1d95", // 3473 purple
                                color:
                                    theme === "dark"
                                        ? "#e4e4e7"
                                        : theme === "light"
                                            ? "#111"
                                            : theme === "2025"
                                                ? "#e2e8f0"
                                                : theme === "2026"
                                                    ? "#1a1a1a"
                                                    : "#e5deff",
                                borderColor:
                                    theme === "dark"
                                        ? "#27272a"
                                        : theme === "light"
                                            ? "#d4d4d8"
                                            : theme === "2025"
                                                ? "#1e3a8a"
                                                : theme === "2026"
                                                    ? "#e5dec4"
                                                    : "#6d28d9",
                            }}
                        >
                            {["dark", "light", "2025", "2026", "3473"].map((val) => (
                                <SelectItem
                                    key={val}
                                    value={val}
                                    className="cursor-pointer transition hover:opacity-80"
                                >
                                    {val === "3473"
                                        ? "Team 3473 (Sprocket)"
                                        : val.charAt(0).toUpperCase() + val.slice(1)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Field Orientation */}
                <div className="space-y-2">
                    <Label style={{color: "var(--themed-subtext-color)"}}>
                        Field Orientation
                    </Label>
                    <p
                        className="text-sm italic mb-2"
                        style={{color: "var(--themed-subtext-color)"}}
                    >
                        Rotate until the field image matches what you see from your current location.
                    </p>

                    <div className="flex flex-col items-center gap-3">
                        <div
                            className="
                                relative w-64 h-64 border rounded-lg overflow-hidden shadow-md
                                transition-transform duration-700 ease-in-out will-change-transform
                            "
                            style={{
                                transform: `rotate(${angle}deg)`,
                                transformOrigin: "50% 50%",
                                borderColor: "var(--themed-border-color)",
                            }}
                        >
                            <img
                                src={"/seasons/2025/Field.png"}
                                alt="Field orientation preview"
                                className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
                            />
                        </div>

                        <div className="flex gap-6 mt-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setAngle((a) => a - 180)
                                    setOrientationState((o) => (o === "0" ? "180" : "0"))
                                }}
                                className="
                                    p-2 rounded-full border transition
                                    hover:bg-[var(--themed-button-hover)]
                                "
                                style={{borderColor: "var(--themed-border-color)"}}
                                title="Rotate Counterclockwise"
                            >
                                <RotateCcw
                                    className="w-5 h-5"
                                    style={{color: "var(--themed-text-color)"}}
                                />
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setAngle((a) => a + 180)
                                    setOrientationState((o) => (o === "0" ? "180" : "0"))
                                }}
                                className="
                                    p-2 rounded-full border transition
                                    hover:bg-[var(--themed-button-hover)]
                                "
                                style={{borderColor: "var(--themed-border-color)"}}
                                title="Rotate Clockwise"
                            >
                                <RotateCw
                                    className="w-5 h-5"
                                    style={{color: "var(--themed-text-color)"}}
                                />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </ThemedWrapper>
    )
}
