// src/pages/blocks/MatchHistoryBlock.tsx
import {useMemo} from "react"
import {Link} from "react-router-dom"
import {AgGridReact} from "ag-grid-react"
import {themeQuartz} from "ag-grid-community"

export default function MatchHistoryBlock({data, permissions}: any) {
    const matches = data.matches ?? []

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
                    cellRenderer: (params: any) => renderMatchLink(params.value, permissions),
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
                                    {renderTeamLink(team, permissions)}
                                </span>
                            ))}
                        </div>
                    ),
                }
            }

            return {field: key, headerName: header, width: 110}
        })
    }, [matches, permissions])

    return (
        <div className="h-full">
            <AgGridReact
                theme={themeQuartz}
                rowData={matches}
                columnDefs={colDefs}
                animateRows
                pagination={false}
                suppressCellFocus
            />
        </div>
    )
}

function normalizeMatchId(raw: any): string {
    if (typeof raw === "string" && raw.toLowerCase().startsWith("qm")) return raw.toLowerCase()
    return `qm${String(raw).toLowerCase()}`
}

function renderMatchLink(matchId: any, permissions: any) {
    const norm = normalizeMatchId(matchId)
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

function renderTeamLink(teamNum: number, permissions: any) {
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