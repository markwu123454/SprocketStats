import {useState, useMemo} from "react"
import {
  DndContext,
  type DragEndEvent,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities"

// ===== Shared Types =====
type Match = {
    matchKey: string
    red: number[]
    blue: number[]
    winner: "red" | "blue" | null
    redRP: boolean[]
    blueRP: boolean[]
}

type TeamStats = {
    team: number
    rp: number
    wins: number
    losses: number
}

type Alliance = {
    captain: number | null
    pick1: number | null
    pick2: number | null
}

// ===== Main Page =====
export default function AllianceSimData() {
    const [step, setStep] = useState<1 | 2 | 3>(1)
    const [matches, setMatches] = useState<Match[]>([
        {
            matchKey: "qm1",
            red: [111, 222, 333],
            blue: [444, 555, 666],
            winner: "red",
            redRP: [false, true, false],
            blueRP: [true, true, false],
        },
        {
            matchKey: "qm2",
            red: [111, 444, 555],
            blue: [222, 333, 666],
            winner: "red",
            redRP: [true, true, true],
            blueRP: [false, true, false],
        },
        {
            matchKey: "qm3",
            red: [222, 444, 666],
            blue: [111, 333, 555],
            winner: "blue",
            redRP: [false, true, false],
            blueRP: [false, false, true],
        },
        {
            matchKey: "qm4",
            red: [111, 222, 666],
            blue: [333, 444, 555],
            winner: "red",
            redRP: [false, false, true],
            blueRP: [true, true, true],
        },
    ])

    const allTeams = Array.from(new Set(matches.flatMap((m) => [...m.red, ...m.blue])))

    // Compute rankings (used in Step 1 + optionally Step 2)
    const rankings = useMemo(() => {
        const stats: Record<number, TeamStats> = {}
        allTeams.forEach((t) => (stats[t] = {team: t, rp: 0, wins: 0, losses: 0}))

        matches.forEach((m) => {
            const redRPsum = m.redRP.filter(Boolean).length
            const blueRPsum = m.blueRP.filter(Boolean).length

            if (m.winner === "red") {
                m.red.forEach((t) => {
                    stats[t].wins++
                    stats[t].rp += 3 + redRPsum
                })
                m.blue.forEach((t) => {
                    stats[t].losses++
                    stats[t].rp += blueRPsum
                })
            } else if (m.winner === "blue") {
                m.blue.forEach((t) => {
                    stats[t].wins++
                    stats[t].rp += 3 + blueRPsum
                })
                m.red.forEach((t) => {
                    stats[t].losses++
                    stats[t].rp += redRPsum
                })
            } else {
                m.red.forEach((t) => (stats[t].rp += redRPsum))
                m.blue.forEach((t) => (stats[t].rp += blueRPsum))
            }
        })

        return Object.values(stats).sort((a, b) => b.rp - a.rp)
    }, [matches, allTeams])

    const [alliances, setAlliances] = useState<Alliance[]>(
        Array.from({length: 8}, () => ({captain: null, pick1: null, pick2: null}))
    )
    const [elimResults, setElimResults] = useState<Record<number, number>>({})

    return (
        <div className="h-screen flex flex-col p-4 gap-4 bg-white">
            {/* ===== Header Navigation ===== */}
            <header className="flex justify-between items-center border-b pb-2">
                <h1 className="text-2xl font-bold">Alliance Simulation</h1>
                <div className="flex gap-2">
                    {[1, 2, 3].map((s) => (
                        <button
                            key={s}
                            onClick={() => setStep(s as 1 | 2 | 3)}
                            className={`px-3 py-1 border rounded ${
                                step === s ? "bg-gray-200 font-semibold" : ""
                            }`}
                        >
                            {s === 1
                                ? "Quals"
                                : s === 2
                                    ? "Alliances"
                                    : "Elims"}
                        </button>
                    ))}
                </div>
            </header>

            {/* ===== Step Content ===== */}
            {step === 1 && (
                <Step1_QualSim
                    matches={matches}
                    setMatches={setMatches}
                    rankings={rankings}
                />
            )}
            {step === 2 && (
                <Step2_AllianceSelect
                    rankings={rankings}
                    alliances={alliances}
                    setAlliances={setAlliances}
                />
            )}
            {step === 3 && (
                <Step3_ElimSim
                    alliances={alliances}
                    results={elimResults}
                    setResults={setElimResults}
                />
            )}
        </div>
    )
}

// ===== Step 1 — Qualification Simulation =====
function Step1_QualSim({
                           matches,
                           setMatches,
                           rankings,
                       }: {
    matches: Match[]
    setMatches: React.Dispatch<React.SetStateAction<Match[]>>
    rankings: TeamStats[]
})
{
    const toggleWinner = (i: number, winner: "red" | "blue") => {
        setMatches((prev) =>
            prev.map((m, j) =>
                j === i
                    ? {...m, winner: m.winner === winner ? null : winner}
                    : m
            )
        )
    }

    const toggleRP = (
        i: number,
        alliance: "red" | "blue",
        index: number
    ) => {
        setMatches((prev) =>
            prev.map((m, j) =>
                j === i
                    ? {
                        ...m,
                        [alliance + "RP"]: (m as any)[
                        alliance + "RP"
                            ].map((r: boolean, k: number) =>
                            k === index ? !r : r
                        ),
                    }
                    : m
            )
        )
    }

    return (
        <div className="flex flex-1 gap-4 overflow-hidden">
            {/* LEFT: Match Table */}
            <div className="flex-1 overflow-auto border rounded">
                <table className="w-full text-center border-collapse">
                    <thead className="bg-gray-100 sticky top-0">
                    <tr>
                        <th className="border p-1">Match</th>
                        <th className="border p-1 text-red-600">Red Alliance</th>
                        <th className="border p-1 text-blue-600">Blue Alliance</th>
                        <th className="border p-1">Winner</th>
                        <th className="border p-1">Red Auto RP</th>
                        <th className="border p-1">Red Coral RP2</th>
                        <th className="border-r-2 border-black p-1">Red Barge RP3</th>
                        <th className="border p-1">Blue Auto RP</th>
                        <th className="border p-1">Blue Coral RP2</th>
                        <th className="border p-1">Blue Barge RP3</th>
                    </tr>
                    </thead>
                    <tbody>
                    {matches.map((m, i) => (
                        <tr key={m.matchKey} className="border-t">
                            <td className="border p-1">{m.matchKey}</td>
                            <td className="border p-1 text-red-600">{m.red.join(", ")}</td>
                            <td className="border p-1 text-blue-600">{m.blue.join(", ")}</td>

                            <td className="border p-1 item text-center align-middle">
                                <div className="flex justify-center">
                                    <div className="flex w-20 h-8 rounded overflow-hidden border">
                                        <button
                                            className={`flex-1 ${
                                                m.winner === "red"
                                                    ? "bg-red-500 text-white"
                                                    : "bg-red-100 hover:bg-red-200"
                                            }`}
                                            onClick={() => toggleWinner(i, "red")}
                                        >
                                            R
                                        </button>
                                        <button
                                            className={`flex-1 ${
                                                m.winner === "blue"
                                                    ? "bg-blue-500 text-white"
                                                    : "bg-blue-100 hover:bg-blue-200"
                                            }`}
                                            onClick={() => toggleWinner(i, "blue")}
                                        >
                                            B
                                        </button>
                                    </div>
                                </div>
                            </td>

                            {/* Red RPs */}
                            {m.redRP.map((rp, k) => (
                                <td key={`r${k}`} className="border p-1">
                                    <button
                                        onClick={() => toggleRP(i, "red", k)}
                                        className={`w-6 h-6 rounded border ${
                                            rp
                                                ? "bg-red-500 border-red-700"
                                                : "bg-gray-100 hover:bg-gray-200"
                                        }`}
                                    />
                                </td>
                            ))}

                            {/* Blue RPs */}
                            {m.blueRP.map((rp, k) => (
                                <td key={`b${k}`} className="border p-1">
                                    <button
                                        onClick={() => toggleRP(i, "blue", k)}
                                        className={`w-6 h-6 rounded border ${
                                            rp
                                                ? "bg-blue-500 border-blue-700"
                                                : "bg-gray-100 hover:bg-gray-200"
                                        }`}
                                    />
                                </td>
                            ))}
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>

            {/* RIGHT: Live Ranking */}
            <div className="w-64 border-l-2 border-black pl-3 overflow-auto">
                <h2 className="font-semibold mb-2">Rankings</h2>
                <table className="w-full text-center border-collapse">
                    <thead className="bg-gray-100 sticky top-0">
                    <tr>
                        <th className="border p-1">Rank</th>
                        <th className="border p-1">Team</th>
                        <th className="border p-1">RP</th>
                    </tr>
                    </thead>
                    <tbody>
                    {rankings.map((r, i) => (
                        <tr key={r.team}>
                            <td className="border p-1">{i + 1}</td>
                            <td className="border p-1">{r.team}</td>
                            <td className="border p-1">{r.rp}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}


export function Step2_AllianceSelect({
    rankings,
    alliances,
    setAlliances,
}: {
    rankings: TeamStats[]
    alliances: Alliance[]
    setAlliances: React.Dispatch<React.SetStateAction<Alliance[]>>
}) {

    // --- handle drop ---
    const handleDragEnd = (event: DragEndEvent) => {
        const { over, active } = event
        if (!over) return

        const draggedId = active.id as string
        const draggedTeam = parseInt(draggedId.replace("team-", ""))
        if (isNaN(draggedTeam)) return

        const [targetAllianceStr, targetSlot] = over.id.split(":")
        const allianceIndex = parseInt(targetAllianceStr)

        setAlliances((prev) => {
            // Remove dragged team from any existing slot first
            const updated = prev.map((a) => ({
                ...a,
                captain: a.captain === draggedTeam ? null : a.captain,
                pick1: a.pick1 === draggedTeam ? null : a.pick1,
                pick2: a.pick2 === draggedTeam ? null : a.pick2,
            }))

            // If dropped in the pool area, do not reassign
            if (over.id === "team-pool") return updated

            // Assign to the new slot
            if (!isNaN(allianceIndex))
                updated[allianceIndex] = {
                    ...updated[allianceIndex],
                    [targetSlot]: draggedTeam,
                }

            return updated
        })
    }

    // Calculate which teams are unassigned
    const assignedTeams = new Set(
        alliances.flatMap((a) => [a.captain, a.pick1, a.pick2]).filter(Boolean)
    )
    const unassigned = rankings
        .map((r) => r.team)
        .filter((t) => !assignedTeams.has(t))

    return (
        <div className="flex gap-6 h-full overflow-hidden">
            <DndContext onDragEnd={handleDragEnd}>
                {/* === Left: Draggable Teams (Pool) === */}
                <div className="w-52 border rounded p-2 overflow-hidden">
                    <h3 className="font-semibold mb-2 text-center">Team Pool</h3>
                    <DroppablePool id="team-pool">
                        {unassigned.map((t) => (
                            <DraggableTeam key={t} team={t} />
                        ))}
                    </DroppablePool>
                </div>

                {/* === Right: Alliance Table === */}
                <div className="flex-1 overflow-auto border rounded p-2">
                    <h2 className="text-xl font-semibold mb-2">
                        Step 2 — Alliance Selection
                    </h2>
                    <table className="w-full border text-center">
                        <thead className="bg-gray-100 ">
                            <tr>
                                <th>Alliance</th>
                                <th>Captain</th>
                                <th>Pick 1</th>
                                <th>Pick 2</th>
                            </tr>
                        </thead>
                        <tbody>
                            {alliances.map((a, i) => (
                                <tr key={i}>
                                    <td className="font-semibold border p-1">{i + 1}</td>
                                    {(["captain", "pick1", "pick2"] as const).map((slot) => (
                                        <AllianceSlot
                                            key={slot}
                                            id={`${i}:${slot}`}
                                            current={(a as any)[slot]}
                                        />
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </DndContext>
        </div>
    )
}

// ===== Droppable Team Pool =====
function DroppablePool({
    id,
    children,
}: {
    id: string
    children: React.ReactNode
}) {
    const { setNodeRef, isOver } = useDroppable({ id })
    return (
        <div
            ref={setNodeRef}
            className={`rounded p-1 min-h-[100px] transition-colors ${
                isOver ? "bg-green-100" : ""
            }`}
        >
            {children}
        </div>
    )
}

// ===== Draggable team chips =====
function DraggableTeam({ team }: { team: number }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `team-${team}`,
    })

    const style = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
        cursor: "grab",
    }

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            style={style}
            className="select-none border rounded p-1 my-1 text-center bg-gray-50 hover:bg-gray-100"
        >
            {team}
        </div>
    )
}

// ===== Droppable alliance slots =====
function AllianceSlot({ id, current }: { id: string; current: number | null }) {
    const { setNodeRef, isOver } = useDroppable({ id })

    return (
        <td
            ref={setNodeRef}
            className={`border p-1 text-center align-middle transition-all duration-150
                ${isOver ? "bg-green-100" : ""}
                ${current ? "h-8" : "h-13"}`}
        >
            {current ? <DraggableTeam team={current} /> : "—"}
        </td>
    )
}



// ===== Step 3 — Elimination Simulation =====
function Step3_ElimSim({
                           alliances,
                           results,
                           setResults,
                       }: {
    alliances: Alliance[]
    results: Record<number, number>
    setResults: React.Dispatch<React.SetStateAction<Record<number, number>>>
}) {
    const simulate = () => {
        const newResults: Record<number, number> = {}
        alliances.forEach((_, i) => (newResults[i + 1] = Math.random() * 100))
        setResults(newResults)
    }

    return (
        <div className="flex-1 overflow-auto">
            <h2 className="text-xl font-semibold mb-2">
                Step 3 — Elimination Simulation
            </h2>
            <p className="text-gray-600 mb-2">
                Bracket: 1v8, 4v5, 2v7, 3v6
            </p>
            <button
                onClick={simulate}
                className="border px-3 py-1 rounded mb-3"
            >
                Simulate Bracket
            </button>

            <table className="w-full border text-center">
                <thead className="bg-gray-100">
                <tr>
                    <th>Alliance</th>
                    <th>Teams</th>
                    <th>Win %</th>
                </tr>
                </thead>
                <tbody>
                {alliances.map((a, i) => (
                    <tr key={i}>
                        <td>{i + 1}</td>
                        <td>
                            {[a.captain, a.pick1, a.pick2]
                                .filter(Boolean)
                                .join(", ") || "—"}
                        </td>
                        <td>{results[i + 1]?.toFixed(1) ?? "—"}</td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    )
}
