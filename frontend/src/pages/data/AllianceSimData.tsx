import {useState, useMemo, useEffect} from "react"
import {
    DndContext,
    type DragEndEvent, DragOverlay, type DragStartEvent,
    useDraggable,
    useDroppable,
} from "@dnd-kit/core";
import {CSS} from "@dnd-kit/utilities"
import {Link} from "react-router-dom";

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
    const [recentMatch, setRecentMatch] = useState<string>("qm0")
    const [matches, setMatches] = useState<Match[]>([
  { matchKey: "qm1",  red: [254, 1323, 1678],   blue: [2056, 1114, 118],    winner: "red",  redRP: [true, true, false],  blueRP: [false, true, false] },
  { matchKey: "qm2",  red: [2910, 2767, 5460],  blue: [33, 148, 973],       winner: "blue", redRP: [false, true, false], blueRP: [true, true, false] },
  { matchKey: "qm3",  red: [4414, 195, 1690],   blue: [1325, 4911, 1671],   winner: "red",  redRP: [true, true, false],  blueRP: [false, true, false] },
  { matchKey: "qm4",  red: [2056, 973, 1678],   blue: [1323, 148, 1690],    winner: "blue", redRP: [false, true, false], blueRP: [true, true, false] },
  { matchKey: "qm5",  red: [33, 195, 4414],     blue: [2910, 2056, 1114],   winner: "red",  redRP: [true, true, false],  blueRP: [false, true, false] },
  { matchKey: "qm6",  red: [1325, 910, 3538],   blue: [2481, 118, 3310],    winner: "blue", redRP: [false, true, false], blueRP: [true, true, false] },
  { matchKey: "qm7",  red: [3847, 2471, 971],   blue: [3476, 364, 1241],    winner: "red",  redRP: [true, true, false],  blueRP: [false, true, false] },
  { matchKey: "qm8",  red: [254, 4414, 3538],   blue: [2056, 1323, 1690],   winner: "red",  redRP: [true, true, false],  blueRP: [false, true, false] },
  { matchKey: "qm9",  red: [910, 971, 1241],    blue: [1325, 2767, 973],    winner: "blue", redRP: [false, true, false], blueRP: [true, true, false] },
  { matchKey: "qm10", red: [1671, 148, 3847],   blue: [195, 2481, 3310],    winner: "red",  redRP: [true, true, false],  blueRP: [false, true, false] },
  { matchKey: "qm11", red: [2471, 364, 3476],   blue: [1114, 118, 2910],    winner: "blue", redRP: [false, true, false], blueRP: [true, true, false] },
  { matchKey: "qm12", red: [1678, 5460, 910],   blue: [1323, 2056, 3538],   winner: "blue", redRP: [false, true, false], blueRP: [true, true, false] },
  { matchKey: "qm13", red: [2481, 195, 1241],   blue: [33, 1325, 1671],     winner: "red",  redRP: [true, true, false],  blueRP: [false, true, false] },
  { matchKey: "qm14", red: [971, 3847, 118],    blue: [1690, 3476, 364],    winner: "red",  redRP: [true, true, false],  blueRP: [false, true, false] },
  { matchKey: "qm15", red: [1114, 1323, 1325],  blue: [254, 2056, 4414],    winner: "blue", redRP: [false, true, false], blueRP: [true, true, false] },
  { matchKey: "qm16", red: [971, 1671, 910],    blue: [118, 2910, 5460],    winner: "blue", redRP: [false, true, false], blueRP: [true, true, false] },
  { matchKey: "qm17", red: [148, 1678, 33],     blue: [2056, 1690, 1323],   winner: "red",  redRP: [true, true, false],  blueRP: [false, true, false] },
  { matchKey: "qm18", red: [2767, 1325, 2471],  blue: [3847, 1114, 2481],   winner: "blue", redRP: [false, true, false], blueRP: [true, true, false] },
  { matchKey: "qm19", red: [195, 3538, 3310],   blue: [364, 3476, 5460],    winner: "red",  redRP: [true, true, false],  blueRP: [false, true, false] },
  { matchKey: "qm20", red: [971, 2056, 1323],   blue: [118, 1325, 1678],    winner: "blue", redRP: [false, true, false], blueRP: [true, true, false] },
  { matchKey: "qm21", red: [1114, 148, 254],    blue: [1690, 4414, 2910],   winner: "red",  redRP: [true, true, false],  blueRP: [false, true, false] },
  { matchKey: "qm22", red: [195, 2056, 118],    blue: [971, 1678, 3847],    winner: "blue", redRP: [false, true, false], blueRP: [true, true, false] },
  { matchKey: "qm23", red: [2481, 2767, 3538],  blue: [1241, 1323, 1671],   winner: "red",  redRP: [true, true, false],  blueRP: [false, true, false] },
  { matchKey: "qm24", red: [5460, 364, 3476],   blue: [910, 3310, 2471],    winner: "blue", redRP: [false, true, false], blueRP: [true, true, false] },
]);


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
                    recentMatch={recentMatch}
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

function Step1_QualSim({
                           matches,
                           setMatches,
                           rankings,
                           recentMatch,
                       }: {
    matches: Match[]
    setMatches: React.Dispatch<React.SetStateAction<Match[]>>
    rankings: TeamStats[]
    recentMatch: string
}) {
    const toggleWinner = (i: number, winner: "red" | "blue") => {
        setMatches((prev) =>
            prev.map((m, j) =>
                j === i ? {...m, winner: m.winner === winner ? null : winner} : m
            )
        )
    }

    const toggleRP = (i: number, alliance: "red" | "blue", index: number) => {
        setMatches((prev) =>
            prev.map((m, j) =>
                j === i
                    ? {
                        ...m,
                        [alliance + "RP"]: (m as any)[alliance + "RP"].map(
                            (r: boolean, k: number) => (k === index ? !r : r)
                        ),
                    }
                    : m
            )
        )
    }

    // Match comparison for strings like "qm3", "qm15"
    const matchToNumber = (key: string) =>
        parseInt(key.replace(/\D+/g, ""), 10) || 0
    const isLocked = (matchKey: string) =>
        matchToNumber(matchKey) <= matchToNumber(recentMatch)

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
                    {matches.map((m, i) => {
                        const locked = isLocked(m.matchKey)
                        const isDividerAfter = m.matchKey === recentMatch
                        return (
                            <>
                                <tr
                                    key={m.matchKey}
                                    className={`border-t ${
                                        locked ? "bg-gray-50 text-gray-600" : "bg-white"
                                    }`}
                                >
                                    <td className="border p-1">
                                        <Link
                                            to={`/matches/${m.matchKey}`}
                                            className="text-blue-600 hover:underline"
                                        >
                                            {m.matchKey}
                                        </Link>
                                    </td>
                                    <td className="border p-1 text-red-600">
                                        {m.red.map((t) => (
                                            <Link
                                                key={t}
                                                to={`/teams/${t}`}
                                                className="hover:underline mr-1"
                                            >
                                                {t}
                                            </Link>
                                        ))}
                                    </td>
                                    <td className="border p-1 text-blue-600">
                                        {m.blue.map((t) => (
                                            <Link
                                                key={t}
                                                to={`/teams/${t}`}
                                                className="hover:underline mr-1"
                                            >
                                                {t}
                                            </Link>
                                        ))}
                                    </td>

                                    {/* Winner toggle */}
                                    <td className="border p-1 text-center align-middle">
                                        <div className="flex justify-center">
                                            <div className="flex w-20 h-8 rounded overflow-hidden border">
                                                <button
                                                    disabled={locked}
                                                    className={`flex-1 ${
                                                        m.winner === "red"
                                                            ? "bg-red-500 text-white"
                                                            : "bg-red-100 hover:bg-red-200"
                                                    } ${
                                                        locked ? "opacity-60 cursor-default" : ""
                                                    }`}
                                                    onClick={() => !locked && toggleWinner(i, "red")}
                                                >
                                                    R
                                                </button>
                                                <button
                                                    disabled={locked}
                                                    className={`flex-1 ${
                                                        m.winner === "blue"
                                                            ? "bg-blue-500 text-white"
                                                            : "bg-blue-100 hover:bg-blue-200"
                                                    } ${
                                                        locked ? "opacity-60 cursor-default" : ""
                                                    }`}
                                                    onClick={() => !locked && toggleWinner(i, "blue")}
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
                                                disabled={locked}
                                                onClick={() =>
                                                    !locked && toggleRP(i, "red", k)
                                                }
                                                className={`w-6 h-6 rounded border ${
                                                    rp
                                                        ? "bg-red-500 border-red-700"
                                                        : "bg-gray-100 hover:bg-gray-200"
                                                } ${
                                                    locked ? "opacity-60 cursor-default" : ""
                                                }`}
                                            />
                                        </td>
                                    ))}

                                    {/* Blue RPs */}
                                    {m.blueRP.map((rp, k) => (
                                        <td key={`b${k}`} className="border p-1">
                                            <button
                                                disabled={locked}
                                                onClick={() =>
                                                    !locked && toggleRP(i, "blue", k)
                                                }
                                                className={`w-6 h-6 rounded border ${
                                                    rp
                                                        ? "bg-blue-500 border-blue-700"
                                                        : "bg-gray-100 hover:bg-gray-200"
                                                } ${
                                                    locked ? "opacity-60 cursor-default" : ""
                                                }`}
                                            />
                                        </td>
                                    ))}
                                </tr>

                                {/* add a visible divider after the last played match */}
                                {isDividerAfter && (
                                    <tr>
                                        <td colSpan={10}>
                                            <div className="border-t-4 border-black my-1"></div>
                                        </td>
                                    </tr>
                                )}
                            </>
                        )
                    })}
                    </tbody>
                </table>
            </div>

            {/* RIGHT: Live Ranking */
            }
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
                            <td className="border p-1">
                                <Link
                                    to={`/admin/data/team/${r.team}`}
                                    className="text-blue-600 hover:underline"
                                >
                                    {r.team}
                                </Link>
                            </td>
                            <td className="border p-1">{r.rp}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}


function Step2_AllianceSelect({
                                  rankings,
                                  alliances,
                                  setAlliances,
                              }: {
    rankings: TeamStats[]
    alliances: Alliance[]
    setAlliances: React.Dispatch<React.SetStateAction<Alliance[]>>
}) {
    const [activeTeam, setActiveTeam] = useState<number | null>(null)


    // --- handle drop ---
    const handleDragEnd = (event: DragEndEvent) => {
        const {over, active} = event
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

    const handleDragStart = (event: DragStartEvent) => {
        const id = event.active.id as string
        const team = parseInt(id.replace("team-", ""))
        if (!isNaN(team)) setActiveTeam(team)
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
            <DndContext onDragEnd={handleDragEnd} onDragStart={handleDragStart}>
                {/* === Left: Draggable Teams (Pool) === */}
                <div className="w-52 border rounded p-2 overflow-hidden">
                    <h3 className="font-semibold mb-2 text-center">Team Pool</h3>
                    <DroppablePool id="team-pool">
                        {unassigned.map((t) => (
                            <DraggableTeam key={t} team={t}/>
                        ))}
                    </DroppablePool>
                </div>

                {/* === Right: Alliance Table === */}
                <table className="w-full table-fixed border text-center h-fit">
                    <thead className="bg-gray-100">
                    <tr>
                        <th className="w-20">Alliance</th>
                        <th className="w-32">Captain</th>
                        <th className="w-32">Pick 1</th>
                        <th className="w-32">Pick 2</th>
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

                <DragOverlay>
                    {activeTeam ? <DraggableTeam team={activeTeam}/> : null}
                </DragOverlay>
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
    const {setNodeRef, isOver} = useDroppable({id})
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
function DraggableTeam({team}: { team: number }) {
    const {attributes, listeners, setNodeRef, transform, isDragging} = useDraggable({
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
            className="select-none border rounded p-1 my-1 text-center bg-gray-50 hover:bg-gray-100 w-40"
        >
            {team}
        </div>
    )
}

function AllianceSlot({ id, current }: { id: string; current: number | null }) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <td
      ref={setNodeRef}
      className={`border transition-all duration-150 
                  ${isOver ? "bg-green-100" : ""} 
                  ${current ? "h-10" : "h-12"} p-0`}
    >
      <div className="flex items-center justify-center w-full h-full">
        {current ? (
          <DraggableTeam team={current} />
        ) : (
          <span className="text-gray-400 select-none">—</span>
        )}
      </div>
    </td>
  )
}



// ===== Step 3 — Elimination Simulation =====
type BracketMatch = {
    id: string
    red: number | null
    blue: number | null
    winner: number | null
    winnerDest?: string
    loserDest?: string
}

function Step3_ElimSim({
    alliances,
}: {
    alliances: Alliance[]
}) {
    const [matches, setMatches] = useState<Record<string, BracketMatch>>({})

    // --- Initialize bracket once alliances exist ---
    useEffect(() => {
        if (alliances.filter(a => a.captain).length < 8) return

        const init: Record<string, BracketMatch> = {
            // ----- Upper Bracket -----
            UB1: { id: "UB1", red: 1, blue: 8, winner: null, winnerDest: "UB5", loserDest: "LB1" },
            UB2: { id: "UB2", red: 4, blue: 5, winner: null, winnerDest: "UB5", loserDest: "LB1" },
            UB3: { id: "UB3", red: 2, blue: 7, winner: null, winnerDest: "UB6", loserDest: "LB2" },
            UB4: { id: "UB4", red: 3, blue: 6, winner: null, winnerDest: "UB6", loserDest: "LB2" },
            UB5: { id: "UB5", red: null, blue: null, winner: null, winnerDest: "UB7", loserDest: "LB3" },
            UB6: { id: "UB6", red: null, blue: null, winner: null, winnerDest: "UB7", loserDest: "LB3" },
            UB7: { id: "UB7", red: null, blue: null, winner: null, winnerDest: "GF", loserDest: "LB4" },

            // ----- Lower Bracket -----
            LB1: { id: "LB1", red: null, blue: null, winner: null, winnerDest: "LB2" },
            LB2: { id: "LB2", red: null, blue: null, winner: null, winnerDest: "LB3" },
            LB3: { id: "LB3", red: null, blue: null, winner: null, winnerDest: "LB4" },
            LB4: { id: "LB4", red: null, blue: null, winner: null, winnerDest: "GF" },

            // ----- Grand Final -----
            GF: { id: "GF", red: null, blue: null, winner: null },
        }

        setMatches(init)
    }, [alliances])

    // --- Click to select a winner ---
    const setWinner = (id: string, winner: number, loser: number) => {
        setMatches(prev => {
            const updated = { ...prev }
            const match = updated[id]
            if (!match) return prev
            match.winner = winner

            // Propagate winner
            if (match.winnerDest && updated[match.winnerDest]) {
                const next = updated[match.winnerDest]
                if (!next.red) next.red = winner
                else if (!next.blue) next.blue = winner
            }

            // Propagate loser
            if (match.loserDest && updated[match.loserDest]) {
                const next = updated[match.loserDest]
                if (!next.red) next.red = loser
                else if (!next.blue) next.blue = loser
            }
            return { ...updated }
        })
    }

    const MatchBox = ({ m }: { m: BracketMatch }) => {
        const red = m.red
        const blue = m.blue
        return (
            <div className="border rounded-lg bg-white shadow-sm p-2 text-xs w-32 text-center">
                <div className="font-semibold text-sm mb-1">{m.id}</div>
                {red ? (
                    <button
                        onClick={() => setWinner(m.id, red, blue!)}
                        className={`block w-full rounded px-1 py-0.5 ${
                            m.winner === red
                                ? "bg-green-200 font-bold"
                                : "hover:bg-gray-100"
                        }`}
                    >
                        A{red}
                    </button>
                ) : (
                    <div className="text-gray-400 py-0.5">—</div>
                )}
                {blue ? (
                    <button
                        onClick={() => setWinner(m.id, blue, red!)}
                        className={`block w-full rounded px-1 py-0.5 ${
                            m.winner === blue
                                ? "bg-green-200 font-bold"
                                : "hover:bg-gray-100"
                        }`}
                    >
                        A{blue}
                    </button>
                ) : (
                    <div className="text-gray-400 py-0.5">—</div>
                )}
            </div>
        )
    }

    if (!Object.keys(matches).length)
        return <div className="p-4 text-gray-600">Waiting for alliances...</div>

    // --- Pure grid layout ---
    return (
        <div className="flex-1 overflow-auto p-4">
            <h2 className="text-xl font-semibold mb-3">
                Step 3 — Double Elimination Bracket
            </h2>

            <div className="grid grid-cols-7 gap-x-6 gap-y-4 items-start">
                {/* Upper R1 */}
                <div className="flex flex-col gap-6">
                    <div className="text-center font-semibold">UB R1</div>
                    <MatchBox m={matches.UB1} />
                    <MatchBox m={matches.UB2} />
                    <MatchBox m={matches.UB3} />
                    <MatchBox m={matches.UB4} />
                </div>

                {/* Upper R2 */}
                <div className="flex flex-col gap-16">
                    <div className="text-center font-semibold">UB R2</div>
                    <MatchBox m={matches.UB5} />
                    <MatchBox m={matches.UB6} />
                </div>

                {/* Upper Final */}
                <div className="flex flex-col gap-[14rem]">
                    <div className="text-center font-semibold">UB Final</div>
                    <MatchBox m={matches.UB7} />
                </div>

                {/* Lower R1 */}
                <div className="flex flex-col gap-10">
                    <div className="text-center font-semibold">LB R1</div>
                    <MatchBox m={matches.LB1} />
                </div>

                {/* Lower R2 */}
                <div className="flex flex-col gap-20">
                    <div className="text-center font-semibold">LB R2</div>
                    <MatchBox m={matches.LB2} />
                    <MatchBox m={matches.LB3} />
                </div>

                {/* Lower Final */}
                <div className="flex flex-col gap-[14rem]">
                    <div className="text-center font-semibold">LB Final</div>
                    <MatchBox m={matches.LB4} />
                </div>

                {/* Grand Final */}
                <div className="flex flex-col gap-[14rem]">
                    <div className="text-center font-semibold">Grand Final</div>
                    <MatchBox m={matches.GF} />
                </div>
            </div>
        </div>
    )
}
