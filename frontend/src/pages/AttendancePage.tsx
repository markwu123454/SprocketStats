import {ArrowLeft, Check, X} from "lucide-react"
import {useEffect, useMemo, useState} from "react"
import {useAPI} from "@/hooks/useAPI"
import {AgGridReact} from "ag-grid-react"
import {type ColDef, themeQuartz} from "ag-grid-community"
import {HeaderFooterLayoutWrapper} from "@/components/wrappers/HeaderFooterLayoutWrapper"
import {Link} from "react-router-dom"

type AttendanceRow = {
    email: string
    name: string | null
    totalSeconds: number
    aboveMinSeconds: number
}

export default function AttendancePage() {
    const {getAttendance, checkin, checkout} = useAPI()

    const [rows, setRows] = useState<AttendanceRow[]>([])
    const [loading, setLoading] = useState(false)

    /* ---------------- data load ---------------- */

    const load = async () => {
        const data = await getAttendance()
        if (!data) return

        setRows(
            data.map(r => ({
                email: r.email,
                name: r.name,
                totalSeconds: r.total_seconds,
                aboveMinSeconds: r.above_min_seconds
            }))
        )
    }

    useEffect(() => {
        void load()
    }, [])

    /* ---------------- actions ---------------- */

    const handleCheckIn = async () => {
        setLoading(true)
        await checkin()
        await load()
        setLoading(false)
    }

    const handleCheckOut = async () => {
        setLoading(true)
        await checkout()
        await load()
        setLoading(false)
    }

    /* ---------------- column defs ---------------- */

    const columnDefs = useMemo<ColDef<AttendanceRow>[]>(() => [
        {headerName: "Name", field: "name"},

        {
            headerName: "Hours",
            width: 140,
            valueGetter: p =>
                (p.data!.totalSeconds / 3600).toFixed(2)
        },

        {
            headerName: "Time above minimum threshold",
            width: 250,
            valueGetter: p =>
                (p.data!.aboveMinSeconds / 3600).toFixed(2),

            cellClass: p =>
                p.value >= 0
                    ? "text-green-600 font-bold"
                    : "text-red-600 font-bold"
        }
    ], [loading])

    /* ---------------- render ---------------- */

    return (
        <HeaderFooterLayoutWrapper
            header={
                <div className="flex items-center justify-between text-xl theme-text w-full">
                    <div className="flex items-center gap-4">
                        <Link
                            to="/more"
                            className="flex items-center p-2 rounded-md theme-button-bg hover:theme-button-hover"
                        >
                            <ArrowLeft className="h-5 w-5"/>
                        </Link>

                        <span>Attendance</span>
                    </div>

                    <div className="flex gap-2">
                        <button
                            disabled={loading}
                            onClick={handleCheckIn}
                            className="flex items-center gap-2 px-3 py-1.5 rounded
               theme-button-bg theme-text
               hover:theme-button-hover
               disabled:opacity-30 transition-colors"
                        >
                            <Check size={16}/>
                            Check In
                        </button>

                        <button
                            disabled={loading}
                            onClick={handleCheckOut}
                            className="flex items-center gap-2 px-3 py-1.5 rounded
               theme-button-bg theme-text-contrast
               hover:theme-button-hover
               disabled:opacity-30 transition-colors"
                        >
                            <X size={16}/>
                            Check Out
                        </button>
                    </div>
                </div>
            }
            body={
                <div className="w-full h-full rounded-md shadow theme-bg theme-border">
                    <AgGridReact
                        theme={themeQuartz}
                        rowData={rows}
                        columnDefs={columnDefs}
                        rowHeight={42}
                        animateRows
                    />
                </div>
            }
        />
    )
}
