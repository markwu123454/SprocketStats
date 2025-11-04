import { useParams } from "react-router-dom"
import { useMatchData } from "@/components/wrappers/DataWrapper"

export default function MatchDataPost() {
    const { matchKey } = useParams<{ matchKey: string }>()
    const match = useMatchData(matchKey ?? "")

    const red = match?.alliances?.red
    const blue = match?.alliances?.blue

    const scoreRed = red?.score ?? null
    const scoreBlue = blue?.score ?? null
    const rpRed = red?.rp ?? null
    const rpBlue = blue?.rp ?? null

    const winner =
        typeof scoreRed === "number" && typeof scoreBlue === "number"
            ? scoreRed > scoreBlue
                ? "red"
                : scoreRed < scoreBlue
                    ? "blue"
                    : "tie"
            : null

    const matchTime = match?.time
        ? new Date(match.time).toLocaleString()
        : "—"

    return (
        <div className="flex flex-col h-screen bg-white text-zinc-900">
            {/* === HEADER === */}
            <div className="flex items-center justify-between border-b border-zinc-200 px-8 py-4 h-20 bg-zinc-50">
                {/* Match + event info */}
                <div className="flex flex-col">
                    <h1 className="text-xl font-semibold">
                        {matchKey?.toUpperCase() ?? "MATCH"}
                    </h1>
                    <p className="text-sm text-zinc-500">
                        {match?.event_key ?? "Unknown Event"} —{" "}
                        {match?.comp_level?.toUpperCase() ?? "?"}
                    </p>
                </div>

                {/* Result / scores / time */}
                <div className="flex items-center gap-10 text-lg font-semibold">
                    <AllianceHeader
                        color="red"
                        score={scoreRed}
                        rp={rpRed}
                        winner={winner}
                    />
                    <div className="flex flex-col items-center text-zinc-500 text-sm">
                        <span>{matchTime}</span>
                        <span className="text-xs uppercase">
                            {winner === "tie"
                                ? "TIE"
                                : winner
                                ? `${winner.toUpperCase()} WIN`
                                : "PENDING"}
                        </span>
                    </div>
                    <AllianceHeader
                        color="blue"
                        score={scoreBlue}
                        rp={rpBlue}
                        winner={winner}
                    />
                </div>
            </div>

            {/* === BODY === */}
            <div className="flex flex-1 overflow-hidden">
                {/* RED ALLIANCE */}
                <AlliancePanel
                    color="red"
                    alliance={red}
                    winner={winner === "red"}
                />

                {/* COMPARISON CENTER */}
                <div className="flex-1 flex flex-col overflow-auto bg-zinc-50 border-x border-zinc-200">
                    <SectionHeader label="Match Summary & Comparison" />
                    <div className="flex-1 p-6 text-center text-sm text-zinc-500">
                        Charts, auto/teleop breakdowns, and alliance comparisons go here.
                    </div>
                </div>

                {/* BLUE ALLIANCE */}
                <AlliancePanel
                    color="blue"
                    alliance={blue}
                    winner={winner === "blue"}
                />
            </div>
        </div>
    )
}

// === SUBCOMPONENTS ===
function AllianceHeader({
    color,
    score,
    rp,
    winner,
}: {
    color: "red" | "blue"
    score: number | null
    rp: number | null
    winner: string | null
}) {
    const isWinner = winner === color
    const colorClass =
        color === "red"
            ? isWinner
                ? "text-red-600 underline"
                : "text-red-600"
            : isWinner
                ? "text-blue-600 underline"
                : "text-blue-600"

    return (
        <div className="flex flex-col items-center">
            <span className={`${colorClass} text-2xl font-bold`}>
                {score ?? "—"}
            </span>
            <span className="text-xs text-zinc-500">{rp ?? 0} RP</span>
        </div>
    )
}

function AlliancePanel({
    color,
    alliance,
    winner,
}: {
    color: "red" | "blue"
    alliance: any
    winner: boolean
}) {
    const bg =
        color === "red"
            ? winner
                ? "bg-red-50"
                : "bg-red-50/40"
            : winner
                ? "bg-blue-50"
                : "bg-blue-50/40"

    const teamKeys = alliance?.team_keys ?? []
    const teamRanks = alliance?.ranks ?? {} // expected format: { frcXXXX: rank }

    return (
        <div className={`flex-1 flex flex-col overflow-auto ${bg}`}>
            <SectionHeader
                label={`${color === "red" ? "Red" : "Blue"} Alliance`}
                color={color}
            />
            {teamKeys.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm">
                    No data
                </div>
            ) : (
                <ul className="divide-y divide-zinc-200">
                    {teamKeys.map((teamKey: string) => (
                        <li
                            key={teamKey}
                            className="p-4 flex items-center justify-between"
                        >
                            <span
                                className={`font-medium ${
                                    color === "red"
                                        ? "text-red-700"
                                        : "text-blue-700"
                                }`}
                            >
                                {teamKey.replace("frc", "")}
                            </span>
                            <span className="text-zinc-500 text-sm">
                                Rank {teamRanks[teamKey] ?? "—"}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

function SectionHeader({
    label,
    color,
}: {
    label: string
    color?: "red" | "blue"
}) {
    const colorClass =
        color === "red"
            ? "text-red-700"
            : color === "blue"
                ? "text-blue-700"
                : "text-zinc-600"
    return (
        <div
            className={`px-5 py-2 border-b border-zinc-200 text-sm font-semibold ${colorClass}`}
        >
            {label}
        </div>
    )
}
