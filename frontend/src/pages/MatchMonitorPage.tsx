import {useEffect, useState} from "react"
import {Loader2, AlertTriangle} from "lucide-react"
import {useAPI} from "@/hooks/useAPI"
import {HeaderFooterLayoutWrapper} from "@/components/wrappers/HeaderFooterLayoutWrapper"

type ActiveMatches = {
    [matchType: string]: {
        [matchNumber: number]: {
            time: number | null
            red: Record<number, TeamData>
            blue: Record<number, TeamData>
        }
    }
}

type TeamData = {
    scouter: string | null
    name: string | null
    assigned_scouter: string | null
    assigned_name: string | null
    phase: string
}

export default function AdminMonitoringPage() {
    const {getActiveMatches} = useAPI()
    const [matches, setMatches] = useState<ActiveMatches>({})
    const [loading, setLoading] = useState(true)
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

    const loadData = async () => {
        try {
            const res = await getActiveMatches()
            setMatches(res)
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

    const isStartingSoon = (time: number | null) =>
        time !== null && Math.abs(time - Date.now()) <= 10 * 60 * 1000

    const hasMismatch = (
        assignedId: string | null,
        actualId: string | null
    ) =>
        assignedId !== null &&
        actualId !== null &&
        assignedId !== actualId

    const matchCards = Object.entries(matches).flatMap(([type, byNumber]) =>
        Object.entries(byNumber).map(([num, match]) => ({
            type,
            num: Number(num),
            ...match,
        }))
    )

    return (
        <HeaderFooterLayoutWrapper
            header={
                <div className="flex justify-between items-center w-full">
                    <h1 className="text-xl font-bold">
                        Match Scouting Monitor
                    </h1>
                    <span className="text-xs opacity-70">
                        {lastUpdated
                            ? `Updated ${lastUpdated.toLocaleTimeString()}`
                            : "Loading…"}
                    </span>
                </div>
            }

            body={
                loading ? (
                    <div className="flex justify-center py-16">
                        <Loader2 className="animate-spin h-6 w-6 opacity-60"/>
                    </div>
                ) : matchCards.length === 0 ? (
                    <div className="text-center opacity-70 py-16">
                        No active matches.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {matchCards.map(match => {
                            const soon = isStartingSoon(match.time)

                            return (
                                <div
                                    key={`${match.type}-${match.num}`}
                                    className={`
                                        p-5 rounded-lg border shadow-lg backdrop-blur-sm
                                        theme-bg theme-border
                                        ${soon ? "ring-2 ring-yellow-400/70" : ""}
                                    `}
                                >
                                    {/* Match Header */}
                                    <div className="flex justify-between items-center mb-3">
                                        <div className="font-semibold flex items-center gap-2">
                                            {match.type.toUpperCase()} {match.num}
                                            {isStartingSoon(match.time) && (
                                                <span className="text-red-500 text-xs flex items-center gap-1">
                                                    <AlertTriangle className="h-4 w-4"/>
                                                    Starting Soon
                                                </span>
                                            )}
                                        </div>

                                        <span className="text-xs opacity-70">
                                            {match.time
                                                ? new Date(match.time).toLocaleString(undefined, {
                                                    month: "short",
                                                    day: "numeric",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                })
                                                : "—"}
                                        </span>
                                    </div>


                                    <div className="grid grid-cols-2 gap-4">
                                        <AllianceColumn
                                            title="Red Alliance"
                                            color="red"
                                            teams={match.red}
                                            hasMismatch={hasMismatch}
                                        />
                                        <AllianceColumn
                                            title="Blue Alliance"
                                            color="blue"
                                            teams={match.blue}
                                            hasMismatch={hasMismatch}
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )
            }

            footer={
                <>
                    <span>Admin Monitoring</span>
                    <span className="opacity-70">
                        Live · 2s refresh
                    </span>
                </>
            }
        />
    )
}

/* ---------------------------------- */
/* Alliance Column                     */

/* ---------------------------------- */

function AllianceColumn({
                            title,
                            color,
                            teams,
                            hasMismatch,
                        }: {
    title: string
    color: "red" | "blue"
    teams: Record<number, TeamData>
    hasMismatch: (a: string | null, b: string | null) => boolean
}) {
    const entries = Object.entries(teams)

    return (
        <div>
            <div className={`font-medium mb-1 text-${color}-400`}>
                {title}
            </div>

            {entries.length === 0 ? (
                <div className="text-xs opacity-50">—</div>
            ) : (
                <div className="space-y-1">
                    {entries.map(([team, data]) => {
                        const mismatch = hasMismatch(
                            data.assigned_scouter,
                            data.scouter
                        )

                        return (
                            <div
                                key={team}
                                className={`
                                flex justify-between items-center
                                px-3 py-1.5 rounded-md
                                bg-${color}-500/10
                                ${mismatch ? "ring-1 ring-red-500/70" : ""}
                                `}
                            >
                                <span className="font-semibold">
                                    #{team}
                                </span>

                                <div className="text-right text-xs">
                                    <div>
                                        Assigned: {data.assigned_name ?? "—"}
                                    </div>
                                    <div
                                        className={
                                            mismatch
                                                ? "text-red-500 font-semibold"
                                                : "opacity-80"
                                        }
                                    >
                                        Scouting: {data.name ?? "—"}
                                    </div>
                                </div>

                                <span className="text-xs capitalize opacity-80">
                                    {data.phase}
                                </span>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
