import {ArrowLeft, Check, X} from "lucide-react"
import React, {useCallback, useEffect, useMemo, useRef, useState} from "react"
import {useAPI} from "@/hooks/useAPI"
import {AgGridReact} from "ag-grid-react"
import {type ColDef, themeQuartz} from "ag-grid-community"
import {HeaderFooterLayoutWrapper} from "@/components/wrappers/HeaderFooterLayoutWrapper"
import {Link} from "react-router-dom"
import {useClientEnvironment} from "@/hooks/useClientEnvironment.ts";
import useFeatureFlags from "@/hooks/useFeatureFlags.ts";
import {useAuth} from "@/hooks/useAuth.ts";
import {QRCodeScanner} from "@/components/ui/QRCodeScanner.tsx";

const ENABLE_QR_AND_GEO = false // set false to bypass QR + geolocation

type AttendanceRow = {
    email: string
    name: string | null
    totalSeconds: number
    aboveMinSeconds: number
    isCheckedIn: boolean
}

function getLocation(): Promise<{
    latitude: number
    longitude: number
    accuracy: number
} | null> {
    return new Promise(resolve => {
        if (!navigator.geolocation) {
            resolve(null)
            return
        }

        navigator.geolocation.getCurrentPosition(
            pos => {
                resolve({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                })
            },
            () => resolve(null),
            {
                enableHighAccuracy: false,
                timeout: 3000,
                maximumAge: 30_000,
            }
        )
    })
}

export default function AttendancePage() {
    const {getAttendance, getAttendanceStatus, checkin, checkout} = useAPI()
    const {isAuthenticated, refresh} = useAuth()
    const {serverOnline, isOnline} = useClientEnvironment()
    const featureFlags = useFeatureFlags()

    const [rows, setRows] = useState<AttendanceRow[]>([])
    const [loading, setLoading] = useState(false)
    const [scanning, setScanning] = useState(false)
    const [scanMode, setScanMode] = useState<"checkin" | "checkout" | null>(null)
    const locationPromiseRef = useRef<Promise<{
        latitude: number
        longitude: number
        accuracy: number
    } | null> | null>(null)
    const [status, setStatus] = useState<
        null | "in" | "out" | "error" | "joke"
    >(null)

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
        void refresh()
    }, [refresh])

    const pollOnce = useCallback(async () => {
        if (!isAuthenticated || inFlightRef.current) return
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
    }, [getAttendanceStatus, isAuthenticated])

    useEffect(() => {
        void pollOnce()

        timerRef.current = window.setInterval(pollOnce, 5000)

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current)
                timerRef.current = null
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const statusMessage = useMemo<{
        text: string
        className: string
    } | null>
    (() => {
        // 1. Action results
        if (isAuthenticated && status === "in") {
            return {text: "Checked in", className: "text-green-600"}
        }

        if (isAuthenticated && status === "out") {
            return {text: "Checked out", className: "text-blue-600"}
        }

        if (isAuthenticated && status === "joke") {
            return {
                text: "Team Sprocket value your service. Attendance is expected tomorrow.",
                className: "text-purple-600 font-semibold",
            }
        }

        if (isAuthenticated && status === "error") {
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
        if (!isAuthenticated) {
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
        isAuthenticated,
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
        if (!ENABLE_QR_AND_GEO) {
            await submitAttendance("checkin")
            return
        }

        locationPromiseRef.current = getLocation()
        setScanMode("checkin")
        setScanning(true)
    }

    const handleCheckOut = async () => {
        if (!ENABLE_QR_AND_GEO) {
            await submitAttendance("checkout")
            return
        }

        locationPromiseRef.current = getLocation()
        setScanMode("checkout")
        setScanning(true)
    }

    const handleScanResult = async (qrToken: string) => {
        if (loading || !scanMode) return
        setScanning(false)
        await submitAttendance(scanMode, qrToken)
    }

    const submitAttendance = async (
        mode: "checkin" | "checkout",
        qrToken?: string
    ) => {
        try {
            setLoading(true)

            const location = ENABLE_QR_AND_GEO
                ? (await locationPromiseRef.current) ?? {
                latitude: 0,
                longitude: 0,
                accuracy: Infinity,
            }
                : {
                    latitude: 0,
                    longitude: 0,
                    accuracy: Infinity,
                }

            if (mode === "checkin") {
                const res = await checkin({qrToken, location})
                if (res?.status === "checked_in") {
                    setStatus("in")
                    await pollOnce()
                } else {
                    setStatus("error")
                }
            }

            if (mode === "checkout") {
                const res = await checkout({qrToken, location})
                if (res?.status === "checked_out") {
                    setStatus("out")
                    await pollOnce()
                } else {
                    setStatus("error")
                }
            }
        } catch {
            setStatus("error")
        } finally {
            setLoading(false)
            setScanMode(null)
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
                valueGetter: p => p.data!.totalSeconds / 3600, // number
                valueFormatter: p => p.value.toFixed(2),       // display only
                sort: "desc",
            }
        ]

        if (featureFlags.showAttendanceTimeForComp) {
            cols.push({
                headerName: "Time above min",
                flex: 1,
                valueGetter: p => p.data!.aboveMinSeconds / 3600,
                valueFormatter: p => p.value.toFixed(2),
                cellClass: p =>
                    p.value >= 0
                        ? "text-green-600 font-bold"
                        : "text-red-600 font-bold",
            })
        }

        return cols
    }, [featureFlags.showAttendanceTimeForComp])


    /* ---------------- render ---------------- */

    return (
        <>
            {scanning && scanMode ? (
                <ScannerView
                    mode={scanMode}
                    onResult={handleScanResult}
                    onCancel={() => {
                        setScanning(false)
                        setScanMode(null)
                    }}
                />
            ) : <HeaderFooterLayoutWrapper
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
                                    disabled={loading || !isAuthenticated || isCheckedIn}
                                    onClick={handleCheckIn}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded theme-button-bg theme-text hover:theme-button-hover disabled:opacity-30"
                                >
                                    <Check size={16}/>
                                    Check In
                                </button>

                                <button
                                    disabled={loading || !isAuthenticated || !isCheckedIn}
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
                                        {!isAuthenticated && (
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
            />}
        </>
    )
}

const ScannerView = React.memo(function ScannerView({
                                                        mode,
                                                        onResult,
                                                        onCancel,
                                                    }: {
    mode: "checkin" | "checkout"
    onResult: (token: string) => void
    onCancel: () => void
}) {
    return (
        <div className="fixed inset-0 z-50 theme-bg p-4">
            <div className="text-sm mb-2">
                {mode === "checkin"
                    ? "Scan check-in QR"
                    : "Scan check-out QR"}
            </div>

            <QRCodeScanner onResult={onResult}/>

            <button
                className="mt-3 underline text-sm"
                onClick={onCancel}
            >
                Cancel
            </button>
        </div>
    )
})
