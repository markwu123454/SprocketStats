import {useEffect, useState} from "react"
import {useNavigate} from "react-router-dom"
import {ArrowLeft, RotateCcw, RotateCw} from "lucide-react"
import {getSetting, getSettingSync, setSetting, type Settings} from "@/db/settingsDb.ts"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select"
import {Label} from "@/components/ui/label"
import fieldImg from "@/assets/2025_Field.png"

export default function SettingLayout() {
    const navigate = useNavigate()
    const [theme, setThemeState] = useState<Settings["theme"]>(
        () => getSettingSync("theme", "2025")
    )
    const [orientation, setOrientationState] = useState<Settings["field_orientation"]>(
        () => getSettingSync("field_orientation", "0")
    )
    const [angle, setAngle] = useState<number>(
        () => (getSettingSync("field_orientation", "0") === "180" ? 180 : 0)
    )

    // Load current settings
    useEffect(() => {
        const load = async () => {
            const t = await getSetting("theme")
            const f = await getSetting("field_orientation")
            if (t) setThemeState(t)
            if (f) {
                setOrientationState(f)
                setAngle(f === "180" ? 180 : 0) // align visual with saved
            }
        }
        void load()
    }, [])

    // Persist changes automatically
    useEffect(() => {
        if (theme) void setSetting({theme})
    }, [theme])
    useEffect(() => {
        void setSetting({field_orientation: orientation})
    }, [orientation])

    // --- Apply global HTML theme class ---
    useEffect(() => {
        const root = document.documentElement
        root.classList.remove("theme-2026", "theme-2025", "theme-dark", "theme-light")
        root.classList.add(`theme-${theme}`)
    }, [theme])

    return (
        <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
            {/* --- Background fade layers --- */}
            {/* Ocean (2025) */}
            <div
                className={`
                absolute inset-0 bg-top bg-cover transition-opacity duration-700 ease-in-out
                ${theme === "2025" ? "opacity-100" : "opacity-0"}
                bg-[url('@/assets/backgrounds/2025_expanded.png')]
            `}
            />
            {/* Desert (2026) */}
            <div
                className={`
                absolute inset-0 bg-top bg-cover transition-opacity duration-700 ease-in-out
                ${theme === "2026" ? "opacity-100" : "opacity-0"}
                bg-[url('@/assets/backgrounds/2026_expanded.png')]
            `}
            />
            {/* Explicit Light & Dark backgrounds */}
            <div
                className={`
                absolute inset-0 transition-all duration-700 ease-in-out
                ${theme === "light" ? "bg-zinc-100 opacity-100" : ""}
                ${theme === "dark" ? "bg-zinc-950 opacity-100" : ""}
                ${theme === "2025" || theme === "2026" ? "opacity-0" : ""}
            `}
            />


            {/* --- Foreground content --- */}
            <div
                className={`
                relative z-10 max-w-md mx-4 flex flex-col items-center justify-center text-white
                theme-dark:text-white theme-light:text-zinc-900
                theme-2025:text-white theme-2026:text-[#3b2d00]
                transition-colors duration-500
            `}
            >
                <div
                    className={`
                    w-full max-w-md p-6 rounded-lg shadow-lg space-y-6 border
                    transition-colors duration-300 backdrop-blur-sm
                    theme-dark:bg-zinc-950/70 theme-dark:border-zinc-800
                    theme-light:bg-white theme-light:border-zinc-300
                    theme-2025:bg-[#0b234f]/70 theme-2025:border-[#1b3d80]
                    theme-2026:bg-[#fef7dc]/80 theme-2026:border-[#e6ddae]
                `}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <h1
                            className="
                            text-2xl font-bold
                            theme-2025:text-white
                            theme-2026:text-[#3b2d00]
                        "
                        >
                            Settings
                        </h1>
                        <button
                            onClick={() => navigate("/")}
                            className="
                            transition
                            theme-light:text-zinc-600 theme-light:hover:text-zinc-900
                            theme-dark:text-zinc-400 theme-dark:hover:text-white
                            theme-2025:text-zinc-300 theme-2025:hover:text-white
                            theme-2026:text-[#5a4800] theme-2026:hover:text-[#2d2100]
                        "
                            title="Back to Home"
                        >
                            <ArrowLeft className="w-5 h-5"/>
                        </button>
                    </div>

                    <div className="space-y-4">
                        {/* Theme Selection */}
                        <div className="space-y-1">
                            <Label
                                className="
                                theme-2025:text-zinc-200
                                theme-2026:text-[#3b2d00]
                            "
                            >
                                Theme
                            </Label>
                            <Select
                                value={theme}
                                onValueChange={(val) =>
                                    setThemeState(val as Settings["theme"])
                                }
                            >
                                <SelectTrigger
                                    className="
                                    w-full border rounded-md transition
                                    theme-light:bg-zinc-50 theme-light:border-zinc-300 theme-light:text-zinc-900 theme-light:hover:bg-zinc-100
                                    theme-dark:bg-zinc-900/90 theme-dark:border-zinc-700 theme-dark:text-white theme-dark:hover:border-zinc-500
                                    theme-2025:bg-[#102b6a]/80 theme-2025:border-[#2146a1] theme-2025:text-white theme-2025:hover:border-[#4d75d9]
                                    theme-2026:bg-[#fff8e5] theme-2026:border-[#d7cfa3] theme-2026:text-[#3b2d00] theme-2026:hover:bg-[#f7edcc]
                                "
                                >
                                    <SelectValue placeholder="Select Theme"/>
                                </SelectTrigger>
                                <SelectContent
                                    className="
                                    rounded-md shadow-lg border transition
                                    theme-light:bg-zinc-50 theme-light:border-zinc-200 theme-light:text-zinc-900
                                    theme-dark:bg-zinc-900/95 theme-dark:border-zinc-700 theme-dark:text-white
                                    theme-2025:bg-[#0b234f]/95 theme-2025:border-[#1b3d80] theme-2025:text-white
                                    theme-2026:bg-[#fff8e5] theme-2026:border-[#e3dcb4] theme-2026:text-[#3b2d00]
                                "
                                >
                                    {["dark", "light", "2025", "2026"].map((val) => (
                                        <SelectItem
                                            key={val}
                                            value={val}
                                            className="
                                            cursor-pointer transition
                                            theme-light:hover:bg-zinc-200
                                            theme-dark:hover:bg-zinc-800
                                            theme-2025:hover:bg-[#163781]
                                            theme-2026:hover:bg-[#faefcd]
                                        "
                                        >
                                            {val.charAt(0).toUpperCase() + val.slice(1)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Field Orientation (rotatable image) */}
                        <div className="space-y-2">
                            <Label className="theme-2025:text-zinc-200 theme-2026:text-[#3b2d00]">
                                Field Orientation
                            </Label>
                            <p className="text-sm italic mb-2 theme-2025:text-zinc-300 theme-2026:text-[#5a4800]">
                                Rotate until the field image matches what you see from your current location.
                            </p>

                            <div className="flex flex-col items-center gap-3">
                                <div
                                    className={`
        relative w-64 h-64 border rounded-lg overflow-hidden shadow-md
        transition-transform duration-700 ease-in-out will-change-transform
        theme-light:border-zinc-300 theme-dark:border-zinc-700
        theme-2025:border-[#2146a1] theme-2026:border-[#d7cfa3]
      `}
                                    style={{transform: `rotate(${angle}deg)`, transformOrigin: "50% 50%"}}
                                >
                                    <img
                                        src={fieldImg}
                                        alt="Field orientation preview"
                                        className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
                                    />
                                </div>

                                <div className="flex gap-6 mt-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setAngle(a => a - 180)              // CCW animation
                                            setOrientationState(o => (o === "0" ? "180" : "0"))
                                        }}
                                        className="
          p-2 rounded-full border transition
          theme-light:border-zinc-300 theme-light:hover:bg-zinc-100
          theme-dark:border-zinc-700 theme-dark:hover:bg-zinc-800
          theme-2025:border-[#2146a1] theme-2025:hover:bg-[#163781]
          theme-2026:border-[#d7cfa3] theme-2026:hover:bg-[#faefcd]
        "
                                        title="Rotate Counterclockwise"
                                    >
                                        <RotateCcw className="w-5 h-5"/>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setAngle(a => a + 180)              // CW animation
                                            setOrientationState(o => (o === "0" ? "180" : "0"))
                                        }}
                                        className="
          p-2 rounded-full border transition
          theme-light:border-zinc-300 theme-light:hover:bg-zinc-100
          theme-dark:border-zinc-700 theme-dark:hover:bg-zinc-800
          theme-2025:border-[#2146a1] theme-2025:hover:bg-[#163781]
          theme-2026:border-[#d7cfa3] theme-2026:hover:bg-[#faefcd]
        "
                                        title="Rotate Clockwise"
                                    >
                                        <RotateCw className="w-5 h-5"/>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
