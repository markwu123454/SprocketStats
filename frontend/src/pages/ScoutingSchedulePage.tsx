import {ArrowLeft} from "lucide-react";
import {HeaderFooterLayoutWrapper} from "@/components/wrappers/HeaderFooterLayoutWrapper";
import {Link} from "react-router-dom";
import {AgGridReact} from "ag-grid-react";
import {type ColDef, themeQuartz} from "ag-grid-community";

const scheduleRawData = [
"1-6,Mark,Tzuyu Wu,Brista Lin,Dylan Okada,Ethan Chang,Henry Yang",
"7-12,Ashlyn,Jacob Lau,Jadon Feng,Selina Gu,Adam Sun,Luke Yu",
"13-18,Cindy,Christian Alvarado,Liya Zhu,Maren Lai,Lance Lin,Terrance Ng",
"19-24,Andrew,James Shu,David Ding,Brian,Tzuyu Wu,Brista Lin",
"25-30,Mark,Dylan Okada,Ethan Chang,Henry Yang,Jacob Lau,Jadon Feng",
"31-36,Ashlyn,Selina Gu,Adam Sun,Luke Yu,Christian Alvarado,Liya Zhu",
"37-42,Cindy,Maren Lai,Lance Lin,Terrance Ng,James Shu,David Ding",
"43-48,Andrew,Brian,Tzuyu Wu,Brista Lin,Dylan Okada,Ethan Chang",
"49-55,Andrew,Henry Yang,Jacob Lau,Jadon Feng,Selina Gu,Adam Sun",
"56-62,Ashlyn,Luke Yu,Christian Alvarado,Liya Zhu,Maren Lai,Lance Lin",
"63-69,Cindy,Terrance Ng,James Shu,David Ding,Brian,Tzuyu Wu",
"70-76,Andrew,Brista Lin,Dylan Okada,Ethan Chang,Henry Yang,Jacob Lau",
"77-82,Mark,Jadon Feng,Selina Gu,Adam Sun,Luke Yu,Christian Alvarado",
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
                    <p className="text-center font-black uppercase tracking-wider leading-none text-red-600 text-3xl sm:text-4xl md:text-5xl lg:text-6xl px-2 py-4">
                        Subject to Change
                    </p>
                </div>
            }
        />
    );
}
