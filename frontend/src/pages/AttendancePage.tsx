import {ArrowLeft, Check, X} from "lucide-react"
import {useCallback, useEffect, useMemo, useRef, useState} from "react"
import {useAPI, getScouterEmail} from "@/hooks/useAPI"
import {AgGridReact} from "ag-grid-react"
import {type ColDef, themeQuartz} from "ag-grid-community"
import {HeaderFooterLayoutWrapper} from "@/components/wrappers/HeaderFooterLayoutWrapper"
import {Link} from "react-router-dom"
import {useClientEnvironment} from "@/hooks/useClientEnvironment.ts";
import useFeatureFlags from "@/hooks/useFeatureFlags.ts";

type AttendanceRow = {
    email: string
    name: string | null
    totalSeconds: number
    aboveMinSeconds: number
    isCheckedIn: boolean
}

export default function AttendancePage() {
    const {getAttendance, getAttendanceStatus, checkin, checkout, verify} = useAPI()

    const {serverOnline, isOnline} = useClientEnvironment()
    const featureFlags = useFeatureFlags()

    const [authChecked, setAuthChecked] = useState(false)
    const [isLoggedIn, setIsLoggedIn] = useState(false)

    const [rows, setRows] = useState<AttendanceRow[]>([])
    const [loading, setLoading] = useState(false)
    const [status, setStatus] = useState<null | "in" | "out" | "error">(null)

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

    useEffect(() => {
        const runVerify = async () => {
            try {
                const res = await verify()
                setIsLoggedIn(Boolean(res?.success))
            } catch {
                setIsLoggedIn(false)
            } finally {
                setAuthChecked(true)
            }
        }

        void runVerify()
    }, [verify])

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

    const statusMessage = useMemo<{
        text: string
        className: string
    } | null>(() => {
        // 1. Action results
        if (isLoggedIn && status === "in") {
            return {text: "Checked in", className: "text-green-600"}
        }

        if (isLoggedIn && status === "out") {
            return {text: "Checked out", className: "text-blue-600"}
        }

        if (isLoggedIn && status === "error") {
            return {text: "Update failed", className: "text-red-600"}
        }

        // 2. Offline states
        if (!isOnline) {
            return {
                text: "You are offline",
                className: "text-red-600",
            }
        }

        if (!serverOnline) {
            return {
                text: "Server is not online, please wait ~ 1 minute",
                className: "text-red-600",
            }
        }

        // 3. Not logged in
        if (!isLoggedIn) {
            return {
                text: "Login first to check in or out.",
                className: "text-yellow-600",
            }
        }

        // 4. Meeting state
        return meetingActive
            ? {
                text: "A meeting is currently active",
                className: "text-green-600",
            }
            : {
                text: "No meeting is currently active",
                className: "text-gray-500",
            }
    }, [
        isLoggedIn,
        status,
        isOnline,
        serverOnline,
        meetingActive,
    ])

    useEffect(() => {
        if (status === null) return
        const t = setTimeout(() => setStatus(null), 3000)
        return () => clearTimeout(t)
    }, [status])

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

    const columnDefs = useMemo<ColDef<AttendanceRow>[]>(() => {
        const cols: ColDef<AttendanceRow>[] = [
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
                sort: "desc",
            },
        ]

        if (featureFlags.showAttendanceTimeForComp) {
            cols.push({
                headerName: "Time above min",
                flex: 1,
                valueGetter: p => (p.data!.aboveMinSeconds / 3600).toFixed(2),
                cellClass: p =>
                    Number(p.value) >= 0
                        ? "text-green-600 font-bold"
                        : "text-red-600 font-bold",
            })
        }

        return cols
    }, [featureFlags.showAttendanceTimeForComp])

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
                            {statusMessage && (
                                <span className={statusMessage.className}>
                                    {statusMessage.text}
                                    {!isLoggedIn && (
                                        <>
                                            {" "}
                                            <Link to="/" className="underline hover:opacity-80">
                                                Go to login
                                            </Link>
                                        </>
                                    )}
                                </span>
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
