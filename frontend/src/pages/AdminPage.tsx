// --- Imports ---
import {useEffect, useState} from "react";
import {useAPI} from "@/hooks/useAPI.ts";
import {useNavigate} from "react-router-dom";
import {ArrowLeft} from "lucide-react";

export default function AdminPage() {
    const navigate = useNavigate();
    const {get_metadata} = useAPI();

    // --- state ---
    const [version, setVersion] = useState("");
    const [metadata, setMetadata] = useState<Record<string, any>>({});
    const [eventNames, setEventNames] = useState<Record<string, { full: string, short: string }>>({});
    const [selectedMatch, setSelectedMatch] = useState("");
    const [selectedTeam, setSelectedTeam] = useState("");

    const [kpis, setKpis] = useState({
        totalMatches: "—",
        scouted: "—",
        pending: "—",
        currentMatch: "—",
    });

    // --- effects ---
    useEffect(() => {
        (async () => {
            const res = await fetch("/api/version");
            const data = await res.json();
            setVersion(data.version);
        })();
    }, []);

    useEffect(() => {
        void (async () => {
            const meta = await get_metadata();
            setMetadata(meta);

            // fetch name map + resolve full event name
            const nameRes = await fetch("/teams/event_names.json");
            setEventNames(await nameRes.json());

            // KPI mapping
            if (meta.kpis) {
                setKpis({
                    totalMatches: String(meta.kpis.total_matches ?? "—"),
                    scouted: String(meta.kpis.scouted ?? "—"),
                    pending: String(meta.kpis.pending ?? "—"),
                    currentMatch: meta.kpis.current_match ?? "—",
                });
            }
        })();
    }, []);

    // --- render ---
    return (
        <div
            className="min-h-screen relative text-sm
            theme-light:text-zinc-900
            theme-dark:text-white
            theme-2025:text-white
            theme-2026:text-[#3b2d00]
            theme-3473:text-white">
            {/* --- Background --- */}
            <div className="absolute inset-0 bg-top bg-cover
                 theme-light:bg-zinc-100
                 theme-dark:bg-zinc-950
                 theme-2025:bg-[url('/seasons/2025/expanded.png')]
                 theme-2026:bg-[url('/seasons/2026/expanded.png')]
                 theme-3473:bg-[radial-gradient(80%_110%_at_10%_10%,#4c2c7a,#1f0b46),linear-gradient(135deg,#140a2a,#1f0b46)]"/>

            {/* --- Foreground --- */}
            <div className="relative z-10 flex flex-col min-h-screen">

                {/* ================= HEADER (only section modified) ================= */}
                <section
                    className="p-2 h-10 text-xl flex items-center
                             theme-light:bg-[#ffffff]/75
                             theme-dark:bg-[rgba(9,9,11,0.7)]/75
                             theme-2025:bg-[rgba(11,35,79,0.7)]/75
                             theme-2026:bg-[rgba(254,247,220,0.8)]/75
                             theme-3473:bg-[rgba(76,29,149,0.75)]/75">
                    <button
                        onClick={() => navigate("/")}
                        className="transition hover:opacity-80"
                        title="Back to Home"
                        type="button"
                        style={{color: "var(--themed-subtext-color)"}}
                    >
                        <ArrowLeft className="ml-5 w-5 h-5 mr-5"/>
                    </button>

                    <span className="text-base font-bold px-5">Event: {eventNames?.[metadata["current_event"]]?.full ?? "-"}</span>
                    <span className="text-xs opacity-70 px-5">Key: {metadata["current_event"] ?? "-"}</span>
                </section>

                {/* ================= BODY (kept mostly original) ================= */}

                {/* KPI Row preserved */}
                <section className="grid grid-cols-4 gap-4 px-4 py-2 text-center border-b font-semibold
                                  theme-light:border-zinc-300
                                  theme-dark:border-zinc-800
                                  theme-2025:border-[#1b3d80]
                                  theme-2026:border-[#e6ddae]
                                  theme-3473:border-[#6d28d9]">
                    <div>
                        <p className="text-xs uppercase opacity-70">Total Matches</p>
                        <p className="text-base">{kpis.totalMatches}</p>
                    </div>
                    <div>
                        <p className="text-xs uppercase opacity-70">Scouted</p>
                        <p className="text-base">{kpis.scouted}</p>
                    </div>
                    <div>
                        <p className="text-xs uppercase opacity-70">Pending</p>
                        <p className="text-base">{kpis.pending}</p>
                    </div>
                    <div>
                        <p className="text-xs uppercase opacity-70">Current Match</p>
                        <p className="text-base">{kpis.currentMatch}</p>
                    </div>
                </section>

                {/* Navigation cards reverted to original structure + blur/tint added */}
                <section className="px-4 py-4 space-y-3">
                    <div
                        onClick={() => navigate("/admin/monitor")}
                        className="p-2 rounded-xl border cursor-pointer shadow-md transition backdrop-blur-sm
                                   theme-light:bg-white/35
                                   theme-dark:bg-zinc-900/30
                                   theme-2025:bg-[rgba(11,35,79,0.25)]
                                   theme-2026:bg-[rgba(254,247,220,0.4)]
                                   theme-3473:bg-[rgba(60,20,120,0.2)]">
                        Match Monitoring
                    </div>

                    {/* Data By Match gated with input */}
                    <div
                        className="p-2 rounded-xl border shadow-md backdrop-blur-sm
                                 theme-light:bg-white/35
                                 theme-dark:bg-zinc-900/30
                                 theme-2025:bg-[rgba(11,35,79,0.25)]
                                 theme-2026:bg-[rgba(254,247,220,0.4)]
                                 theme-3473:bg-[rgba(60,20,120,0.2)]">
                        <div className="text-base font-bold uppercase opacity-80 mb-1">Data by Match</div>
                        <input
                            placeholder="Enter Match"
                            value={selectedMatch}
                            onChange={(e) => setSelectedMatch(e.target.value)}
                            className="w-full p-2 rounded-xl border bg-transparent"
                        />
                        <button
                            disabled={!selectedMatch.trim()}
                            onClick={() => navigate(`/admin/data/match?m=${selectedMatch.trim()}`)}
                            className="w-full mt-2 p-2 rounded-xl border transition disabled:opacity-40 hover:opacity-80"
                            type="button"
                        >
                            View Match
                        </button>
                    </div>

                    {/* Data By Team gated with input */}
                    <div
                        className="p-2 rounded-xl border shadow-md backdrop-blur-sm
                                 theme-light:bg-white/35
                                 theme-dark:bg-zinc-900/30
                                 theme-2025:bg-[rgba(11,35,79,0.25)]
                                 theme-2026:bg-[rgba(254,247,220,0.4)]
                                 theme-3473:bg-[rgba(60,20,120,0.2)]">
                        <div className="text-base font-bold uppercase opacity-80 mb-1">Data by Team</div>
                        <input
                            placeholder="Enter Team"
                            value={selectedTeam}
                            onChange={(e) => setSelectedTeam(e.target.value)}
                            className="w-full p-2 rounded-xl border bg-transparent"
                        />
                        <button
                            disabled={!selectedTeam.trim()}
                            onClick={() => navigate(`/admin/data/team?t=${selectedTeam.trim()}`)}
                            className="w-full mt-2 p-2 rounded-xl border transition disabled:opacity-40 hover:opacity-80"
                            type="button"
                        >
                            View Team
                        </button>
                    </div>

                    <div
                        onClick={() => navigate("/admin/data/ranking")}
                        className="p-2 rounded-xl border cursor-pointer shadow-md transition backdrop-blur-sm
                                 theme-light:bg-white/35
                                 theme-dark:bg-zinc-900/30">
                        Rankings
                    </div>

                    <div
                        onClick={() => navigate("/admin/data/alliance-sim")}
                        className="p-2 rounded-xl border cursor-pointer shadow-md transition backdrop-blur-sm
                                 theme-light:bg-white/35
                                 theme-dark:bg-zinc-900/30">
                        Alliance Simulator
                    </div>

                    <div
                        onClick={() => navigate("/admin/assign")}
                        className="p-2 rounded-xl border cursor-pointer shadow-md transition backdrop-blur-sm
                                 theme-light:bg-white/35
                                 theme-dark:bg-zinc-900/30">
                        Scouter Assignment
                    </div>
                </section>

                <section className="flex-1"/>

                {/* ================= FOOTER (only section modified) ================= */}
                <section className="pt-2 h-10
                                  theme-light:bg-[#ffffff]/75
                                  theme-dark:bg-[rgba(9,9,11,0.7)]/75
                                  theme-2025:bg-[rgba(11,35,79,0.7)]/75
                                  theme-2026:bg-[rgba(254,247,220,0.8)]/75
                                  theme-3473:bg-[rgba(76,29,149,0.7)]/75
                                  flex items-center justify-between px-4 text-xs font-semibold tracking-wide">
                    <div>
                        <a href="https://neon.com" target="_blank" className="hover:opacity-70 transition text-inherit">
                            Neon URL
                        </a>
                    </div>

                    <div className="text-right opacity-70">
                        <p>Branch: main</p>
                        <p>Commit: {version.slice(0, 7) || "—"}</p>
                    </div>

                </section>
            </div>
        </div>
    );
}
