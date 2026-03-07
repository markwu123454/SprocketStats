import {ArrowLeft} from "lucide-react";
import {HeaderFooterLayoutWrapper} from "@/components/wrappers/HeaderFooterLayoutWrapper";
import {Link} from "react-router-dom";
import {AgGridReact} from "ag-grid-react";
import {type ColDef, themeQuartz} from "ag-grid-community";

const scheduleRawData = [
"1-6,Tzuyu Wu,Cindy Lin,Brista Lin,Dylan Okada,Ethan Chang,Liya Zhu",
"7-12,Jacob Lau,Jadon Feng,Ashlyn Lai,Selina Gu,Adam Sun,Henry Yang",
"13-19,Christian Alvarado,Luke,Maren Lai,Grace,David Ding,Andrew Lin",
"LUNCH, 1:12PM-2:21PM",
"20-24,Tzuyu Wu,Cindy Lin,Brista Lin,Dylan Okada,Ethan Chang,Liya Zhu",
"25-30,Jacob Lau,Jadon Feng,Ashlyn Lai,Selina Gu,Adam Sun,Henry Yang",
"31-36,Christian Alvarado,Luke,Maren Lai,Grace,David Ding,Andrew Lin",
"37-42,Tzuyu Wu,Cindy Lin,Brista Lin,Dylan Okada,Ethan Chang,Liya Zhu",
"43-49,Jacob Lau,Jadon Feng,Ashlyn Lai,Selina Gu,Adam Sun,Henry Yang",
"49-55,Christian Alvarado,Luke,Maren Lai,Grace,David Ding,Andrew Lin",
];

const rowData = scheduleRawData.map((row) => {
    const [match, r1, r2, r3, b1, b2, b3] = row.split(",").map(v => v.trim());
    return {
        match: match,
        red1: r1,
        red2: r2,
        red3: r3,
        blue1: b1,
        blue2: b2,
        blue3: b3
    };
});

const columnDefs: ColDef[] = [
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
                </div>
            }
        />
    );
}
