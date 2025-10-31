import {useAPI} from "@/hooks/useAPI.ts";
import * as React from "react";
import {useEffect, useState} from "react";
import {Label} from "@/components/ui/label.tsx";
import {Input} from "@/components/ui/input.tsx";
import {AlertCircle, ArrowLeft, CheckCircle, XCircle} from "lucide-react";
import {useNavigate} from "react-router-dom";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select.tsx";
import {Button} from "@/components/ui/button.tsx";

// TODO: add questions for human factor(openness, approachability, etc)

export default function PitScoutingLayout() {
    const navigate = useNavigate()
    const {getTeamBasicInfo, submitPitData} = useAPI()

    const [teamNumber, setTeamNumber] = useState("")
    const [teamInfo, setTeamInfo] = useState<{
        number?: number
        nickname?: string
        rookie_year?: number | null
        scouted?: boolean
    } | null>(null)
    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [notFound, setNotFound] = useState(false)
    const [answers, setAnswers] = useState<Partial<Record<string, string>>>({})
    const [submitted, setSubmitted] = useState(false)
    const [teamNames, setTeamNames] = useState<Record<string, string>>({})

    // --- Load team names once from public JSON ---
    useEffect(() => {
        fetch("/teams/team_names.json")
            .then((res) => res.json())
            .then((data) => setTeamNames(data))
            .catch(() => setTeamNames({}))
    }, [])

    // --- Fetch scouting status whenever teamNumber changes ---
    useEffect(() => {
        if (!teamNumber) {
            setTeamInfo(null)
            setNotFound(false)
            return
        }

        const nickname = teamNames[teamNumber]
        if (!nickname) {
            // not in local list
            setTeamInfo(null)
            setNotFound(true)
            return
        }

        setLoading(true)
        const timeout = setTimeout(async () => {
            // only ask backend if already scouted
            const info = await getTeamBasicInfo(teamNumber)
            const scouted = info?.scouted ?? false

            setTeamInfo({
                number: parseInt(teamNumber),
                nickname,
                scouted,
            })
            setLoading(false)
            setNotFound(false)
        }, 400)

        return () => clearTimeout(timeout)
    }, [teamNumber, teamNames])

    // --- Submit handler ---
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!teamNumber || notFound) return

        setSubmitting(true)
        const scouter =
            document.cookie
                .split("; ")
                .find(r => r.startsWith("scouting_name="))
                ?.split("=")[1] || "unknown"

        const success = await submitPitData(teamNumber, scouter, answers)
        setSubmitting(false)

        if (success) {
            setSubmitted(true)
            setTimeout(() => {
                setTeamNumber("")
                setTeamInfo(null)
                setNotFound(false)
                setAnswers({})
                setSubmitted(false)
            }, 2000)
        }
    }

    const handleMultiToggle = (key: string, option: string, checked: boolean) => {
        setAnswers((prev) => {
            const current = Array.isArray(prev[key]) ? prev[key] : []
            const updated = checked
                ? [...current, option]
                : current.filter((l: string) => l !== option)
            return {...prev, [key]: updated}
        })
    }

    return (
        <div
            className="
            min-h-screen overflow-x-hidden w-full p-4 transition-colors duration-500
            theme-light:bg-zinc-100 theme-light:text-zinc-900
            theme-dark:bg-zinc-950 theme-dark:text-white
            theme-2025:bg-[url('@/assets/seasons/2025/expanded.png')] theme-2025:bg-top theme-2025:bg-cover theme-2025:text-white
            theme-2026:bg-[url('@/assets/seasons/2026/expanded.png')] theme-2026:bg-top theme-2026:bg-cover theme-2026:text-[#3b2d00]
        ">
            <form
                onSubmit={handleSubmit}
                className="
                    space-y-6 max-w-xl mx-auto backdrop-blur-sm p-6 rounded-lg shadow-lg border transition-colors duration-500
                    theme-light:bg-white/90 theme-light:border-zinc-300
                    theme-dark:bg-zinc-900/80 theme-dark:border-zinc-700
                    theme-2025:bg-[#0b234f]/70 theme-2025:border-[#1b3d80]
                    theme-2026:bg-[#fef7dc]/80 theme-2026:border-[#e6ddae]
                "
            >
                {/* --- Team Input Section --- */}
                <div>
                    <div className="flex items-center justify-between">
                        <Label htmlFor="teamNumber" className="text-lg font-semibold">
                            Enter Team Number
                        </Label>
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

                    <Input
                        id="teamNumber"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="e.g. 3473"
                        value={teamNumber}
                        onChange={(e) => {
                            const val = e.target.value
                            if (val === "" || /^\d{0,5}$/.test(val)) setTeamNumber(val)
                        }}
                        className="
            w-40 mt-1
            theme-light:bg-zinc-50 theme-light:border-zinc-300 theme-light:text-zinc-900
            theme-dark:bg-zinc-800 theme-dark:border-zinc-700 theme-dark:text-white
            theme-2025:bg-[#102b6a]/80 theme-2025:border-[#2146a1] theme-2025:text-white
            theme-2026:bg-[#fff8e5] theme-2026:border-[#d7cfa3] theme-2026:text-[#3b2d00]
        "
                    />

                    {/* --- Inline team info display --- */}
                    <div
                        className="
            mt-3 flex items-center justify-between p-2 border rounded-lg min-h-[60px]
            theme-light:border-zinc-300 theme-dark:border-zinc-700
            theme-2025:border-[#1b3d80] theme-2026:border-[#e6ddae]
            transition-colors duration-500
        "
                    >
                        {/* --- Left side: team icon + info --- */}
                        <div className="flex items-center space-x-3">
                            {/* Show icon immediately if team exists in local JSON */}
                            {teamNumber && teamNames[teamNumber] && (
                                <img
                                    key={teamNumber}
                                    src={`/teams/team_icons/${teamNumber}.png`}
                                    alt={`${teamNumber} icon`}
                                    onError={(e) => (e.currentTarget.style.display = "none")}
                                    className="w-10 h-10"
                                />
                            )}
                            <div className="flex flex-col">
                                {teamNumber && teamNames[teamNumber] && (
                                    <>
                                        <div className="font-semibold text-base">
                                            Team {teamNumber}
                                        </div>
                                        <div className="text-sm opacity-80">
                                            {teamNames[teamNumber]}
                                        </div>
                                    </>
                                )}

                                {!teamNumber && (
                                    <span className="text-sm text-muted-foreground">Enter a team number</span>
                                )}
                                {!teamNames[teamNumber] && teamNumber && !loading && (
                                    <span className="text-sm text-destructive">Team not found.</span>
                                )}

                                {!loading && teamInfo?.scouted && (
                                    <div className="text-xs text-orange-500 mt-1">
                                        Team already scouted (re-scouting will override).
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* --- Right side: status or loading icon --- */}
                        <div className="flex items-center">
                            {loading && teamNumber && teamNames[teamNumber] && (
                                <div
                                    className="w-6 h-6 rounded-full border-2 border-current border-t-transparent animate-spin opacity-70"></div>
                            )}
                            {!loading && teamInfo?.scouted && !notFound && (
                                <AlertCircle className="w-6 h-6 text-orange-500"/>
                            )}
                            {!loading && teamInfo && !notFound && !teamInfo.scouted && (
                                <CheckCircle className="w-6 h-6 text-green-500"/>
                            )}
                            {!loading && notFound && <XCircle className="w-6 h-6 text-red-500"/>}
                        </div>
                    </div>
                </div>

                {/* --- Form Sections --- */}
                <div className="space-y-6">
                    <Label className="text-lg font-semibold">Robot Info</Label>

                    {/* --- TODO: CameraCapture --- */}
                    {/* <CameraCapture title="Robot Photos" ... /> */}

                    {/* --- Dimensions & Weight --- */}
                    <div>
                        <Label>Drivebase Type</Label>
                        <ThemedInput
                            placeholder="e.g. Swerve, Tank"
                            value={answers.drivebase ?? ""}
                            onChange={(e) => setAnswers({...answers, drivebase: e.target.value})}
                        />
                    </div>

                    <div>
                        <Label>Cage Set</Label>
                        <ThemedSelect
                            value={answers.cageSet}
                            onValueChange={(val) => setAnswers({...answers, cageSet: val})}
                            placeholder="Select one"
                        >
                            <SelectItem value="High">High</SelectItem>
                            <SelectItem value="Low">Low</SelectItem>
                            <SelectItem value="No Preference">No Preference</SelectItem>
                        </ThemedSelect>
                    </div>

                    <div>
                        <Label>Center of Gravity (collapsed) height (inches)</Label>
                        <ThemedInput
                            type="number"
                            placeholder="e.g. 10"
                            value={answers.cgCollapsed ?? ""}
                            onChange={(e) => setAnswers({...answers, cgCollapsed: e.target.value})}
                        />
                    </div>

                    <div>
                        <Label>Center of Gravity (extended) height (inches)</Label>
                        <ThemedInput
                            type="number"
                            placeholder="e.g. 18"
                            value={answers.cgExtended ?? ""}
                            onChange={(e) => setAnswers({...answers, cgExtended: e.target.value})}
                        />
                    </div>

                    {/* --- Mechanism & Manipulation --- */}
                    <div>
                        <Label>Describe the intake</Label>
                        <ThemedInput
                            placeholder="e.g. Two rollers with polycord belts"
                            value={answers.intake ?? ""}
                            onChange={(e) => setAnswers({...answers, intake: e.target.value})}
                        />
                    </div>

                    <div>
                        <Label>Scoring mechanism type</Label>
                        <ThemedInput
                            placeholder="e.g. Elevator, Arm, Shooter, Hybrid"
                            value={answers.mechanism ?? ""}
                            onChange={(e) => setAnswers({...answers, mechanism: e.target.value})}
                        />
                    </div>

                    <div>
                        <Label>What game pieces can it handle?</Label>
                        <ThemedSelect
                            value={answers.pieces}
                            onValueChange={(val) => setAnswers({...answers, pieces: val})}
                            placeholder="Select one"
                        >
                            <SelectItem value="Coral">Coral</SelectItem>
                            <SelectItem value="Algae">Algae</SelectItem>
                            <SelectItem value="Both">Both</SelectItem>
                        </ThemedSelect>
                    </div>

                    <div>
                        <Label>Which levels can it score on?</Label>
                        <div className="flex flex-col space-y-1 mt-1">
                            {["L1", "L2", "L3", "L4"].map((level) => (
                                <label key={level} className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        checked={Array.isArray(answers.levels) && answers.levels.includes(level)}
                                        onChange={(e) => handleMultiToggle("levels", level, e.target.checked)}
                                        className="h-4 w-4 accent-primary theme-2025:accent-[#4d75d9] theme-2026:accent-[#a28d46]"
                                    />
                                    <span>{level}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* --- Strategy & Function --- */}
                    <div>
                        <Label>Defense or Offense</Label>
                        <ThemedSelect
                            value={answers.role}
                            onValueChange={(val) => setAnswers({...answers, role: val})}
                            placeholder="Select one"
                        >
                            <SelectItem value="Defense">Defense</SelectItem>
                            <SelectItem value="Offense">Offense</SelectItem>
                            <SelectItem value="Both">Both</SelectItem>
                        </ThemedSelect>
                    </div>

                    <div>
                        <Label>Auton start location</Label>
                        <ThemedSelect
                            value={answers.autonStart}
                            onValueChange={(val) => setAnswers({...answers, autonStart: val})}
                            placeholder="Select one"
                        >
                            <SelectItem value="Center Field">Center Field</SelectItem>
                            <SelectItem value="Processor Side">Processor Side (Right)</SelectItem>
                            <SelectItem value="Opposite Side">Opposite Side (Left)</SelectItem>
                        </ThemedSelect>
                    </div>

                    <div>
                        <Label>Primary teleop role / actions</Label>
                        <ThemedInput
                            placeholder="e.g. Scoring top coral, occasional algae removal"
                            value={answers.teleopAction ?? ""}
                            onChange={(e) => setAnswers({...answers, teleopAction: e.target.value})}
                        />
                    </div>

                    <div>
                        <Label>How many cycles per game / pieces scored?</Label>
                        <ThemedInput
                            placeholder="e.g. 6–7 cycles, 8 pieces total"
                            value={answers.cycles ?? ""}
                            onChange={(e) => setAnswers({...answers, cycles: e.target.value})}
                        />
                    </div>

                    <div>
                        <Label>Climb or Endgame capability</Label>
                        <ThemedInput
                            placeholder="e.g. Can hang on mid bar"
                            value={answers.climb ?? ""}
                            onChange={(e) => setAnswers({...answers, climb: e.target.value})}
                        />
                    </div>

                    {/* --- Optional / Miscellaneous --- */}
                    <div>
                        <Label>Programming highlights</Label>
                        <div className="flex flex-col space-y-1 mt-1">
                            {[
                                {key: "vision", label: "Vision alignment"},
                                {key: "path planner", label: "Path planner path gen."},
                                {key: "driver assist", label: "Teleop driver assist"},
                            ].map((prog) => (
                                <label key={prog.key} className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        checked={Array.isArray(answers.programming) && answers.programming.includes(prog.key)}
                                        onChange={(e) => handleMultiToggle("programming", prog.key, e.target.checked)}
                                        className="h-4 w-4 accent-primary theme-2025:accent-[#4d75d9] theme-2026:accent-[#a28d46]"
                                    />
                                    <span>{prog.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div>
                        <Label>Robot name</Label>
                        <ThemedInput
                            placeholder="e.g. Nautilus"
                            value={answers.comments ?? ""}
                            onChange={(e) => setAnswers({...answers, comments: e.target.value})}
                        />
                    </div>
                </div>

                {/* --- Submit --- */}
                <div className="pt-6 flex w-full space-x-2 items-center">
                    <Button
                        type="button"
                        className="w-1/5"
                        variant="secondary"
                        onClick={() => window.history.back()}
                        disabled={submitting}
                    >
                        Back
                    </Button>

                    <Button
                        type="submit"
                        className="
                            w-4/5 flex items-center justify-center space-x-2 transition
                            theme-light:bg-blue-600 theme-light:hover:bg-blue-500 theme-light:text-white
                            theme-dark:bg-blue-600 theme-dark:hover:bg-blue-500 theme-dark:text-white
                            theme-2025:bg-[#2146a1] theme-2025:hover:bg-[#4d75d9] theme-2025:text-white
                            theme-2026:bg-[#e3dcb4] theme-2026:hover:bg-[#d6ca8e] theme-2026:text-[#3b2d00]
                        "
                        disabled={loading || submitting || notFound || !teamNumber}
                    >
                        {submitted ? (
                            <>
                                <CheckCircle className="w-7 h-7 text-green-500"/>
                                <span>Submitted!</span>
                            </>
                        ) : (
                            loading ? "Loading..." :
                                submitting ? "Submitting..." :
                                    notFound ? "Team not found." :
                                        !teamNumber ? "Enter a team number" :
                                            "Submit Pit Data"
                        )}
                    </Button>
                </div>
            </form>
        </div>
    )
}

function ThemedInput({
                         className = "",
                         ...props
                     }: React.ComponentProps<typeof Input>) {
    return (
        <Input
            className={`
        transition-colors duration-300
        theme-light:bg-zinc-50 theme-light:border-zinc-300 theme-light:text-zinc-900 theme-light:placeholder-zinc-400
        theme-dark:bg-zinc-800 theme-dark:border-zinc-700 theme-dark:text-white theme-dark:placeholder-zinc-500
        theme-2025:bg-[#102b6a]/80 theme-2025:border-[#2146a1] theme-2025:text-white theme-2025:placeholder-zinc-300
        theme-2026:bg-[#fff8e5] theme-2026:border-[#d7cfa3] theme-2026:text-[#3b2d00] theme-2026:placeholder-[#7b6a2f]
        focus:ring-2 focus:ring-blue-600
        ${className}
      `}
            {...props}
        />
    )
}

function ThemedSelect({
                          children,
                          placeholder,
                          onValueChange,
                          value,
                      }: {
    children: React.ReactNode
    placeholder?: string
    onValueChange?: (val: string) => void
    value?: string
}) {
    return (
        <Select value={value} onValueChange={onValueChange}>
            <SelectTrigger
                className="
          transition-colors duration-300
          theme-light:bg-zinc-50 theme-light:border-zinc-300 theme-light:text-zinc-900
          theme-dark:bg-zinc-800 theme-dark:border-zinc-700 theme-dark:text-white
          theme-2025:bg-[#102b6a]/80 theme-2025:border-[#2146a1] theme-2025:text-white
          theme-2026:bg-[#fff8e5] theme-2026:border-[#d7cfa3] theme-2026:text-[#3b2d00]
        "
            >
                <SelectValue placeholder={placeholder}/>
            </SelectTrigger>
            <SelectContent
                className="
          theme-light:bg-zinc-50 theme-light:text-zinc-900
          theme-dark:bg-zinc-800 theme-dark:text-white
          theme-2025:bg-[#0b234f]/95 theme-2025:text-white
          theme-2026:bg-[#fff8e5] theme-2026:text-[#3b2d00]
        "
            >
                {children}
            </SelectContent>
        </Select>
    )
}
