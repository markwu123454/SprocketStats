// src/pages/TeamDataPage.tsx
import React, {useEffect, useMemo, useState} from "react"
import {Link, useParams} from "react-router-dom"
import {ResponsiveSunburst} from "@nivo/sunburst"
import {ResponsiveBar} from "@nivo/bar"
import {AgGridReact} from "ag-grid-react"
import {useTeamData, usePermissions} from "@/components/wrappers/DataWrapper.tsx"
import {SquareCheckBig, SquareX} from "lucide-react";
import {themeQuartz} from "ag-grid-community";
import DataSearch from "@/components/ui/dataSearch.tsx";

type BreakdownNode = {
    id: string
    label: string
    value?: number
    children?: BreakdownNode[]
    sumValue?: number
}

// ============================================================
// Main Component
// ============================================================
export default function TeamData() {
    const {team} = useParams<{ team: string }>()
    const teamNum = team ? parseInt(team, 10) : NaN
    const data = useTeamData(teamNum)
    const permissions = usePermissions()
    const [teamNames, setTeamNames] = useState<Record<string, string>>({});
    const [teamName, setTeamName] = useState("Unknown Team");

    useEffect(() => {
        fetch("/teams/team_names.json")
            .then(res => res.json())
            .then((data: Record<string, string>) => setTeamNames(data))
            .catch(() => setTeamNames({}));
    }, []);

    useEffect(() => {
        setTeamName(teamNames[teamNum] ?? "Unknown Team");
    }, [teamNum, teamNames]);

    useEffect(() => {
        document.title = `${teamNum} | Team Data`
    }, [teamNum])

    if (isNaN(teamNum)) {
        return (
            <div className="flex h-screen w-screen items-center justify-center text-gray-500">
                Invalid team number
            </div>
        )
    }

    if (!data) {
        console.log('No data available for team', teamNum)
        return (
            <div className="flex h-screen w-screen items-center justify-center text-gray-500">
                Loading team data…
            </div>
        )
    }

    // FIX: Handle both data.basic.tags and data.tags
    const tags = data.basic?.tags ?? data.tags ?? []
    const ranking = data.ranking ?? {}
    const metrics = data.metrics ?? {}
    const matches = data.matches ?? []
    const rp = data.rp ?? {}
    const timeline = data.timeline ?? []
    const breakdown = data.breakdown ?? {id: 'root', label: 'Score', children: []}

    const logoPath = `/teams/team_icons/${teamNum}.png`

    // ---- Table data and columns ----
    const rowData = matches

    const colDefs = useMemo(() => {
        if (!matches || !matches.length) return []
        return Object.keys(matches[0]).map((key) => {
            const header = key
                .replace(/_/g, " ")
                .replace(/\b\w/g, (c) => c.toUpperCase())

            if (key === "match") {
                return {
                    field: key,
                    headerName: header,
                    width: 100,
                    cellRenderer: (params: any) => renderMatchLink(params.value),
                }
            }

            if (key === "own_alliance" || key === "opp_alliance") {
                return {
                    field: key,
                    headerName: header,
                    width: 180,
                    cellRenderer: (params: any) => (
                        <div className="flex flex-wrap gap-1">
                            {params.value.map((team: number) => (
                                <span key={team}>
                                    {renderTeamLink(team)}
                                </span>
                            ))}
                        </div>
                    ),
                }
            }

            return {field: key, headerName: header, width: 110}
        })
    }, [matches])

    const scoreComposition = useMemo(() => buildScoreComposition(breakdown), [breakdown])
    const keys = useMemo(
        () => (timeline?.length ? Object.keys(timeline[0]).filter((k) => k !== "match") : []),
        [timeline]
    )

    function normalizeMatchId(raw: any): string {
        // If already like "qm1", return as is
        if (typeof raw === "string" && raw.toLowerCase().startsWith("qm")) return raw.toLowerCase()

        // If raw is a number, convert to "qmX"
        return `qm${String(raw).toLowerCase()}`
    }


    function renderMatchLink(matchId: any) {
        const norm = normalizeMatchId(matchId)
        console.log(norm, permissions)
        if (!permissions?.match?.includes(norm)) {
            return <span className="text-gray-400">{matchId}</span>
        }


        return (
            <Link
                to={`/data/match/${matchId}`}
                className="text-blue-600 hover:underline"
            >
                {matchId}
            </Link>
        )
    }


    function renderTeamLink(teamNum: number) {
        if (!permissions?.team?.map(String).includes(String(teamNum))) {
            return <span className="text-gray-400">{teamNum}</span>
        }

        return (
            <Link
                to={`/data/team/${teamNum}`}
                className="text-blue-600 hover:underline"
            >
                {teamNum}
            </Link>
        )
    }


    // ============================================================
    // Render
    // ============================================================
    return (
        <div className="min-h-screen w-screen overflow-x-hidden bg-gray-50 flex flex-col">
            {/* ===== Header ===== */}
            <header
                className="flex-none border-b bg-white/90 backdrop-blur px-4 py-2 flex items-center justify-between h-[3.5rem]">
                <div className="flex items-center gap-3 min-w-0">
                    <img
                        src={logoPath}
                        alt="logo"
                        className="h-8 w-8 rounded bg-white object-contain ring-1 ring-gray-200"
                        onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                    />
                    <div className="truncate font-semibold text-base">
                        #{teamNum} {teamName}
                    </div>
                    <DataSearch
                        teamNames={teamNames}
                        permissions={permissions}
                    />
                </div>

                <div className="flex items-center gap-6 text-sm text-gray-700">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                        <RankLabel label="Auto" value={ranking.auto}/>
                        <RankLabel label="Teleop" value={ranking.teleop}/>
                        <RankLabel label="Endgame" value={ranking.endgame}/>
                        <div className="flex items-center">
                            <span className="text-gray-500">RP: #</span>
                            <span className="font-bold text-gray-900">{ranking.rp ?? '-'}</span>
                            <span className="text-gray-500">(pred: #</span>
                            <span className="font-bold text-gray-900">{ranking.rp_pred ?? '-'}</span>
                            <span className="text-gray-500">)</span>
                        </div>
                        <div className="flex items-center">
                            <span className="text-gray-500">Avg RP:&nbsp;</span>
                            <span className="font-bold text-gray-900">{ranking.rp_avg?.toFixed(2) ?? '-'}</span>
                            <span className="text-gray-500">(pred:&nbsp;</span>
                            <span className="font-bold text-gray-900">{ranking.rp_avg_pred?.toFixed(2) ?? '-'}</span>
                            <span className="text-gray-500">)</span>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-1">
                        {tags.map((t: string) => (
                            <span
                                key={t}
                                className="rounded-full border px-2 py-0.5 text-[10px] text-gray-700 bg-gray-100"
                            >
                                {t}
                            </span>
                        ))}
                    </div>
                </div>
            </header>

            {/* ===== Main Dashboard ===== */}
            <main
                className="
    grow
    flex md:grid
    md:grid-cols-2 md:grid-rows-2
    gap-2 p-2

    overflow-x-auto md:overflow-hidden
    snap-x snap-mandatory md:snap-none
  "
            >

                <Quadrant title="Metrics Overview">
                    <div className="p-4">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2 text-sm">
                            {Object.entries(metrics).map(([key, val]) => {
                                const valueStr = String(val).toLowerCase()
                                const colorClass =
                                    valueStr === "yes"
                                        ? "text-green-600"
                                        : valueStr === "no"
                                            ? "text-red-600"
                                            : "text-gray-900"

                                return (
                                    <div key={key} className="flex justify-between border-b border-gray-100 py-1">
                                        <span className="text-gray-500">{key}</span>
                                        <span className={`font-medium ${colorClass}`}>{String(val)}</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </Quadrant>

                <Quadrant title="RP Criteria">
                    <div className="h-full w-full">
                        <DynamicAgGrid
                            data={Object.entries(rp).map(([match, rpData]) => ({
                                Match: match,
                                ...rpData,
                            }))}
                        />
                    </div>
                </Quadrant>

                <Quadrant title="Match History">
                    <div className="h-full w-full">
                        <AgGridReact
                            theme={themeQuartz}
                            rowData={rowData}
                            columnDefs={colDefs}
                            animateRows
                            pagination={false}
                            suppressCellFocus
                        />
                    </div>
                </Quadrant>

                <Quadrant title="Scoring & Trends">
                    <div className="grid grid-cols-2 gap-2 h-full">
                        <div className="h-full w-full">
                            <ResponsiveSunburst
                                data={scoreComposition}
                                margin={{top: 10, right: 10, bottom: 10, left: 10}}
                                id="id"
                                value="value"
                                cornerRadius={3}
                                borderWidth={2}
                                borderColor={{from: "color", modifiers: [["brighter", 0.2]]}}
                                colors={{scheme: "paired"}}
                                childColor={{from: "color"}}
                                enableArcLabels
                                arcLabel={(d) => (d.depth <= 3 ? d.data.label : "")}
                                arcLabelsRadiusOffset={0.65}
                                arcLabelsSkipAngle={0}
                                arcLabelsTextColor={{from: "color", modifiers: [["darker", 2]]}}
                                tooltip={({data, color}) => (
                                    <div
                                        style={{background: color}}
                                        className="px-2 py-1 text-xs text-white rounded"
                                    >
                                        {data.label}: {data.value ?? data.sumValue ?? 0}
                                    </div>
                                )}
                                animate={false}
                            />
                        </div>

                        <div className="h-full w-full">
                            <ResponsiveBar
                                data={timeline}
                                keys={keys}
                                indexBy="match"
                                margin={{top: 10, right: 10, bottom: 30, left: 40}}
                                padding={0.3}
                                groupMode="stacked"
                                colors={{scheme: "set2"}}
                                axisBottom={{
                                    tickRotation: -25,
                                    tickPadding: 4,
                                    legend: "Match",
                                    legendOffset: 28,
                                }}
                                axisLeft={{
                                    legend: "Points",
                                    legendOffset: -32,
                                    legendPosition: "middle",
                                }}
                                labelSkipWidth={16}
                                labelSkipHeight={12}
                                labelTextColor={{from: "color", modifiers: [["darker", 2]]}}
                                tooltip={({id, value, color}) => (
                                    <div
                                        className="px-2 py-1 text-xs text-white rounded"
                                        style={{background: color}}
                                    >
                                        {id}: {value}
                                    </div>
                                )}
                                animate={false}
                            />
                        </div>
                    </div>
                </Quadrant>
            </main>
        </div>
    )
}

// ============================================================
// Helpers
// ============================================================
function Quadrant({title, children}: { title: string; children: React.ReactNode }) {
    return (
        <section
            className="
        rounded-lg border bg-white shadow-sm overflow-hidden flex flex-col

        w-full md:w-auto
        shrink-0
        snap-start

        h-[calc(100vh-5rem)]
        md:h-[calc((100vh-5rem)/2)]
      "
        >
            <div className="border-b px-3 py-1.5 text-sm font-semibold text-gray-800 shrink-0">
                {title}
            </div>
            <div className="flex-1 overflow-hidden p-2">{children}</div>
        </section>
    )
}


function RankLabel({label, value}: { label: string; value: number }) {
    return (
        <div className="flex items-center">
            <span className="text-gray-500">{label}: #</span>
            <span className="font-bold text-gray-900">{value ?? '-'}</span>
        </div>
    )
}

// ============================================================
// Dynamic AgGrid (infers columns and types automatically)
// ============================================================
function DynamicAgGrid({data}: { data: any[] }) {
    const [colDefs, setColDefs] = useState<any[]>([])
    const [rowData, setRowData] = useState<any[]>([])

    useEffect(() => {
        if (!data || !Array.isArray(data) || data.length === 0) {
            setColDefs([])
            setRowData([])
            return
        }

        // Recursively flatten nested objects
        const flattenObject = (obj: any, prefix = ""): Record<string, any> =>
            Object.entries(obj).reduce((acc, [key, value]) => {
                const newKey = prefix ? `${prefix} ${key}` : key
                if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                    Object.assign(acc, flattenObject(value, newKey))
                } else {
                    acc[newKey] = value
                }
                return acc
            }, {} as Record<string, any>)

        const flattened = data.map((row) => flattenObject(row))
        const allKeys = Array.from(new Set(flattened.flatMap((r) => Object.keys(r))))

        const columns = allKeys.map((key) => ({
            field: key,
            headerName: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            flex: 1,
            minWidth: 100,
            sortable: true,
            filter: true,
            cellRenderer: (params: any) => {
                const v = params.value
                if (typeof v === "boolean")
                    return (
                        <div className="flex items-center justify-center h-full">
                            {v ? (
                                <SquareCheckBig className="h-5 w-5 text-green-600"/>
                            ) : (
                                <SquareX className="h-5 w-5 text-red-600"/>
                            )}
                        </div>
                    )
                return <span className="text-gray-900">{String(v ?? "")}</span>
            },
        }))

        setColDefs(columns)
        setRowData(flattened)
    }, [data])

    if (!data || data.length === 0)
        return (
            <div
                className="h-full flex items-center justify-center text-gray-400 text-xs border border-dashed rounded-lg">
                No RP data available
            </div>
        )

    return (
        <AgGridReact
            rowData={rowData}
            columnDefs={colDefs}
            animateRows
            pagination={false}
            suppressCellFocus
        />
    )
}


// ============================================================
// Sunburst Utility
// ============================================================
function buildScoreComposition(root: BreakdownNode): BreakdownNode {
    const clone: BreakdownNode = structuredClone(root)
    annotateTotals(clone)
    return clone
}

function annotateTotals(node: BreakdownNode): number {
    if (!node.children || node.children.length === 0) return node.value ?? 0
    const total = node.children.map(annotateTotals).reduce((a, b) => a + b, 0)
    node.sumValue = total
    return total
}