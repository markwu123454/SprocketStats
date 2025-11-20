import {ArrowLeft} from "lucide-react";
import {useEffect, useState, useMemo} from "react";
import {useAPI} from "@/hooks/useAPI.ts";
import {AgGridReact} from "ag-grid-react";

// Import legacy CSS (since we opt into legacy theme)
import {themeQuartz} from "ag-grid-community";

export default function CandyDataPage() {
    const api = useAPI();
    const {getCandyData} = api;

    const [eventList, setEventList] = useState<string[]>([]);
    const [selectedEvent, setSelectedEvent] = useState<string>("");
    const [teams, setTeams] = useState<number[]>([]);
    const [teamData, setTeamData] = useState<Record<number, any>>({});
    const [loading, setLoading] = useState(true);
    const [raw, setRaw] = useState<any>(null);

    const [eventNameMap, setEventNameMap] = useState<Record<string, Record<string, string>>>({});

    const columnDefs = [
        {headerName: "Team", field: "team", width: 100, sortable: true},
        {headerName: "EPA (Current)", field: "epa", width: 140, sortable: true},
        {headerName: "2025 District Points", field: "district2025", width: 170, sortable: true},
        {
            headerName: "Awards (Impact/EI)",
            field: "awardsDisplay",
            flex: 1,
            sortable: true,
            wrapText: true,
            autoHeight: true,
            comparator: (a: any, b: any, nodeA: any, nodeB: any) =>
                nodeA.data.awardsValue - nodeB.data.awardsValue,
            cellRenderer: "awardsRenderer"
        }
    ];

    const gridOptions = {
        sortingOrder: ['desc', 'asc', null]
    };

    useEffect(() => {
        const load = async () => {
            setLoading(true);

            // Load event names
            const nameRes = await fetch("/teams/event_names.json");
            const nameMap = await nameRes.json();
            setEventNameMap(nameMap);

            // Load candy data
            const data = await getCandyData();
            if (!data) return;

            setRaw(data);
            setEventList(data.events || []);

            const firstEvent = data.events?.[0] ?? "";
            setSelectedEvent(firstEvent);

            const block = data.by_event.find((e: any) => e.event === firstEvent);
            if (block) {
                setTeams(block.teams || []);
                setTeamData(block.data || {});
            }

            setLoading(false);
        };
        load();
    }, []);

    useEffect(() => {
        if (!raw || !selectedEvent) return;
        const block = raw.by_event.find((e: any) => e.event === selectedEvent);
        if (block) {
            setTeams(block.teams || []);
            setTeamData(block.data || {});
        }
    }, [selectedEvent, raw]);

    const rowData = useMemo(() => {
        if (!selectedEvent || !teams.length) return [];
        return teams.map((teamNum) => {
            const record = teamData[teamNum] || {};

            const epa = record.epa?.epa?.current ?? "";

            let district2025 = "";
            if (record.district_points) {
                district2025 = Object.entries(record.district_points)
                    .filter(([key]) => key.startsWith("2025"))
                    .reduce((sum, [, dp]: any) => sum + (dp.total ?? 0), 0);
            }

            // Include Impact (0), EI (9), AND Impact Finalist (69)
            const awardsRaw = (record.awards || []).filter((a: any) =>
                [0, 9, 69].includes(a.award_type)
            );

            let awardsValue = 0;
            const formattedAwards: Array<{ text: string; className: string }> = [];

            for (const a of awardsRaw) {
                const isImpact = a.award_type === 0;
                const isEI = a.award_type === 9;
                const isImpactFinalist = a.award_type === 69;

                // Label
                const label = isImpact
                    ? "Impact"
                    : isEI
                        ? "EI"
                        : "Impact Finalist";

                // Score
                let score = 1;
                if (a.year >= 2022) {
                    if (isImpact) score = 5;
                    else if (isEI) score = 4;
                    else if (isImpactFinalist) score = 5; // You can adjust if needed
                }
                awardsValue += score;

                const shortName = eventNameMap[a.event_key]["short"];
                const lowerShort = shortName.toLowerCase();

                const isSpecialEvent =
                    lowerShort.endsWith("division") || lowerShort.endsWith("field");

                let className = a.year >= 2022 ? "font-bold" : "text-gray-500";
                if (isSpecialEvent) {
                    className += " text-yellow-500 font-extrabold";
                }

                formattedAwards.push({
                    text: `${a.year}-${shortName}–${label}`,
                    className
                });
            }

            const awardsDisplay = {formatted: formattedAwards};

            return {
                team: teamNum,
                epa,
                district2025,
                awardsDisplay,
                awardsValue
            };
        });
    }, [selectedEvent, teams, teamData]);


    return (
        <div
            className="min-h-screen relative text-sm
                theme-light:text-zinc-900
                theme-dark:text-white
                theme-2025:text-white
                theme-2026:text-[#3b2d00]
                theme-3473:text-white"
        >
            <div className="relative z-10 flex flex-col min-h-screen">
                <div className="absolute inset-0 bg-top bg-cover
                 theme-light:bg-zinc-100
                 theme-dark:bg-zinc-950
                 theme-2025:bg-[url('/seasons/2025/expanded.png')]
                 theme-2026:bg-[url('/seasons/2026/expanded.png')]
                 theme-3473:bg-[radial-gradient(80%_110%_at_10%_10%,#4c2c7a,#1f0b46),linear-gradient(135deg,#140a2a,#1f0b46)]"
                />

                <div className="relative z-10 flex flex-col min-h-screen">

                    {/* Header */}
                    <div
                        className="h-10 text-xl flex items-center px-3 gap-4
                        theme-light:bg-[#ffffff]/75
                        theme-dark:bg-[rgba(9,9,11,0.7)]/75
                        theme-2025:bg-[rgba(11,35,79,0.7)]/75
                        theme-2026:bg-[rgba(254,247,220,0.8)]/75
                        theme-3473:bg-[rgba(76,29,149,0.75)]/75"
                    >
                        <a
                            href="/"
                            className="flex items-center p-1 rounded-md
                            theme-light:text-zinc-900 theme-light:hover:bg-zinc-200
                            theme-dark:text-white theme-dark:hover:bg-zinc-800
                            theme-2025:text-white theme-2025:hover:bg-[#1a356d]
                            theme-2026:text-[#3b2d00] theme-2026:hover:bg-[#e6ddae]
                            theme-3473:text-white theme-3473:hover:bg-[#5b21b6]"
                        >
                            <ArrowLeft className="h-5 w-5"/>
                        </a>
                        Candy Data: event projections

                        {/* Event Selector */}
                        <select
                            className="px-2 py-1 rounded-md border text-sm outline-none
                            theme-light:bg-white theme-light:border-zinc-300 theme-light:text-zinc-900
                            theme-dark:bg-zinc-900 theme-dark:border-zinc-700 theme-dark:text-white
                            theme-2025:bg-[#0c1f47]/80 theme-2025:border-[#2f4e9a] theme-2025:text-white
                            theme-2026:bg-[#fff8dc]/80 theme-2026:border-[#c9bb87] theme-2026:text-[#3b2d00]
                            theme-3473:bg-[#3b1a63]/80 theme-3473:border-[#6d28d9] theme-3473:text-white"
                            value={selectedEvent}
                            onChange={(e) => setSelectedEvent(e.target.value)}
                        >
                            {eventList.map((ev) => (
                                <option key={ev} value={ev}>
                                    {eventNameMap[ev]["full"] ?? ev}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 p-4 space-y-6 border-y-2
                        theme-light:border-zinc-300
                        theme-dark:border-zinc-800
                        theme-2025:border-[#1b3d80]
                        theme-2026:border-[#e6ddae]
                        theme-3473:border-[#6d28d9]">
                        <div className="ag-theme-alpine w-full h-[87.5vh] rounded-md shadow opacity-90">
                            {loading ? (
                                <div className="p-4">Loading teams...</div>
                            ) : (
                                <AgGridReact
                                    theme={themeQuartz}
                                    gridOptions={gridOptions}
                                    columnDefs={columnDefs}
                                    rowData={rowData}
                                    components={{awardsRenderer: AwardsRenderer}}
                                    rowHeight={36}
                                    animateRows={true}
                                />
                            )}
                        </div>
                    </div>
                    <div className="pt-2 h-10
                    theme-light:bg-[#ffffff]/75
                    theme-dark:bg-[rgba(9,9,11,0.7)]/75
                    theme-2025:bg-[rgba(11,35,79,0.7)]/75
                    theme-2026:bg-[rgba(254,247,220,0.8)]/75
                    theme-3473:bg-[rgba(76,29,149,0.75)]/75"
                    />
                </div>
            </div>
        </div>
    );
}

const AwardsRenderer = (params: any) => {
    const html = params.value as {
        formatted: Array<{ text: string; className: string }>;
    };
    return (
        <span>
      {html.formatted.map((part, i) => (
          <span key={i} className={part.className}>
          {part.text}
              {i < html.formatted.length - 1 ? ", " : ""}
        </span>
      ))}
    </span>
    );
};
