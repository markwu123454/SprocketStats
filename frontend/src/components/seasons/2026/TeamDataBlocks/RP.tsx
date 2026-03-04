// src/pages/blocks/RPCriteriaBlock.tsx
import {useMemo} from "react"
import {Link} from "react-router-dom"
import {AgGridReact} from "ag-grid-react"
import {SquareCheckBig, SquareX} from "lucide-react"
import {useDataContext} from "@/components/wrappers/DataWrapper.tsx"

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
        <Link to={`/data/match/${matchId}`} className="text-blue-600 hover:underline">
            {matchId}
        </Link>
    )
}

export default function RPCriteriaBlock({teamNum, permissions}: { teamNum: number; permissions?: any }) {
    const {processedData} = useDataContext()

    const {rowData, colDefs} = useMemo(() => {
        if (!processedData || !processedData.sb || !Array.isArray(processedData.sb)) {
            return {rowData: [], colDefs: []}
        }

        const teamData = processedData.team?.[teamNum]
        const sb = processedData.sb
        const tba = processedData.tba
        const matchReverseIndex = processedData.match_reverse_index

        const completedMatches = sb.filter((m: any) => m.status === 'Completed')

        const parsedRpData = completedMatches.map((m: any) => {
            const matchKey = m.key
            const shortMatchName = matchReverseIndex?.[matchKey] || matchKey.split('_')[1]

            // Check if team is in this match
            const redTeams = m.alliances?.red?.team_keys ?? []
            const blueTeams = m.alliances?.blue?.team_keys ?? []
            
            // Handle both number and string (frcXXX) formats
            const isRed = redTeams.some((t: any) => String(t) === String(teamNum) || String(t) === `frc${teamNum}`)
            const isBlue = blueTeams.some((t: any) => String(t) === String(teamNum) || String(t) === `frc${teamNum}`)
            const alliance = isRed ? 'red' : isBlue ? 'blue' : null

            if (!alliance) return null

            const totalAllianceFuel = m.result?.[`${alliance}_total_fuel`] || 0
            const totalAllianceTower = m.result?.[`${alliance}_total_tower`] || 0

            const energized = totalAllianceFuel >= 100
            const supercharged = totalAllianceFuel >= 360
            const traversal = totalAllianceTower >= 50

            // Team Fuel Contribution
            let teamFuel = 0
            const teamMatchFuelData = teamData?.fuel?.[shortMatchName]
            if (teamMatchFuelData) {
                teamFuel = (teamMatchFuelData.auto?.fuel || 0) +
                           (teamMatchFuelData.phase_1?.fuel || 0) +
                           (teamMatchFuelData.phase_2?.fuel || 0) +
                           (teamMatchFuelData.transition?.fuel || 0) +
                           (teamMatchFuelData.endgame?.fuel || 0)
            }

            // Team Tower Contribution
            let teamTower = 0
            const tbaMatch = tba?.find((t: any) => t.key === matchKey)
            
            const autoPts: Record<string, number> = { "Level1": 15, "Level2": 30, "Level3": 45, "None": 0 }
            const teleopPts: Record<string, number> = { "Level1": 10, "Level2": 20, "Level3": 30, "None": 0 }

            if (tbaMatch) {
                const tbaAlliance = tbaMatch.alliances?.red?.team_keys?.some((t: any) => String(t) === `frc${teamNum}`) ? 'red' : 'blue'
                const tbaAllianceTeams = tbaMatch.alliances?.[tbaAlliance]?.team_keys ?? []
                const teamIndex = tbaAllianceTeams.findIndex((t: any) => String(t) === `frc${teamNum}`)
                
                if (teamIndex !== -1) {
                    const robotKey = `Robot${teamIndex + 1}`
                    const autoClimb = tbaMatch.score_breakdown?.[tbaAlliance]?.[`autoTower${robotKey}`]
                    const teleopClimb = tbaMatch.score_breakdown?.[tbaAlliance]?.[`endGameTower${robotKey}`]
                    
                    teamTower = (autoPts[autoClimb] || 0) + (teleopPts[teleopClimb] || 0)
                }
            } else if (teamMatchFuelData) {
                // Fallback to internal scouting climb data
                teamTower = (autoPts[teamMatchFuelData.autonclimb] || 0) + (teleopPts[teamMatchFuelData.teleopclimb] || 0)
            }

            return {
                Match: matchReverseIndex?.[matchKey] ?? m.match_name ?? matchKey,
                "Energized": energized,
                "Supercharged": supercharged,
                "Fuel Contribution": teamFuel,
                "Traversal": traversal,
                "Tower Contribution": teamTower,
            }
        }).filter(Boolean)

        if (parsedRpData.length === 0) {
            return {rowData: [], colDefs: []}
        }

        const columns = [
            { field: "Match", flex: 1, minWidth: 100, cellRenderer: (params: any) => renderMatchLink(params.value, permissions) },
            { field: "Energized", flex: 1, minWidth: 120, cellRenderer: booleanCellRenderer },
            { field: "Supercharged", flex: 1, minWidth: 120, cellRenderer: booleanCellRenderer },
            { field: "Fuel Contribution", flex: 1, minWidth: 120 },
            { field: "Traversal", flex: 1, minWidth: 120, cellRenderer: booleanCellRenderer },
            { field: "Tower Contribution", flex: 1, minWidth: 120 },
        ]

        return {rowData: parsedRpData, colDefs: columns}
    }, [processedData, teamNum, permissions])

    function booleanCellRenderer(params: any) {
        const v = params.value
        if (typeof v === "boolean") {
            return (
                <div className="flex items-center justify-center h-full">
                    {v ? (
                        <SquareCheckBig className="h-5 w-5 text-green-600"/>
                    ) : (
                        <SquareX className="h-5 w-5 text-red-600"/>
                    )}
                </div>
            )
        }
        return <span className="text-gray-900">{String(v ?? "")}</span>
    }

    if (!rowData || rowData.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-gray-400 text-xs">
                No RP data available
            </div>
        )
    }

    return (
        <div className="h-full">
            <AgGridReact
                rowData={rowData}
                columnDefs={colDefs}
                animateRows
                pagination={false}
                suppressCellFocus
            />
        </div>
    )
}
