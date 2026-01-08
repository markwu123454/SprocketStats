import React, {useEffect, useMemo, useRef, useState} from "react";
import {
    AgGridReact, type AgGridReact as AgGridReactType
} from "ag-grid-react";
import {themeQuartz} from "ag-grid-community";
import {usePermissions} from "@/components/wrappers/DataWrapper.tsx";
import {Link} from "react-router-dom";
import {ResponsiveScatterPlot, type ScatterPlotNodeProps} from "@nivo/scatterplot"
import {ResponsiveRadar} from "@nivo/radar"
import DataSearch from "@/components/ui/dataSearch.tsx";

type BaseDatum = { x: number; y: number }

type CustomNodeProps<T extends BaseDatum> =
    ScatterPlotNodeProps<T> & {
    selectedTeam: number | null
}

type MetricMeta = {
    higherIsBetter: boolean
}

// placeholder – replace with DataWrapper later
const metricMeta: Record<string, MetricMeta> = {
    "epa.total": {higherIsBetter: true},
    "epa.auto": {higherIsBetter: true},
    "rank.overall": {higherIsBetter: false},
    "rank.district": {higherIsBetter: false},
}


const CustomScatterNode = <T extends BaseDatum>({
                                                    node,
                                                    style,
                                                    selectedTeam,
                                                }: CustomNodeProps<T>) => {
    const x = style.x.get()
    const y = style.y.get()
    const size = style.size.get()

    const teamId =
        // 1D scatter → team is serieId
        (node.data as any).team ??
        node.serieId

    const isSelected =
        selectedTeam !== null &&
        String(teamId) === String(selectedTeam)

    const isAnySelected = selectedTeam !== null

    if (isSelected) {
        return (
            <g transform={`translate(${x}, ${y})`}>
                <circle
                    r={size + 6}
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth={2}
                    opacity={0.7}
                />
                <polygon
                    points={`
                        0,-${size}
                        ${size},0
                        0,${size}
                        -${size},0
                    `}
                    fill="#2563eb"
                    stroke="#1e40af"
                    strokeWidth={2}
                />
            </g>
        )
    }

    return (
        <circle
            cx={x}
            cy={y}
            r={size / 2}
            fill="#9ca3af"
            opacity={isAnySelected ? 0.35 : 1}
        />
    )
}


/**
 * Recursively builds AG Grid column definitions from data shape
 */
export default function RankingData() {
    //const rankingData = useRankingData(); // assumed array of objects
    const permissions = usePermissions()

    const gridRef = useRef<AgGridReactType<any>>(null)

    const [selectedTeam, setSelectedTeam] = useState<number | null>(null)
    const [selectedMetric, setSelectedMetric] = useState<string | null>(null)
    const [xMetric, setXMetric] = useState<string | null>(null)
    const [graphType, setGraphType] = useState<
        "box" | "scatter" | "scatter2d" | "radar"
    >("scatter")
    const [teamNames, setTeamNames] = useState({})

    useEffect(() => {
        fetch("/teams/team_names.json")
            .then((res) => res.json())
            .then((data) => setTeamNames(data))
            .catch(() => setTeamNames({}));
    }, []);

    const rankingData = useMemo(() => [
        {
            team: 1678,
            epa: {total: 1, auto: 2},
            rank: {overall: 3, district: 4}
        },
        {
            team: 971,
            epa: {total: 29.4, auto: 10.8},
            rank: {overall: 6, district: 4}
        },
        {
            team: 2056,
            epa: {total: 18.9, auto: 6.3},
            rank: {overall: 12, district: 8}
        },
        {
            team: 399,
            epa: {total: 34.1, auto: 14.7},
            rank: {overall: 4, district: 2}
        },
        {
            team: 148,
            epa: {total: 27.2, auto: 9.5},
            rank: {overall: 9, district: 6}
        },
        {
            team: 1114,
            epa: {total: 16.4, auto: 5.9},
            rank: {overall: 18, district: 11}
        },
        {
            team: 6800,
            epa: {total: 21.7, auto: 7.1},
            rank: {overall: 14, district: 9}
        },
        {
            team: 7457,
            epa: {total: 11.3, auto: 4.2},
            rank: {overall: 27, district: 15}
        },
        {
            team: 2910,
            epa: {total: 31.8, auto: 12.6},
            rank: {overall: 7, district: 5}
        },
        {
            team: 5588,
            epa: {total: 9.4, auto: 3.3},
            rank: {overall: 33, district: 19}
        },
        {
            team: 2137,
            epa: {total: 23.6, auto: 8.9},
            rank: {overall: 11, district: 7}
        },
        {
            team: 1023,
            epa: {total: 14.8, auto: 5.1},
            rank: {overall: 21, district: 13}
        },
        {
            team: 6328,
            epa: {total: 19.2, auto: 6.7},
            rank: {overall: 16, district: 10}
        },
        {
            team: 870,
            epa: {total: 26.5, auto: 9.8},
            rank: {overall: 10, district: 6}
        },
        {
            team: 4476,
            epa: {total: 12.9, auto: 4.6},
            rank: {overall: 25, district: 14}
        },
        {
            team: 5727,
            epa: {total: 8.1, auto: 2.9},
            rank: {overall: 38, district: 22}
        },
        {
            team: 3647,
            epa: {total: 22.4, auto: 7.8},
            rank: {overall: 13, district: 8}
        },
        {
            team: 1986,
            epa: {total: 17.6, auto: 6.2},
            rank: {overall: 17, district: 11}
        },
        {
            team: 5006,
            epa: {total: 6.9, auto: 2.4},
            rank: {overall: 44, district: 26}
        },
        {
            team: 2468,
            epa: {total: 28.9, auto: 11.4},
            rank: {overall: 8, district: 5}
        }
    ], [])

    function useMetricMeta(metric: string | null) {
        return useMemo(
            () => (metric ? metricMeta[metric] ?? {higherIsBetter: true} : null),
            [metric]
        )
    }

    const selectedMetricMeta = useMetricMeta(selectedMetric)
    const xMetricMeta = useMetricMeta(xMetric)
    const yMetricMeta = selectedMetricMeta

    const columnDefs = useMemo(() => {
        if (!rankingData || rankingData.length === 0) return []
        return buildColumnDefsFromObject(rankingData[0])
    }, [rankingData, selectedTeam, selectedMetric])

    const defaultColDef = useMemo(() => ({
        sortable: true,
        filter: true,
        resizable: true
    }), []);


    function getMetricValue(row: any, metric: string) {
        return metric.split(".").reduce((acc, key) => acc?.[key], row)
    }

    function normalizeMetric(
        value: number,
        min: number,
        max: number,
        higherIsBetter: boolean
    ) {
        if (max === min) return 1
        const t = (value - min) / (max - min)
        return higherIsBetter ? t : 1 - t
    }

    function extractNumericMetrics(
        obj: Record<string, any>,
        parentKey = ""
    ): string[] {
        return Object.entries(obj).flatMap(([key, value]) => {
            const path = parentKey ? `${parentKey}.${key}` : key

            if (typeof value === "number") {
                return [path]
            }

            if (value && typeof value === "object" && !Array.isArray(value)) {
                return extractNumericMetrics(value, path)
            }

            return []
        })
    }

    const scatterData = useMemo(() => {
        if (!selectedMetric || !selectedMetricMeta) return []

        const sorted = [...rankingData]
            .map(row => ({
                team: row.team,
                value: getMetricValue(row, selectedMetric),
            }))
            .filter(d => typeof d.value === "number")
            .sort((a, b) =>
                selectedMetricMeta.higherIsBetter
                    ? b.value - a.value   // higher is better
                    : a.value - b.value   // lower is better
            )

        return sorted.map((d, i) => ({
            id: String(d.team),
            data: [{x: i + 1, y: d.value}],
        }))
    }, [rankingData, selectedMetric, selectedMetricMeta])


    const scatter2DData = useMemo(() => {
        if (!selectedMetric || !xMetric) return []

        const points = rankingData
            .map(row => {
                const x = getMetricValue(row, xMetric)
                const y = getMetricValue(row, selectedMetric)

                if (typeof x !== "number" || typeof y !== "number") return null

                return {
                    id: String(row.team),
                    x,
                    y,
                }
            })
            .filter(Boolean) as { id: string; x: number; y: number }[]

        return [
            {
                id: "teams",
                data: points.map(p => ({
                    x: p.x,
                    y: p.y,
                    team: p.id,
                })),
            },
        ]
    }, [rankingData, selectedMetric, xMetric])

    const radarMetrics = useMemo(() => {
        if (!rankingData.length) return []
        return extractNumericMetrics(rankingData[0])
            .filter(m => m !== "team") // exclude team id
    }, [rankingData])


    const radarData = useMemo(() => {
        if (!selectedTeam) return []

        const teamRow = rankingData.find(r => r.team === selectedTeam)
        if (!teamRow) return []

        return radarMetrics.map(metric => {
            const meta = metricMeta[metric] ?? {higherIsBetter: true}

            const values = rankingData
                .map(r => getMetricValue(r, metric))
                .filter(v => typeof v === "number") as number[]

            if (!values.length) return null

            const min = Math.min(...values)
            const max = Math.max(...values)

            const rawValue = getMetricValue(teamRow, metric)
            if (typeof rawValue !== "number") return null

            return {
                metric,
                value: normalizeMetric(rawValue, min, max, meta.higherIsBetter)
            }
        }).filter(Boolean)
    }, [rankingData, selectedTeam, radarMetrics])

    useEffect(() => {
        if (!gridRef.current?.api) return
        gridRef.current.api.refreshCells({force: true})
    }, [selectedTeam, selectedMetric])


    function buildColumnDefsFromObject(
        obj: Record<string, any>,
        parentKey = ""
    ): any[] {
        return Object.entries(obj).map(([key, value]) => {
            const fieldPath = parentKey ? `${parentKey}.${key}` : key;

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

            if (fieldPath === "team") {
                return {
                    headerName: "Team",
                    field: "team",
                    pinned: "left",
                    cellRenderer: (params: any) =>
                        renderTeamLink(params.value),
                }
            }


            // Nested object → column group
            if (
                value &&
                typeof value === "object" &&
                !Array.isArray(value)
            ) {
                return {
                    headerName: key,
                    children: buildColumnDefsFromObject(value, fieldPath)
                };
            }

            // Leaf column
            return {
                headerName: key,
                field: fieldPath,
                sortable: true,
                filter: true,
                resizable: true,
                cellClassRules: {
                    "bg-blue-100 ring-1 ring-blue-400": (params: any) =>
                        params.data?.team === selectedTeam &&
                        fieldPath === selectedMetric,
                },
                onCellClicked: (params: any) => {
                    setSelectedTeam(params.data.team)
                    setXMetric(selectedMetric)
                    setSelectedMetric(fieldPath)
                },
            }
        });
    }

    return (
        <div className="min-h-screen bg-white flex flex-col">
            {/* Header */}
            <header className="h-14 px-6 flex items-center border-b text-xl font-semibold">
                <div className="pr-5">
                    Ranking Data
                </div>
                <DataSearch
                    teamNames={teamNames}
                    permissions={permissions}
                />
            </header>

            {/* Content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left half: AG Grid */}
                <div className="w-1/2 h-full p-4">
                    <div className="w-full h-full border rounded-md shadow-sm">
                        <AgGridReact
                            ref={gridRef}
                            theme={themeQuartz}
                            rowData={rankingData}
                            columnDefs={columnDefs}
                            defaultColDef={defaultColDef}
                            animateRows={true}
                            suppressFieldDotNotation={false}
                            getRowClass={(params) =>
                                params.data?.team === selectedTeam ? "bg-blue-50" : ""
                            }
                            getRowId={(params) => String(params.data.team)}
                            onGridReady={(params) => {
                                params.api.refreshCells({force: true})
                            }}
                        />
                    </div>
                </div>

                {/* Right half: reserved for scatterplot / comparison */}
                <div className="w-1/2 h-full p-4 flex flex-col">
                    {/* Controls */}
                    <div className="flex items-center gap-4 mb-2">
                        <select
                            value={graphType}
                            onChange={(e) => setGraphType(e.target.value as any)}
                            className="border rounded px-2 py-1"
                        >
                            <option value="box">Box Plot</option>
                            <option value="scatter">1-Variable Scatter Plot</option>
                            <option value="scatter2d">2-Variable Scatter Plot</option>
                            <option value="radar">Radar Graph</option>
                        </select>
                    </div>

                    {/* Title */}
                    <div className="text-lg font-semibold mb-2">
                        {selectedMetric
                            ? `${selectedMetric.replace(".", " ").toUpperCase()}`
                            : "Select a metric"}
                    </div>

                    {/* Graph container */}
                    <div className="flex-1 min-h-0 border rounded-md">
                        {(() => {
                            if (!selectedMetric) {
                                return (
                                    <div className="h-full flex items-center justify-center text-gray-400">
                                        Click a metric to view its distribution
                                    </div>
                                )
                            }

                            switch (graphType) {
                                case "scatter":
                                    return (
                                        <ResponsiveScatterPlot
                                            data={scatterData}
                                            margin={{top: 20, right: 20, bottom: 50, left: 60}}

                                            xScale={{
                                                type: "linear",
                                                min: 1,
                                                reverse: true,
                                            }}

                                            yScale={{
                                                type: "linear",
                                                min: "auto",
                                                max: "auto",
                                                reverse: selectedMetricMeta
                                                    ? !selectedMetricMeta.higherIsBetter
                                                    : false,
                                            }}

                                            colors="#9ca3af"
                                            nodeSize={6}
                                            useMesh={true}

                                            axisBottom={{
                                                legend: "Rank",
                                                legendPosition: "middle",
                                                legendOffset: 36,
                                            }}
                                            axisLeft={{
                                                legend: selectedMetric,
                                                legendPosition: "middle",
                                                legendOffset: -40,
                                            }}

                                            nodeComponent={(props) => (
                                                <CustomScatterNode
                                                    {...props}
                                                    selectedTeam={selectedTeam}
                                                />
                                            )}

                                            tooltip={({node}) => (
                                                <div className="bg-white p-2 text-sm border rounded shadow text-nowrap">
                                                    <div><strong>Team {node.serieId}</strong></div>
                                                    <div>Rank: {node.data.x}</div>
                                                    <div>Value: {node.data.y}</div>
                                                </div>
                                            )}

                                            onClick={(node) =>
                                                setSelectedTeam(Number(node.serieId))
                                            }

                                            animate={false}
                                        />
                                    )

                                case "box":
                                    return (
                                        <div className="h-full flex items-center justify-center text-gray-400">
                                            Box plot coming soon
                                        </div>
                                    )

                                case "scatter2d":
                                    return (
                                        <ResponsiveScatterPlot
                                            data={scatter2DData}
                                            key={`${xMetric}-${selectedMetric}`}
                                            margin={{top: 20, right: 20, bottom: 50, left: 60}}

                                            xScale={{
                                                type: "linear",
                                                min: "auto",
                                                max: "auto",
                                                reverse: xMetricMeta
                                                    ? !xMetricMeta.higherIsBetter
                                                    : false,
                                            }}

                                            yScale={{
                                                type: "linear",
                                                min: "auto",
                                                max: "auto",
                                                reverse: yMetricMeta
                                                    ? !yMetricMeta.higherIsBetter
                                                    : false,
                                            }}

                                            axisBottom={{
                                                legend: xMetric,
                                                legendPosition: "middle",
                                                legendOffset: 36,
                                            }}
                                            axisLeft={{
                                                legend: selectedMetric,
                                                legendPosition: "middle",
                                                legendOffset: -40,
                                            }}

                                            nodeSize={8}
                                            useMesh={true}

                                            nodeComponent={(props) => (
                                                <CustomScatterNode
                                                    {...props}
                                                    selectedTeam={selectedTeam}
                                                />
                                            )}

                                            tooltip={({node}) => (
                                                <div className="bg-white p-2 text-sm border rounded shadow">
                                                    <strong>Team {node.data.team}</strong>
                                                    <div>{xMetric}: {node.data.x}</div>
                                                    <div>{selectedMetric}: {node.data.y}</div>
                                                </div>
                                            )}

                                            onClick={(node) =>
                                                setSelectedTeam(Number(node.data.team))
                                            }

                                            animate={false}
                                        />
                                    )

                                case "radar":
                                    if (!selectedTeam) {
                                        return (
                                            <div className="h-full flex items-center justify-center text-gray-400">
                                                Select a team to view radar
                                            </div>
                                        )
                                    }

                                    return (
                                        <ResponsiveRadar
                                            data={radarData}
                                            keys={["value"]}
                                            indexBy="metric"

                                            maxValue={1}
                                            margin={{top: 40, right: 80, bottom: 40, left: 80}}

                                            curve="linearClosed"
                                            borderWidth={2}
                                            borderColor="#2563eb"

                                            gridLevels={5}
                                            gridShape="circular"

                                            dotSize={6}
                                            dotColor="#2563eb"
                                            dotBorderWidth={1}
                                            dotBorderColor="#1e40af"

                                            colors={["#3b82f6"]}
                                            fillOpacity={0.25}

                                            axisTop={null}
                                            axisRight={null}
                                            axisBottom={null}
                                            axisLeft={null}

                                            tooltip={({index, value}) => (
                                                <div className="bg-white p-2 text-sm border rounded shadow">
                                                    <strong>{index}</strong>
                                                    <div>Relative score: {(value * 100).toFixed(0)}%</div>
                                                </div>
                                            )}

                                            animate={false}
                                        />
                                    )

                                default:
                                    return null
                            }
                        })()}
                    </div>
                </div>

            </div>
        </div>
    );
}
