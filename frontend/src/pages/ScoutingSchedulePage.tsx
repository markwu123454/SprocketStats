import {ArrowLeft} from "lucide-react";
import {HeaderFooterLayoutWrapper} from "@/components/wrappers/HeaderFooterLayoutWrapper";
import {Link} from "react-router-dom";
import {AgGridReact} from "ag-grid-react";
import {type ColDef, themeQuartz} from "ag-grid-community";

const scheduleRawData = [
    "2026capoh,18,Tzuyu Wu,Brista Lin,Dylan Okada,Ethan Chang,Henry Yang,Terrance Ng",
    "2026capoh,918,Jacob Lau,Jadon Feng,Selina Gu,Kristen / Carris,Adam Sun,Luke Yu",
    "2026capoh,1927,James Shu,Christian Alvarado,Liya Zhu,Maren Lai,Lance Lin,Brian Chang",
    "2026capoh,2836,David Ding,Tzuyu Wu,Brista Lin,Dylan Okada,Ethan Chang,Henry Yang",
    "2026capoh,3745,Terrance Ng,Jacob Lau,Jadon Feng,Selina Gu,Kristen / Carris,Adam Sun",
    "2026capoh,4654,Luke Yu,James Shu,Christian Alvarado,Liya Zhu,Maren Lai,Lance Lin",
    "2026capoh,5563,Brian Chang,David Ding,Tzuyu Wu,Brista Lin,Dylan Okada,Ethan Chang",
    "2026capoh,6272,Henry Yang,Terrance Ng,Jacob Lau,Jadon Feng,Selina Gu,Kristen / Carris",
];

const rowData = scheduleRawData.map((row) => {
    const [event, match, r1, r2, r3, b1, b2, b3] = row.split(",").map(v => v.trim());
    return {
        event,
        match: Number(match),
        red1: r1,
        red2: r2,
        red3: r3,
        blue1: b1,
        blue2: b2,
        blue3: b3
    };
});

const columnDefs: ColDef[] = [
    {headerName: "Event", field: "event", width: 130},
    {headerName: "Match Number", field: "match", width: 130},
    {headerName: "Red 1 Scouter", field: "red1", minWidth: 130, flex: 1},
    {headerName: "Red 2 Scouter", field: "red2", minWidth: 130, flex: 1},
    {headerName: "Red 3 Scouter", field: "red3", minWidth: 130, flex: 1},
    {headerName: "Blue 1 Scouter", field: "blue1", minWidth: 130, flex: 1},
    {headerName: "Blue 2 Scouter", field: "blue2", minWidth: 130, flex: 1},
    {headerName: "Blue 3 Scouter", field: "blue3", minWidth: 130, flex: 1},
];

export default function ScoutingSchedulePage() {
    return (
        <HeaderFooterLayoutWrapper
            header={
                <div className="flex items-center gap-4 text-lg font-semibold">
                    <Link
                        to="/more"
                        className="flex items-center p-2 rounded-md theme-button-bg hover:theme-button-hover transition-colors"
                    >
                        <ArrowLeft className="h-5 w-5"/>
                    </Link>

                    <span>Scouting Schedule</span>
                </div>
            }
            body={
                <div className="w-full h-full flex flex-col gap-3">
                    <div className="flex-1 min-h-0 rounded-md shadow-sm overflow-hidden">
                        <AgGridReact
                            theme={themeQuartz}
                            rowData={rowData}
                            columnDefs={columnDefs}
                            rowHeight={36}
                            animateRows
                        />
                    </div>
                    <p className="text-center font-black uppercase tracking-wider leading-none text-red-600 text-3xl sm:text-4xl md:text-5xl lg:text-6xl px-2 py-4">
                        Subject to Change
                    </p>
                </div>
            }
        />
    );
}
