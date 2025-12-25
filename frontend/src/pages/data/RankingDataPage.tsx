import {useMemo, useState} from "react";
import {AgGridReact} from "ag-grid-react";
import {themeQuartz} from "ag-grid-community";
import {useRankingData, usePermissions} from "@/components/wrappers/DataWrapper.tsx";
import {Link} from "react-router-dom";
import {ResponsiveBar} from "@nivo/bar";
import {ResponsiveBoxPlot} from "@nivo/boxplot"

/**
 * Recursively builds AG Grid column definitions from data shape
 */


export default function RankingData() {
    //const rankingData = useRankingData(); // assumed array of objects
    const permissions = usePermissions()

    const [selectedTeam, setSelectedTeam] = useState<number | null>(null)
    const [selectedMetric, setSelectedMetric] = useState<string | null>(null)
    const [graphType, setGraphType] = useState<"box" | "bar">("bar")

    const rankingData = useMemo(() => [{
        team: 254,
        epa: {total: 25.3, auto: 12.1},
        rank: {overall: 1, district: 2}
    }, {
        team: 118,
        epa: {total: 12.3, auto: 3.1},
        rank: {overall: 2, district: 3}
    }, {
        team: 4414,
        epa: {total: 42.3, auto: 32.1},
        rank: {overall: 5, district: 7}
    }, {
        team: 3473,
        epa: {total: 2, auto: 4.3},
        rank: {overall: 65, district: 23}
    }], [])


    const columnDefs = useMemo(() => {
        if (!rankingData || rankingData.length === 0) return [];
        return buildColumnDefsFromObject(rankingData[0]);
    }, [rankingData]);

    const defaultColDef = useMemo(
        () => ({
            sortable: true,
            filter: true,
            resizable: true
        }),
        []
    );

    function getMetricValue(row: any, metric: string) {
        return metric.split(".").reduce((acc, key) => acc?.[key], row)
    }

    const barGraphData = useMemo(() => {
        if (!selectedMetric) return []

        return rankingData.map(row => ({
            team: row.team,
            value: getMetricValue(row, selectedMetric)
        }))
    }, [rankingData, selectedMetric])

    const boxPlotData = useMemo(() => {
        if (!barGraphData.length) return []

        return [
            {
                id: "Field",
                data: barGraphData.map(d => ({
                    x: "All Teams",
                    y: d.value,
                })),
            },
        ]
    }, [barGraphData])


    function renderGraph() {
        if (!selectedMetric) {
            return (
                <div className="h-full flex items-center justify-center text-gray-400">
                    Click a metric to view its distribution
                </div>
            )
        }

        switch (graphType) {
            case "bar":
                return (
                    <ResponsiveBar
                        data={barGraphData}
                        keys={["value"]}
                        indexBy="team"
                        margin={{top: 20, right: 20, bottom: 40, left: 50}}
                        colors={(bar) =>
                            bar.data.team === selectedTeam ? "#2563eb" : "#9ca3af"
                        }
                    />
                )
            case "box":
                return (
                    <ResponsiveBoxPlot
                        data={boxPlotData}
                        margin={{top: 20, right: 20, bottom: 40, left: 60}}
                        minValue="auto"
                        maxValue="auto"
                        colors="#9ca3af"
                    />
                )

            default:
                return null
        }
    }


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
                cellClass: "cursor-pointer hover:bg-gray-50",
                onCellClicked: (params: any) => {
                    setSelectedTeam(params.data.team)
                    setSelectedMetric(fieldPath)
                }
            }
        });
    }

    return (
        <div className="min-h-screen bg-white flex flex-col">
            {/* Header */}
            <header className="h-14 px-6 flex items-center border-b text-xl font-semibold">
                Ranking Data
            </header>

            {/* Content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left half: AG Grid */}
                <div className="w-1/2 h-full p-4">
                    <div className="w-full h-full border rounded-md shadow-sm">
                        <AgGridReact
                            theme={themeQuartz}
                            rowData={rankingData}
                            columnDefs={columnDefs}
                            defaultColDef={defaultColDef}
                            animateRows={true}
                            suppressFieldDotNotation={false}
                            getRowClass={(params) =>
                                params.data.team === selectedTeam ? "bg-blue-50" : ""
                            }
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
                            <option value="bar">Bar</option>
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
                        {renderGraph()}
                    </div>
                </div>

            </div>
        </div>
    );
}
