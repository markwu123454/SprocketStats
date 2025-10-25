/* Subset of pages for displaying each team's data
Can use guest perms to view

get all data from useAPI: getProcessedData
Need to include:
team nickname(fetch using useAPI: getTeamBasicInfo), team number, team logo(in public/teams/team_icons)
Team current rp, team current ranking, team predicted rp, team predicted ranking
list of matches(past and future) with links to the match page.
rp source breakdown(pie chart)

include for 2025(future data should all be derived from data dict format):
team average l1, l2, l3, l4, barge, processor(count, and accuracy, and for auto and teleop), climb preference and success
team average score composition(pie chart)
team scores over time(line graph)
*/


// src/pages/TeamData.tsx
import {useEffect, useMemo, useState} from "react"
import {useParams} from "react-router-dom"
// SKIPPED: imports for your chart lib (e.g., recharts) if desired
// SKIPPED: shadcn/ui Card components; plain Tailwind used for neutrality

type RPContribution = {
  winRP: number
  coralRP: number
  algaeRP: number
  coopRP: number
}

type MatchRow = {
  key: string
  phase: "qm" | "qf" | "sf" | "f"
  number: string
  alliance: "red" | "blue"
  result: "W" | "L" | "T" | "-"
  rp: number
  score: number | null
  scheduled?: string // ISO for future matches
}

type MetricCell = string | number | null
type MetricRow = { label: string; values: MetricCell[] }
type MetricSection = { title: string; columns: string[]; rows: MetricRow[] }

export default function TeamData() {
  const {team} = useParams<{ team: string }>()
  const teamNum = team ? parseInt(team, 10) : NaN

  // ---- Data state (wire-up to your useAPI) ----
  const [nickname, setNickname] = useState<string>("")
  const [logoUrl, setLogoUrl] = useState<string>("")
  const [currentRank, setCurrentRank] = useState<number | null>(null)
  const [predRank, setPredRank] = useState<number | null>(null)
  const [currentRP, setCurrentRP] = useState<number | null>(null)
  const [predRP, setPredRP] = useState<number | null>(null)
  const [rpContrib, setRpContrib] = useState<RPContribution | null>(null)
  const [matchRows, setMatchRows] = useState<MatchRow[]>([])
  const [metricSections, setMetricSections] = useState<MetricSection[]>([])

  useEffect(() => {
    if (!teamNum) return

    // ---- Identity & assets ----
    setNickname("") // replace via getTeamBasicInfo(teamNum)
    setLogoUrl(`/teams/team_icons/${teamNum}.png`) // public folder

    // ---- Example placeholders (replace with getProcessedData outputs) ----
    setCurrentRank(3)
    setPredRank(2)
    setCurrentRP(2.43)
    setPredRP(2.61)

    setRpContrib({
      winRP: 2.10,
      coralRP: 0.34,
      algaeRP: 0.17,
      coopRP: 0.09,
    })

    setMatchRows([
      {key: "2025oc_qm1", phase: "qm", number: "1", alliance: "red", result: "W", rp: 3, score: 142},
      {key: "2025oc_qm2", phase: "qm", number: "2", alliance: "blue", result: "L", rp: 1, score: 112},
      {key: "2025oc_qm3", phase: "qm", number: "3", alliance: "red", result: "W", rp: 2, score: 130},
      {key: "2025oc_qf1", phase: "qf", number: "1", alliance: "red", result: "W", rp: 0, score: 145},
      {key: "2025oc_qm4", phase: "qm", number: "4", alliance: "blue", result: "-", rp: 0, score: null, scheduled: "2025-10-25T14:35:00-07:00"},
    ])

    setMetricSections([
      {
        title: "General",
        columns: ["Metric", "Value"],
        rows: [
          {label: "Average Score", values: [128.4]},
          {label: "RP / Match", values: [2.10]},
          {label: "Win %", values: ["67%"]},
          {label: "Defense Impact (opp Δ)", values: [-6.8]},
        ],
      },
      {
        title: "Auto",
        columns: ["Metric", "Auto", "Teleop", "Overall"],
        rows: [
          {label: "Coral L1", values: [2.3, 3.1, 5.4]},
          {label: "Coral L2", values: [1.1, 2.0, 3.1]},
          {label: "Processor (acc.)", values: ["85%", "92%", "88%"]},
        ],
      },
      {
        title: "Endgame",
        columns: ["Metric", "Value"],
        rows: [
          {label: "Climb Success", values: ["92%"]},
          {label: "Preferred Level", values: ["High"]},
        ],
      },
      {
        title: "Reliability",
        columns: ["Metric", "Value"],
        rows: [
          {label: "Fouls / Match", values: [0.3]},
          {label: "Disconnect Rate", values: ["0%"]},
        ],
      },
    ])
  }, [teamNum])

  const tags = useMemo(() => {
    const t: string[] = []
    // Derive tags from data; placeholders:
    t.push("High Auto")
    t.push("Fast Climb")
    t.push("Reliable")
    return t
  }, [])

  return (
    <div className="h-full w-full bg-gray-50">
      {/* ===== Sticky Header ===== */}
      <div className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img
              src={logoUrl}
              alt={`Team ${teamNum} logo`}
              className="h-12 w-12 rounded bg-white object-contain ring-1 ring-gray-200"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden" }}
            />
            <div className="leading-tight">
              <div className="text-xl font-semibold">
                #{teamNum}{nickname ? ` “${nickname}”` : ""}
              </div>
              <div className="text-sm text-gray-600">
                Rank {fmt(currentRank)} ({trendArrow(currentRank, predRank)})
                <span className="mx-2">•</span>
                RP {fmt(currentRP)} (pred {fmt(predRP)})
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border px-2 py-0.5 text-xs text-gray-700 bg-gray-100"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
          {/* SKIPPED: event selector / compare toggle */}
        </div>
      </div>

      {/* ===== Matrix Dashboard (2x2) ===== */}
      <div className="mx-auto max-w-7xl p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* A. Metrics Overview */}
        <Card title="A. Metrics Overview">
          <div className="space-y-6">
            {metricSections.map((sec) => (
              <MetricTable key={sec.title} section={sec}/>
            ))}
          </div>
        </Card>

        {/* B. RP Contribution */}
        <Card title="B. RP Contribution">
          {rpContrib ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-full">
              <div className="min-h-[220px]">
                {/* SKIPPED: Replace with your Pie/Bar chart */}
                <ChartPlaceholder label="RP Contribution Chart (pie/bar)"/>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <tbody className="[&>tr>td]:py-1">
                  <tr><td className="text-gray-600">Win RP</td><td className="text-right font-medium">{rpContrib.winRP.toFixed(2)}</td></tr>
                  <tr><td className="text-gray-600">Coral RP</td><td className="text-right font-medium">{rpContrib.coralRP.toFixed(2)}</td></tr>
                  <tr><td className="text-gray-600">Algae RP</td><td className="text-right font-medium">{rpContrib.algaeRP.toFixed(2)}</td></tr>
                  <tr><td className="text-gray-600">Coop RP</td><td className="text-right font-medium">{rpContrib.coopRP.toFixed(2)}</td></tr>
                  </tbody>
                </table>
                <div className="mt-4">
                  {/* SKIPPED: small bar comparing to event average */}
                  <ChartPlaceholder label="RP vs Event Avg (bar)"/>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState text="No RP data"/>
          )}
        </Card>

        {/* C. Match History */}
        <Card title="C. Match History">
          <MatchTable rows={matchRows}/>
        </Card>

        {/* D. Scoring & Trends */}
        <Card title="D. Scoring & Trends">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="min-h-[240px]">
              {/* SKIPPED: Score Composition Pie/Stacked Bar */}
              <ChartPlaceholder label="Score Composition (pie/stacked bar)"/>
            </div>
            <div className="min-h-[240px]">
              {/* SKIPPED: Score Over Time Line */}
              <ChartPlaceholder label="Score Over Time (line)"/>
            </div>
            <div className="min-h-[200px] xl:col-span-2">
              {/* SKIPPED: Climb success trend (line/scatter) w/ auto/tele toggle */}
              <ChartPlaceholder label="Climb Success Trend (line/scatter)"/>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

/* ================= Components ================= */

function Card({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden flex flex-col min-h-[320px]">
      <div className="border-b px-4 py-2.5 font-semibold text-gray-800">{title}</div>
      <div className="p-4 overflow-auto grow">{children}</div>
    </div>
  )
}

function EmptyState({text}: {text: string}) {
  return (
    <div className="h-full flex items-center justify-center text-gray-500 text-sm">
      {text}
    </div>
  )
}

function MetricTable({section}: {section: MetricSection}) {
  return (
    <div className="rounded-lg border">
      <div className="px-3 py-2 border-b text-sm font-medium text-gray-800">{section.title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
          <tr>
            {section.columns.map((c, i) => (
              <th key={i} className={`px-3 py-2 font-medium ${i === 0 ? "text-left w-1/3" : "text-right"}`}>{c}</th>
            ))}
          </tr>
          </thead>
          <tbody>
          {section.rows.map((r) => (
            <tr key={r.label} className="border-t">
              <td className="px-3 py-2 text-left">{r.label}</td>
              {r.values.map((v, i) => (
                <td key={i} className="px-3 py-2 text-right tabular-nums">{fmt(v)}</td>
              ))}
            </tr>
          ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MatchTable({rows}: {rows: MatchRow[]}) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-600">
        <tr>
          <th className="px-3 py-2 text-left w-20">Match</th>
          <th className="px-3 py-2 text-center w-20">Alliance</th>
          <th className="px-3 py-2 text-center w-16">Res</th>
          <th className="px-3 py-2 text-center w-16">RP</th>
          <th className="px-3 py-2 text-right w-20">Score</th>
          <th className="px-3 py-2 text-right">Time</th>
        </tr>
        </thead>
        <tbody>
        {rows.map((m) => {
          const code = `${m.phase.toUpperCase()}${m.number}`
          const isFuture = m.result === "-" && m.score == null
          return (
            <tr key={m.key} className="border-t hover:bg-gray-50">
              <td className="px-3 py-2 text-left">
                <a className="text-blue-600 hover:underline" href={`/matches/${m.key}`}>{code}</a>
              </td>
              <td className="px-3 py-2 text-center">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${m.alliance === "red" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                  {m.alliance.toUpperCase()}
                </span>
              </td>
              <td className="px-3 py-2 text-center">
                {isFuture ? <span className="text-gray-400">—</span> : (
                  <span className={`${m.result === "W" ? "text-green-700" : m.result === "L" ? "text-red-700" : "text-gray-700"} font-semibold`}>{m.result}</span>
                )}
              </td>
              <td className="px-3 py-2 text-center tabular-nums">{m.rp}</td>
              <td className="px-3 py-2 text-right tabular-nums">{m.score ?? "—"}</td>
              <td className="px-3 py-2 text-right text-gray-500">
                {m.scheduled ? new Date(m.scheduled).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"}) : "—"}
              </td>
            </tr>
          )
        })}
        </tbody>
      </table>
    </div>
  )
}

function ChartPlaceholder({label}: {label: string}) {
  return (
    <div className="h-full min-h-[160px] w-full rounded-lg border border-dashed flex items-center justify-center text-xs text-gray-500">
      {label}
    </div>
  )
}

/* ================= Utils ================= */

function fmt(v: MetricCell): string {
  if (v === null || v === undefined) return "—"
  if (typeof v === "number") {
    // Heuristic formatting
    if (Math.abs(v) >= 100) return v.toFixed(0)
    if (Math.abs(v) >= 10) return v.toFixed(1)
    return v.toFixed(2)
  }
  return String(v)
}

function trendArrow(curr: number | null, pred: number | null): string {
  if (curr == null || pred == null) return "—"
  if (pred < curr) return "↑" // better rank (numerically lower)
  if (pred > curr) return "↓"
  return "→"
}

