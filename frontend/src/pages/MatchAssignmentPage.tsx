import { ArrowLeft } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { AgGridReact } from "ag-grid-react"
import type {ColDef} from "ag-grid-community"
import { themeQuartz } from "ag-grid-community"
import { HeaderFooterLayoutWrapper } from "@/components/wrappers/HeaderFooterLayoutWrapper"
import { useAPI } from "@/hooks/useAPI"
import type { MatchType } from "@/types"

// -------------------------------
// Types
// -------------------------------
type MatchRow = {
    key: string
    event_key: string
    match_type: MatchType
    match_number: number
    set_number: number
    scheduled_time: string | null
    actual_time: string | null
    red1: number | null
    red2: number | null
    red3: number | null
    blue1: number | null
    blue2: number | null
    blue3: number | null
    red1_scouter: string | null
    red2_scouter: string | null
    red3_scouter: string | null
    blue1_scouter: string | null
    blue2_scouter: string | null
    blue3_scouter: string | null
}

type Scouter = {
    email: string
    name: string
}

// -------------------------------
// Page
// -------------------------------
export default function MatchAssignmentPage() {
    const { getAllMatches } = useAPI()

    const [rowData, setRowData] = useState<MatchRow[]>([])
    const [scouters, setScouters] = useState<Scouter[]>([])
    const [loading, setLoading] = useState(true)
    const [dirtyRows, setDirtyRows] = useState<Map<string, MatchRow>>(new Map())

    // -------------------------------
    // Load data
    // -------------------------------
    useEffect(() => {
        const load = async () => {
            setLoading(true)
            const res = await getAllMatches()
            if (!res) return

            setRowData(res.matches)
            setScouters(res.scouters)
            setLoading(false)
        }
        load()
    }, [])

    // -------------------------------
    // Scouter helpers
    // -------------------------------
    const scouterNameByEmail = useMemo(
        () => Object.fromEntries(scouters.map(s => [s.email, s.name])),
        [scouters]
    )

    const scouterEmails = useMemo(
        () => scouters.map(s => s.email),
        [scouters]
    )

    const scouterColumn = (headerName: string, field: keyof MatchRow): ColDef => ({
        headerName,
        field,
        width: 180,
        editable: true,

        cellEditor: "agRichSelectCellEditor",
        cellEditorParams: {
            values: scouterEmails,
            searchType: "contains",
            allowTyping: true,
            filterList: true,
            highlightMatch: true,
        },

        valueFormatter: params =>
            params.value
                ? scouterNameByEmail[params.value] ?? params.value
                : "",

        valueParser: params =>
            params.newValue === "" ? null : params.newValue,
    })

    // -------------------------------
    // Column definitions
    // -------------------------------
    const columnDefs: ColDef[] = [
        // ---- Match identity (read-only) ----
        { headerName: "Type", field: "match_type", width: 90, sortable: true },
        { headerName: "Match", field: "match_number", width: 90, sortable: true },
        { headerName: "Set", field: "set_number", width: 80, sortable: true },

        // ---- Times ----
        { headerName: "Scheduled", field: "scheduled_time", width: 180, editable: true },
        { headerName: "Actual", field: "actual_time", width: 180, editable: true },

        // ---- Red alliance ----
        { headerName: "R1", field: "red1", width: 90, editable: true },
        { headerName: "R2", field: "red2", width: 90, editable: true },
        { headerName: "R3", field: "red3", width: 90, editable: true },

        scouterColumn("R1 Scouter", "red1_scouter"),
        scouterColumn("R2 Scouter", "red2_scouter"),
        scouterColumn("R3 Scouter", "red3_scouter"),

        // ---- Blue alliance ----
        { headerName: "B1", field: "blue1", width: 90, editable: true },
        { headerName: "B2", field: "blue2", width: 90, editable: true },
        { headerName: "B3", field: "blue3", width: 90, editable: true },

        scouterColumn("B1 Scouter", "blue1_scouter"),
        scouterColumn("B2 Scouter", "blue2_scouter"),
        scouterColumn("B3 Scouter", "blue3_scouter"),
    ]

    // -------------------------------
    // Change tracking
    // -------------------------------
    const onCellValueChanged = (params: any) => {
        setDirtyRows(prev => {
            const next = new Map(prev)
            next.set(params.data.key, params.data)
            return next
        })
    }

    // -------------------------------
    // Render
    // -------------------------------
    return (
        <HeaderFooterLayoutWrapper
            header={
                <div className="flex items-center gap-4 text-lg font-semibold">
                    <a href="/" className="flex items-center p-2 rounded-md theme-hover">
                        <ArrowLeft className="h-5 w-5" />
                    </a>
                    Match Assignments
                </div>
            }
            body={
                <div className="w-full h-full rounded-md shadow-sm">
                    {loading ? (
                        <div className="p-4">Loading matches…</div>
                    ) : (
                        <AgGridReact
                            theme={themeQuartz}
                            rowData={rowData}
                            columnDefs={columnDefs}
                            rowHeight={36}
                            animateRows
                            onCellValueChanged={onCellValueChanged}
                            getRowId={params => params.data.key}
                        />
                    )}
                </div>
            }
            footer={
                <div className="flex items-center justify-between w-full">
                    <span>© Candy Data</span>
                    <span>{dirtyRows.size} unsaved changes</span>
                </div>
            }
        />
    )
}
