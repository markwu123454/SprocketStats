import {ArrowLeft, Check, X} from "lucide-react"
import {useEffect, useMemo, useState} from "react"
import {useAPI, getScouterEmail} from "@/hooks/useAPI"
import {AgGridReact} from "ag-grid-react"
import {type ColDef, themeQuartz} from "ag-grid-community"
import {HeaderFooterLayoutWrapper} from "@/components/wrappers/HeaderFooterLayoutWrapper"
import {Link} from "react-router-dom"

type AttendanceRow = {
    email: string
    name: string | null
    totalSeconds: number
    aboveMinSeconds: number
    isCheckedIn: boolean
}


export default function AttendancePage() {
    const {getAttendance, checkin, checkout} = useAPI()

    const [rows, setRows] = useState<AttendanceRow[]>([])
    const [loading, setLoading] = useState(false)

    const [status, setStatus] = useState<null | "in" | "out" | "error">(null)

    const myEmail = getScouterEmail()

    const myRow = useMemo(
        () => rows.find(r => r.email === myEmail),
        [rows, myEmail]
    )

    const isCheckedIn = myRow?.isCheckedIn ?? false

    /* ---------------- data load ---------------- */

    const load = async () => {
        const data = await getAttendance()
        if (!data) return null

        const mapped = data.map(r => ({
            email: r.email,
            name: r.name,
            totalSeconds: r.total_seconds,
            aboveMinSeconds: r.above_min_seconds,
            isCheckedIn: r.is_checked_in
        }))

        setRows(mapped)

        return mapped.find(r => r.email === myEmail) ?? null
    }

    useEffect(() => {
        void load()
    }, [])

    /* ---------------- actions ---------------- */

    const handleCheckIn = async () => {
        try {
            setLoading(true)
            await checkin()
            const me = await load()
            setStatus(me?.isCheckedIn ? "in" : "error")
        } catch {
            setStatus("error")
        } finally {
            setLoading(false)
        }
    }

    const handleCheckOut = async () => {
        try {
            setLoading(true)
            await checkout()
            const me = await load()
            setStatus(!me?.isCheckedIn ? "out" : "error")
        } catch {
            setStatus("error")
        } finally {
            setLoading(false)
        }
    }

    /* ---------------- column defs ---------------- */

    const columnDefs = useMemo<ColDef<AttendanceRow>[]>(() => [
        {headerName: "Name", field: "name"},

        {
            headerName: "Status",
            width: 120,
            valueGetter: p => p.data!.isCheckedIn ? "In" : "Out",
            cellClass: p =>
                p.data!.isCheckedIn
                    ? "text-green-600 font-bold"
                    : "text-gray-500"
        },

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
                <div className="flex items-center gap-4 text-xl theme-text w-full">
                    <Link
                        to="/more"
                        className="flex items-center p-2 rounded-md theme-button-bg hover:theme-button-hover"
                    >
                        <ArrowLeft className="h-5 w-5"/>
                    </Link>

                    <span>Attendance</span>
                </div>
            }
            body={
                <div className="w-full h-full flex flex-col gap-3">

                    {/* Action bar */}
                    <div className="flex items-center justify-between p-3 rounded-md shadow theme-bg theme-border">
                        <div className="flex gap-2">
                            <button
                                disabled={loading || isCheckedIn}
                                onClick={handleCheckIn}
                                className="flex items-center gap-2 px-3 py-1.5 rounded theme-button-bg theme-text hover:theme-button-hover disabled:opacity-30"
                            >
                                <Check size={16}/>
                                Check In
                            </button>

                            <button
                                disabled={loading || !isCheckedIn}
                                onClick={handleCheckOut}
                                className="flex items-center gap-2 px-3 py-1.5 rounded theme-button-bg theme-text hover:theme-button-hover disabled:opacity-30"
                            >
                                <X size={16}/>
                                Check Out
                            </button>
                        </div>

                        {/* Status feedback */}
                        <div className="text-sm font-semibold">
                            {status === "in" && <span className="text-green-600">Checked in</span>}
                            {status === "out" && <span className="text-blue-600">Checked out</span>}
                            {status === "error" && <span className="text-red-600">Update failed</span>}
                        </div>
                    </div>

                    {/* Grid */}
                    <div className="flex-1 rounded-md shadow theme-bg theme-border">
                        <AgGridReact
                            theme={themeQuartz}
                            rowData={rows}
                            columnDefs={columnDefs}
                            rowHeight={42}
                            animateRows
                        />
                    </div>
                </div>
            }

        />
    )
}
