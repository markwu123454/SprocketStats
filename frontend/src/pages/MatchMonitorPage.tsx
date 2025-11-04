import {useEffect, useState} from "react"
import {useAPI} from "@/hooks/useAPI.ts"
import {Loader2} from "lucide-react"
import {getSettingSync, type Settings} from "@/db/settingsDb"

type MatchRow = {
    match: number
    match_type: "qm" | "sf" | "f" | string
    team: string
    alliance: "red" | "blue"
    scouter: string | null
    status: string
    last_modified: number
}

export default function AdminMonitoringPage() {
    const {getFilteredMatches} = useAPI()
    const [rows, setRows] = useState<MatchRow[]>([])
    const [loading, setLoading] = useState(true)
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
    const [theme] = useState<Settings["theme"]>(() => getSettingSync("theme", "2025"))

    // --- Fetch every 5 seconds ---
    const loadData = async () => {
        try {
            const res = await getFilteredMatches(undefined, ["pre", "auto", "teleop", "post"])
            setRows(
                res.map(r => ({
                    ...r,
                    alliance: r.alliance as "red" | "blue",
                }))
            )

            setLastUpdated(new Date())
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void loadData()
        const id = setInterval(loadData, 2000)
        return () => clearInterval(id)
    }, [])

    // --- Group by match (type+number), then split by alliance ---
    const grouped = rows.reduce((acc, r) => {
        const key = `${r.match_type}-${r.match}`
        if (!acc[key]) acc[key] = {type: r.match_type, num: r.match, red: [], blue: []}
        acc[key][r.alliance].push(r)
        return acc
    }, {} as Record<string, { type: string; num: number; red: MatchRow[]; blue: MatchRow[] }>)

    // --- Sort: type order (qm → sf → f) then by number ---
    const typeOrder: Record<string, number> = {qm: 1, sf: 2, f: 3}
    const sortedMatches = Object.values(grouped).sort((a, b) => {
        const typeA = typeOrder[a.type] ?? 99
        const typeB = typeOrder[b.type] ?? 99
        if (typeA !== typeB) return typeA - typeB
        return a.num - b.num
    })

    return (
        <div
            className={`
                min-h-screen relative text-sm transition-colors duration-500
                ${theme === "light" ? "text-zinc-900" : ""}
                ${theme === "dark" ? "text-white" : ""}
                ${theme === "2025" ? "text-white" : ""}
                ${theme === "2026" ? "text-[#3b2d00]" : ""}
            `}
        >
            {/* --- Background --- */}
            <div
                className={`
                    absolute inset-0 bg-top bg-cover transition-colors duration-500
                    ${theme === "light" ? "bg-zinc-100" : ""}
                    ${theme === "dark" ? "bg-zinc-950" : ""}
                    ${theme === "2025" ? "bg-[url('/seasons/2025/expanded.png')]" : ""}
                    ${theme === "2026" ? "bg-[url('/seasons/2026/expanded.png')]" : ""}
                `}
            />

            {/* --- Foreground --- */}
            <div className="relative z-10 p-6 space-y-8">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold">Match Scouting Monitor</h1>
                    <div className="text-xs opacity-70">
                        {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Loading..."}
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="animate-spin h-6 w-6 opacity-60"/>
                    </div>
                ) : sortedMatches.length === 0 ? (
                    <div className="text-center opacity-70 py-10">
                        No active scouting in progress.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {sortedMatches.map(({type, num, red, blue}) => (
                            <div
                                key={`${type}-${num}`}
                                className={`
                                    relative z-10 w-full p-5 rounded-lg shadow-lg border transition-colors duration-500 backdrop-blur-sm
                                    ${theme === "dark" ? "bg-zinc-950/70 border-zinc-800 text-white" : ""}
                                    ${theme === "light" ? "bg-white border-zinc-300 text-zinc-900" : ""}
                                    ${theme === "2025" ? "bg-[#0b234f]/70 border-[#1b3d80] text-white" : ""}
                                    ${theme === "2026" ? "bg-[#fef7dc]/80 border-[#e6ddae] text-[#3b2d00]" : ""}
                                `}
                            >
                                <div className="flex justify-between items-center mb-3">
                                    <div className="font-semibold">
                                        {type.toUpperCase()} {num}
                                    </div>
                                    <div className="text-xs opacity-70">
                                        {red.length + blue.length} teams
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    {/* --- Red Alliance --- */}
                                    <div>
                                        <div className="font-medium text-red-400 mb-1">
                                            Red Alliance
                                        </div>
                                        {red.length === 0 ? (
                                            <div className="text-xs opacity-50">—</div>
                                        ) : (
                                            <div className="space-y-1">
                                                {red.map((r, i) => (
                                                    <div
                                                        key={i}
                                                        className="flex justify-between items-center bg-red-500/10 px-3 py-1.5 rounded-md"
                                                    >
                                                        <span className="font-semibold">#{r.team}</span>
                                                        <span className="opacity-90">{r.scouter ?? "—"}</span>
                                                        <span className="text-xs capitalize opacity-80">
                                                            {r.status}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* --- Blue Alliance --- */}
                                    <div>
                                        <div className="font-medium text-blue-400 mb-1">
                                            Blue Alliance
                                        </div>
                                        {blue.length === 0 ? (
                                            <div className="text-xs opacity-50">—</div>
                                        ) : (
                                            <div className="space-y-1">
                                                {blue.map((r, i) => (
                                                    <div
                                                        key={i}
                                                        className="flex justify-between items-center bg-blue-500/10 px-3 py-1.5 rounded-md"
                                                    >
                                                        <span className="font-semibold">#{r.team}</span>
                                                        <span className="opacity-90">{r.scouter ?? "—"}</span>
                                                        <span className="text-xs capitalize opacity-80">
                                                            {r.status}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
