import {useEffect, useState} from "react"
import {useNavigate} from "react-router-dom"
import {ArrowLeft, RotateCcw, RotateCw} from "lucide-react"
import {getSetting, getSettingSync, setSetting, type Settings} from "@/db/settingsDb.ts"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select"
import {Label} from "@/components/ui/label"
import CardLayoutWrapper from "@/components/wrappers/CardLayoutWrapper.tsx"

export default function MorePage() {
    const navigate = useNavigate()
    const [theme, setThemeState] = useState<Settings["theme"]>(() => getSettingSync("theme"))
    const [orientation, setOrientationState] = useState<Settings["field_orientation"]>(
        () => getSettingSync("field_orientation")
    )
    const [angle, setAngle] = useState<number>(
        () => (getSettingSync("field_orientation") === "180" ? 180 : 0)
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

            {/* Extra section */}
            <div className="space-y-3 mt-2">
                <button
                    onClick={() => navigate("/candy")}
                    className="w-full px-4 py-2 rounded-md border transition
                               theme-border theme-button-bg/50 theme-text hover:theme-button-hover hover:cursor-pointer"
                >
                    Candy Data
                </button>
            </div>

            <hr className="my-4 theme-border"/>

            {/* Settings */}
            <div className="space-y-4">
                {/* Theme Selection */}
                <div className="space-y-1">
                    <Label className="theme-subtext-color">Theme</Label>
                    <Select
                        value={theme}
                        onValueChange={(val) => setThemeState(val as Settings["theme"])}
                    >
                        <SelectTrigger
                            className="w-full border rounded-md transition theme-button-bg theme-border theme-text theme-button-hover"
                        >
                            <SelectValue placeholder="Select Theme"/>
                        </SelectTrigger>

                        <SelectContent
                            className="rounded-md shadow-lg transition theme-border theme-button-bg"
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
                    <Label className="theme-subtext-color">
                        Field Orientation
                    </Label>
                    <p className="text-sm italic mb-2 theme-subtext-color">
                        Rotate until the field image matches what you see from your current location.
                    </p>

                    <div className="flex flex-col items-center gap-3">
                        <div
                            className="
                                relative w-64 h-64 border rounded-lg overflow-hidden
                                shadow-[0_0_12px_rgba(0,0,0,0.25)] theme-border
                                transition-transform duration-700 ease-in-out will-change-transform
                            "
                            style={{
                                transform: `rotate(${angle}deg)`,
                                transformOrigin: "50% 50%",
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
                                className="p-2 rounded-full border transition hover:theme-button-hover theme-border"
                                title="Rotate Counterclockwise"
                            >
                                <RotateCcw className="w-5 h-5 theme-text"/>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setAngle((a) => a + 180)
                                    setOrientationState((o) => (o === "0" ? "180" : "0"))
                                }}
                                className="p-2 rounded-full border transition hover:theme-button-hover theme-border"
                                title="Rotate Clockwise"
                            >
                                <RotateCw className="w-5 h-5 theme-text"/>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </CardLayoutWrapper>
    )
}
