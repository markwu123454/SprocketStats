import {useEffect, useState} from "react";
import {useAPI} from "@/hooks/useAPI.ts";
import {useNavigate} from "react-router-dom";
import {ArrowLeft, Monitor, BarChart2, Users, Search, Activity, Terminal, GitBranch, UsersRound} from "lucide-react";

export default function AdminPage() {
    const navigate = useNavigate();
    const {getMetadata} = useAPI();

    // --- state ---
    const [version, setVersion] = useState<Record<string, any>>({});
    const [metadata, setMetadata] = useState<Record<string, any>>({});
    const [eventNames, setEventNames] = useState<Record<string, { full: string; short: string }>>({});
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
            setVersion(data);
        })();
    }, []);

    useEffect(() => {
        void (async () => {
            const meta = await getMetadata();
            setMetadata(meta);

            const nameRes = await fetch("/teams/event_names.json");
            setEventNames(await nameRes.json());

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

    return (
        <div
            className="min-h-screen relative text-sm theme-text">

            {/* Background */}
            <div className="absolute inset-0 bg-top bg-cover theme-bg-page"/>

            <div className="relative z-10 flex flex-col min-h-screen">

                {/* HEADER */}
                <header
                    className="h-16 px-6 flex items-center border-b backdrop-blur-md theme-bg theme-border">

                    <button
                        onClick={() => navigate("/")}
                        className="flex items-center gap-2 hover:opacity-80 transition"
                        style={{color: "var(--themed-subtext-color)"}}>
                        <ArrowLeft className="w-5 h-5"/>
                        <span className="text-sm font-medium">Back</span>
                    </button>

                    <div className="flex-1 text-center">
                        <p className="text-lg font-bold">Admin Hub</p>
                        <p className="text-xs opacity-70">
                            Event: {eventNames?.[metadata["current_event"]]?.full ?? "-"}
                        </p>
                    </div>

                    <div className="text-xs opacity-70 text-right">
                        Event Key: {metadata["current_event"] ?? "-"}
                    </div>
                </header>

                {/* BODY */}
                <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">

                    {/* LEFT: ROUTING HUB */}
                    <section className="space-y-4">

                        {/* Status Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                                {label: "Total Matches", value: kpis.totalMatches, icon: Activity},
                                {label: "Scouted", value: kpis.scouted, icon: BarChart2},
                                {label: "Pending", value: kpis.pending, icon: Search},
                                {label: "Current Match", value: kpis.currentMatch, icon: Monitor},
                            ].map((item, i) => (
                                <div key={i}
                                     className="p-3 rounded-xl border shadow backdrop-blur-sm theme-bg theme-border">
                                    <div className="flex items-center gap-2 opacity-80 text-xs">
                                        <item.icon className="w-4 h-4"/>
                                        {item.label}
                                    </div>
                                    <p className="text-xl font-bold pt-1">{item.value}</p>
                                </div>
                            ))}
                        </div>

                        {/* Navigation Cards */}
                        <div onClick={() => navigate("/admin/monitor")}
                             className="p-4 rounded-xl border cursor-pointer shadow-md transition hover:scale-[1.02] active:scale-[0.98] backdrop-blur-sm theme-bg theme-border">
                            <div className="flex items-center gap-3 font-semibold">
                                <Monitor className="w-5 h-5"/>
                                Match Monitoring
                            </div>
                        </div>

                        {/* Data by Match */}
                        <div className="p-4 rounded-xl border shadow-md backdrop-blur-sm theme-bg theme-border">
                            <div className="font-bold uppercase opacity-80 mb-2 flex items-center gap-2 text-sm">
                                <Search className="w-4 h-4"/> Data by Match
                            </div>
                            <input
                                placeholder="Enter match"
                                value={selectedMatch}
                                onChange={(e) => setSelectedMatch(e.target.value)}
                                className="w-full p-2 rounded-xl border bg-transparent focus:ring-2 theme-border"
                            />
                            <button
                                disabled={!selectedMatch.trim()}
                                onClick={() => navigate(`/admin/data/match/${selectedMatch.trim()}`)}
                                className="w-full mt-2 p-2 rounded-xl border transition hover:bg-white/10 disabled:opacity-40 theme-border"
                                type="button">
                                View Match
                            </button>
                        </div>

                        {/* Data by Team */}
                        <div className="p-4 rounded-xl border shadow-md backdrop-blur-sm theme-bg theme-border">
                            <div className="font-bold uppercase opacity-80 mb-2 flex items-center gap-2 text-sm">
                                <Users className="w-4 h-4"/> Data by Team
                            </div>
                            <input
                                placeholder="Enter team"
                                value={selectedTeam}
                                onChange={(e) => setSelectedTeam(e.target.value)}
                                className="w-full p-2 rounded-xl border bg-transparent focus:ring-2 theme-border"
                            />
                            <button
                                disabled={!selectedTeam.trim()}
                                onClick={() => navigate(`/admin/data/team/${selectedTeam.trim()}`)}
                                className="w-full mt-2 p-2 rounded-xl border transition hover:bg-white/10 disabled:opacity-40 theme-border"
                                type="button">
                                View Team
                            </button>
                        </div>

                        <div onClick={() => navigate("/admin/data/ranking")}
                             className="p-4 rounded-xl border cursor-pointer shadow-md transition hover:scale-[1.02] active:scale-[0.98] backdrop-blur-sm theme-bg theme-border">
                            <div className="flex items-center gap-3 font-semibold">
                                <BarChart2 className="w-5 h-5"/>
                                Rankings
                            </div>
                        </div>

                        <div onClick={() => navigate("/admin/data/alliance-sim")}
                             className="p-4 rounded-xl border cursor-pointer shadow-md transition hover:scale-[1.02] active:scale-[0.98] backdrop-blur-sm theme-bg theme-border">
                            <div className="flex items-center gap-3 font-semibold">
                                <Activity className="w-5 h-5"/>
                                Alliance Simulator
                            </div>
                        </div>

                        <div onClick={() => navigate("/admin/assignment")}
                             className="p-4 rounded-xl border cursor-pointer shadow-md transition hover:scale-[1.02] active:scale-[0.98] backdrop-blur-sm theme-bg theme-border">
                            <div className="flex items-center gap-3 font-semibold">
                                <UsersRound className="w-5 h-5"/>
                                Match assignment
                            </div>
                        </div>
                    </section>

                    {/* RIGHT SIDEBAR: TECHNICAL DEBUG PANEL */}
                    <aside className="space-y-4">

                        <div
                            className="p-4 rounded-xl border shadow backdrop-blur-sm theme-bg theme-border">
                            <div className="flex items-center gap-2 font-bold text-sm mb-2 opacity-80">
                                <GitBranch className="w-4 h-4"/> Build Info
                            </div>
                            <p className="text-xs opacity-70 mt-1">Branch: {version.VERCEL_GIT_COMMIT_REF || "development"}</p>
                            <p className="text-xs opacity-70">Commit: {version.VERCEL_GIT_COMMIT_SHA_SHORT || "—"}</p>
                            <p className="text-xs opacity-70">Author: {version.VERCEL_GIT_COMMIT_AUTHOR_LOGIN ?? "—"}</p>
                            <p className="text-xs opacity-70">Deploy time: {version.DEPLOY_TIME ?? "—"}</p>
                        </div>

                        <div
                            className="p-4 rounded-xl border shadow backdrop-blur-sm theme-bg theme-border">
                            <div className="flex items-center gap-2 font-bold text-sm mb-2 opacity-80">
                                <Terminal className="w-4 h-4"/> Debug Values
                            </div>
                            <p className="text-xs opacity-70">Current Event Key: {metadata.current_event}</p>
                            <p className="text-xs opacity-70">Matches Loaded: {kpis.totalMatches}</p>
                            <p className="text-xs opacity-70">Scouting Status: {metadata.scouting_status ?? "—"}</p>
                        </div>

                    </aside>
                </main>

                {/* FOOTER */}
                <footer
                    className="h-16 border-t px-6 flex items-center justify-between backdrop-blur-md text-xs font-semibold tracking-wide theme-bg theme-border">

                    <a href="https://console.neon.tech" target="_blank" className="hover:opacity-70 transition text-inherit">
                        Neon URL
                    </a>

                    <div className="opacity-70 text-right">
                        <p>Branch: {version.VERCEL_GIT_COMMIT_REF || "development"}</p>
                        <p>Commit: {version.VERCEL_GIT_COMMIT_SHA_SHORT || "—"}</p>
                    </div>
                </footer>

            </div>
        </div>
    );
}
