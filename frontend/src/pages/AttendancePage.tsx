import {ArrowLeft, Check, X} from "lucide-react"
import {useCallback, useEffect, useMemo, useRef, useState} from "react"
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
    const {getAttendance, getAttendanceStatus, checkin, checkout} = useAPI()

    const [rows, setRows] = useState<AttendanceRow[]>([])
    const [loading, setLoading] = useState(false)
    const [status, setStatus] = useState<null | "in" | "out" | "error">(null)

    const myEmail = getScouterEmail()
    const isLoggedIn = Boolean(myEmail)

    const [myStatus, setMyStatus] = useState<{
        is_checked_in: boolean
        meeting_active: boolean
    } | null>(null)

    const isCheckedIn = myStatus?.is_checked_in ?? false
    const meetingActive = myStatus?.meeting_active ?? false

    /* ---------------- stable poller ---------------- */

    const apiRef = useRef({getAttendance})
    const inFlightRef = useRef(false)
    const timerRef = useRef<number | null>(null)

    useEffect(() => {
        apiRef.current.getAttendance = getAttendance
    }, [getAttendance])

    const pollOnce = useCallback(async () => {
        if (inFlightRef.current) return
        inFlightRef.current = true

        try {
            const [data, status] = await Promise.all([
                apiRef.current.getAttendance(),
                getAttendanceStatus(),
            ])

            if (data) {
                const mapped: AttendanceRow[] = data.map(r => ({
                    email: r.email,
                    name: r.name,
                    totalSeconds: r.total_seconds,
                    aboveMinSeconds: r.above_min_seconds,
                    isCheckedIn: r.is_checked_in,
                }))
                setRows(mapped)
            }

            if (status) {
                setMyStatus({
                    is_checked_in: status.is_checked_in,
                    meeting_active: status.meeting_active,
                })
            }
        } finally {
            inFlightRef.current = false
        }
    }, [getAttendanceStatus])

    useEffect(() => {
        // run immediately
        void pollOnce()

        // then every 5 seconds — one timer, no duplication
        timerRef.current = window.setInterval(pollOnce, 5000)

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current)
                timerRef.current = null
            }
        }
    }, [])

    /* ---------------- actions ---------------- */

    const handleCheckIn = async () => {
        try {
            setLoading(true)

            const res = await checkin()

            if (res?.status === "checked_in") {
                setStatus("in")
                await pollOnce()   // update grid
            } else {
                setStatus("error")
            }
        } catch {
            setStatus("error")
        } finally {
            setLoading(false)
        }
    }

    const handleCheckOut = async () => {
        try {
            setLoading(true)

            const res = await checkout()

            if (res?.status === "checked_out") {
                setStatus("out")
                await pollOnce()   // update grid
            } else {
                setStatus("error")
            }
        } catch {
            setStatus("error")
        } finally {
            setLoading(false)
        }
    }

    /* ---------------- columns ---------------- */

    const columnDefs = useMemo<ColDef<AttendanceRow>[]>(() => [
        {headerName: "Name", field: "name", flex: 1},

        {
            headerName: "Status",
            flex: 1,
            valueGetter: p => (p.data!.isCheckedIn ? "In" : "Out"),
            cellClass: p =>
                p.data!.isCheckedIn
                    ? "text-green-600 font-bold"
                    : "text-gray-500",
        },

        {
            headerName: "Hours",
            flex: 1,
            valueGetter: p => (p.data!.totalSeconds / 3600).toFixed(2),
        },

        {
            headerName: "Time above min",
            flex: 1,
            valueGetter: p => (p.data!.aboveMinSeconds / 3600).toFixed(2),
            cellClass: p =>
                Number(p.value) >= 0
                    ? "text-green-600 font-bold"
                    : "text-red-600 font-bold",
        },
    ], [])

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
                    <div className="flex flex-col gap-2 p-3 rounded-md shadow theme-bg theme-border">

                        {/* Action row */}
                        <div className="flex items-center gap-2">
                            <button
                                disabled={loading || !isLoggedIn || isCheckedIn}
                                onClick={handleCheckIn}
                                className="flex items-center gap-2 px-3 py-1.5 rounded theme-button-bg theme-text hover:theme-button-hover disabled:opacity-30"
                            >
                                <Check size={16}/>
                                Check In
                            </button>

                            <button
                                disabled={loading || !isLoggedIn || !isCheckedIn}
                                onClick={handleCheckOut}
                                className="flex items-center gap-2 px-3 py-1.5 rounded theme-button-bg theme-text hover:theme-button-hover disabled:opacity-30"
                            >
                                <X size={16}/>
                                Check Out
                            </button>
                        </div>

                        {/* Unified status row */}
                        <div className="text-sm font-medium min-h-5">
                            {!isLoggedIn && (
                                <span className="text-yellow-600">
                                    Login first to check in or out.{" "}
                                    <Link to="/" className="underline hover:opacity-80">
                                        Go to login
                                    </Link>
                                </span>
                            )}

                            {/* isLoggedIn && !meetingActive && (
                                <span className="text-yellow-600">
                                    A meeting is not currently active.
                                </span>
                            ) */}

                            {isLoggedIn && status === "in" && (
                                <span className="text-green-600">Checked in</span>
                            )}

                            {isLoggedIn && status === "out" && (
                                <span className="text-blue-600">Checked out</span>
                            )}

                            {isLoggedIn && status === "error" && (
                                <span className="text-red-600">Update failed</span>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 rounded-md shadow theme-bg theme-border">
                        <AgGridReact
                            theme={themeQuartz}
                            rowData={rows}
                            columnDefs={columnDefs}
                            rowHeight={42}
                            animateRows

                            getRowId={params => params.data.email}
                        />
                    </div>
                </div>
            }
        />
    )
}
