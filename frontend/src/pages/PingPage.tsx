import {useEffect, useState} from "react"
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    ResponsiveContainer,
    CartesianGrid,
} from "recharts"
import {useAPI} from "@/hooks/useAPI"

interface PingPoint {
    time: string
    latency: number
}

export default function PingMonitor() {
    const {ping} = useAPI()
    const [data, setData] = useState<PingPoint[]>([])

    const PING_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
    const MAX_POINTS = 1080 // store ~78 hours of logs

    async function doPing() {
        const start = performance.now()
        try {
            await ping()
            const latency = performance.now() - start
            const time = new Date().toLocaleTimeString()
            setData(prev => {
                const next = [...prev, {time, latency: Number(latency.toFixed(2))}]
                return next.length > MAX_POINTS ? next.slice(-MAX_POINTS) : next
            })
        } catch {
            const time = new Date().toLocaleTimeString()
            setData(prev => {
                const next = [...prev, {time, latency: 0}]
                return next.length > MAX_POINTS ? next.slice(-MAX_POINTS) : next
            })
        }
    }

    useEffect(() => {
        void doPing()
        const id = setInterval(doPing, PING_INTERVAL_MS)
        return () => clearInterval(id)
    }, [])


    return (
        <div
            className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-[#1A082E] via-[#240046] to-[#0B0014] text-zinc-100 select-none pointer-events-none">
            {/* --- HEADER --- */}
            <div className="relative flex flex-col items-center mt-6 mb-3">
                {/* Layered logo: ring behind gear */}
                <div className="relative w-24 h-24 mb-3">
                    <img
                        src="/static/sprocket_logo_ring.png"
                        alt="Sprocket Ring"
                        className="absolute inset-0 w-full h-full drop-shadow-[0_0_16px_#a855f7] animate-spin-slow"
                    />
                    <img
                        src="/static/sprocket_logo_gear.png"
                        alt="Sprocket Gear"
                        className="absolute inset-0 w-full h-full drop-shadow-[0_0_16px_#a855f7]"
                    />
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-[#C77DFF]">
                    Team 3473 — Server latency checker
                </h1>
                <p className="text-sm text-zinc-400 mt-1">
                    DO NOT TOUCH
                </p>
            </div>

            {/* --- CHART --- */}
            <div
                className="w-[90%] max-w-6xl flex-1 bg-[#120024]/80 border border-[#3b0a7e] shadow-lg rounded-2xl overflow-hidden">
                <div className="h-[72vh] p-4">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            data={data}
                            margin={{top: 20, right: 30, left: 10, bottom: 30}}
                        >
                            <CartesianGrid stroke="#2a005f" strokeDasharray="4 4"/>
                            <XAxis
                                dataKey="time"
                                stroke="#a855f7"
                                tick={{fontSize: 10, fill: "#a855f7"}}
                                angle={-25}
                                height={40}
                            />
                            <YAxis
                                stroke="#a855f7"
                                tick={{fontSize: 12, fill: "#a855f7"}}
                                label={{
                                    value: "Latency (ms)",
                                    angle: -90,
                                    position: "insideLeft",
                                    fill: "#a855f7",
                                    fontSize: 12,
                                }}
                            />
                            <Line
                                type="monotone"
                                dataKey="latency"
                                stroke="#C77DFF"
                                strokeWidth={2.5}
                                dot={false}
                                isAnimationActive={false}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <p className="text-xs text-zinc-500 mt-2 mb-3">
                3473 Sprocket — diagnostic latency logger ({PING_INTERVAL_MS / 60000} min interval)
            </p>
        </div>
    )
}
