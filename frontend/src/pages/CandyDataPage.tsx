import {ArrowLeft} from "lucide-react";
import {useEffect, useState, useMemo} from "react";
import {useAPI} from "@/hooks/useAPI.ts";
import {AgGridReact} from "ag-grid-react";
import {type ColDef, type ICellRendererParams, RowNode, themeQuartz} from "ag-grid-community";
import {HeaderFooterLayoutWrapper} from "@/components/wrappers/HeaderFooterLayoutWrapper.tsx";
import {Link} from "react-router-dom";

type AwardDisplayPart = {
    text: string;
    className: string;
};

type CandyRow = {
    team: number;
    epa: number | null;
    district2025: number | null;
    awardsDisplay: {
        formatted: AwardDisplayPart[];
    };
    awardsValue: number;
};

export default function CandyDataPage() {
    const api = useAPI();
    const {getCandyData} = api;

    const [eventList, setEventList] = useState<string[]>([]);
    const [selectedEvent, setSelectedEvent] = useState<string>("");
    const [teams, setTeams] = useState<number[]>([]);
    const [teamData, setTeamData] = useState<Record<number, any>>({});
    const [raw, setRaw] = useState<any>(null);

    const [eventNameMap, setEventNameMap] = useState<Record<string, Record<string, string>>>({});

    const columnDefs = useMemo<ColDef<CandyRow>[]>(() => [
        {headerName: "Team", field: "team", width: 100, sortable: true},

        {
            headerName: "2025 EPA",
            field: "epa",
            width: 140,
            sortable: true,
            sortingOrder: ['desc', 'asc', null],
        },

        {
            headerName: "2025 District Points",
            field: "district2025",
            width: 170,
            sortable: true,
            sortingOrder: ['desc', 'asc', null],
        },

        {
            headerName: "Awards (Impact/EI)",
            field: "awardsDisplay",
            flex: 1,
            sortable: true,
            wrapText: true,
            autoHeight: true,
            sortingOrder: ['desc', 'asc', null],
            comparator: (
                _a: unknown,
                _b: unknown,
                nodeA: RowNode<CandyRow>,
                nodeB: RowNode<CandyRow>
            ) => nodeA.data!.awardsValue - nodeB.data!.awardsValue,
            cellRenderer: "awardsRenderer",
        }
    ], []);


    useEffect(() => {
        const load = async () => {
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
        };
        void load();
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

            let district2025;
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
        <HeaderFooterLayoutWrapper
            header={
                <div className="flex items-center gap-4 text-xl theme-text">
                    <Link
                        to="/more"
                        className="flex items-center p-2 rounded-md theme-button-bg hover:theme-button-hover transition-colors"
                    >
                        <ArrowLeft className="h-5 w-5"/>
                    </Link>

                    <span>Candy Data: event projections</span>

                    <select
                        className="px-2 py-1 rounded-md border text-sm outline-none
                               theme-bg theme-border theme-text
                               hover:theme-button-hover transition-colors"
                        value={selectedEvent}
                        onChange={(e) => setSelectedEvent(e.target.value)}
                    >
                        {eventList.map((ev) => (
                            <option key={ev} value={ev}>
                                {eventNameMap[ev]?.full ?? ev}
                            </option>
                        ))}
                    </select>
                </div>
            }
            body={
                <div className="w-full h-full rounded-md shadow theme-bg theme-border theme-scrollbar">
                    <AgGridReact
                        theme={themeQuartz}
                        columnDefs={columnDefs}
                        rowData={rowData}
                        components={{awardsRenderer: AwardsRenderer}}
                        rowHeight={36}
                        animateRows={true}
                    />
                </div>
            }
        />
    );
}

const AwardsRenderer = (params: ICellRendererParams<CandyRow, CandyRow["awardsDisplay"]>) => {
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
