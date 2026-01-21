import {useEffect, useState} from "react";
import {useAPI} from "@/hooks/useAPI.ts";
import {Link} from "react-router-dom";
import {
    ArrowLeft,
    Monitor,
    BarChart2,
    Users,
    Search,
    Activity,
    Terminal,
    GitBranch,
    UsersRound,
    Share
} from "lucide-react";
import {HeaderFooterLayoutWrapper} from "@/components/wrappers/HeaderFooterLayoutWrapper.tsx";

export default function AdminPage() {
    const {getMetadata} = useAPI();

    // --- state ---
    const [version, setVersion] = useState<Record<string, any>>({});
    const [metadata, setMetadata] = useState<Record<string, any>>({});
    const [eventNames, setEventNames] = useState<Record<string, { full: string; short: string }>>({});
    const [selectedMatch, setSelectedMatch] = useState("");
    const [selectedTeam, setSelectedTeam] = useState("");

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
            if (meta) setMetadata(meta);

            const nameRes = await fetch("/teams/event_names.json");
            setEventNames(await nameRes.json());

        })();
    }, []);

    return (
        <HeaderFooterLayoutWrapper
            header={
                <>
                    <Link
                        to="/"
                        className="flex items-center gap-2 hover:opacity-80 transition theme-subtext-color"
                    >
                        <ArrowLeft className="w-5 h-5"/>
                        <span className="text-sm font-medium">Back</span>
                    </Link>

                    <div className="flex-1 text-center">
                        <p className="text-lg font-bold">Admin Hub</p>
                        <p className="text-xs opacity-70">
                            Event: {eventNames?.[metadata["current_event"]]?.full ?? "-"}
                        </p>
                    </div>

                    <div className="text-xs opacity-70 text-right">
                        Event Key: {metadata["current_event"] ?? "-"}
                    </div>
                </>
            }
            body={
                <main className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">

                    {/* LEFT: ROUTING HUB */}
                    <section className="space-y-4">

                        {/* Core Admin Navigation */}
                        <Link
                            to="/admin/monitor"
                            className="block p-4 rounded-xl border cursor-pointer shadow-md transition hover:scale-[1.02] active:scale-[0.98] backdrop-blur-sm theme-bg theme-border"
                        >
                            <div className="flex items-center gap-3 font-semibold">
                                <Monitor className="w-5 h-5"/>
                                Match Monitoring
                            </div>
                        </Link>

                        <Link
                            to="/admin/assignment"
                            className="block p-4 rounded-xl border cursor-pointer shadow-md transition hover:scale-[1.02] active:scale-[0.98] backdrop-blur-sm theme-bg theme-border"
                        >
                            <div className="flex items-center gap-3 font-semibold">
                                <UsersRound className="w-5 h-5"/>
                                Match assignment
                            </div>
                        </Link>

                        <Link
                            to="/admin/schedule"
                            className="block p-4 rounded-xl border cursor-pointer shadow-md transition hover:scale-[1.02] active:scale-[0.98] backdrop-blur-sm theme-bg theme-border"
                        >
                            <div className="flex items-center gap-3 font-semibold">
                                <Users className="w-5 h-5"/>
                                Attendance & Meetings
                            </div>
                        </Link>

                        <Link
                            to="/admin/share"
                            className="block p-4 rounded-xl border cursor-pointer shadow-md transition hover:scale-[1.02] active:scale-[0.98] backdrop-blur-sm theme-bg theme-border"
                        >
                            <div className="flex items-center gap-3 font-semibold">
                                <Share className="w-5 h-5"/>
                                Share data
                            </div>
                        </Link>

                        {/* --- DATA SECTION (BOTTOM) --- */}

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
                            <Link
                                to={`/data/match/${selectedMatch.trim()}`}
                                className={`block text-center w-full mt-2 p-2 rounded-xl border transition theme-border ${
                                    !selectedMatch.trim() ? "pointer-events-none opacity-40" : "hover:bg-white/10"
                                }`}
                            >
                                View Match
                            </Link>
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
                            <Link
                                to={`/data/team/${selectedTeam.trim()}`}
                                className={`block text-center w-full mt-2 p-2 rounded-xl border transition theme-border ${
                                    !selectedTeam.trim() ? "pointer-events-none opacity-40" : "hover:bg-white/10"
                                }`}
                            >
                                View Team
                            </Link>
                        </div>

                        <Link
                            to="/data/ranking"
                            className="block p-4 rounded-xl border cursor-pointer shadow-md transition hover:scale-[1.02] active:scale-[0.98] backdrop-blur-sm theme-bg theme-border"
                        >
                            <div className="flex items-center gap-3 font-semibold">
                                <BarChart2 className="w-5 h-5"/>
                                Rankings
                            </div>
                        </Link>

                        <Link
                            to="/data/alliance-sim"
                            className="block p-4 rounded-xl border cursor-pointer shadow-md transition hover:scale-[1.02] active:scale-[0.98] backdrop-blur-sm theme-bg theme-border"
                        >
                            <div className="flex items-center gap-3 font-semibold">
                                <Activity className="w-5 h-5"/>
                                Alliance Simulator
                            </div>
                        </Link>

                    </section>


                    {/* RIGHT SIDEBAR */}
                    <aside className="space-y-4">
                        <div className="p-4 rounded-xl border shadow backdrop-blur-sm theme-bg theme-border">
                            <div className="flex items-center gap-2 font-bold text-sm mb-2 opacity-80">
                                <GitBranch className="w-4 h-4"/> Build Info
                            </div>
                            <p className="text-xs opacity-70">Branch: {version.VERCEL_GIT_COMMIT_REF || "development"}</p>
                            <p className="text-xs opacity-70">Commit: {version.VERCEL_GIT_COMMIT_SHA_SHORT || "—"}</p>
                            <p className="text-xs opacity-70">Author: {version.VERCEL_GIT_COMMIT_AUTHOR_LOGIN ?? "—"}</p>
                            <p className="text-xs opacity-70">Deploy time: {version.DEPLOY_TIME ?? "—"}</p>
                        </div>

                        <div className="p-4 rounded-xl border shadow backdrop-blur-sm theme-bg theme-border">
                            <div className="flex items-center gap-2 font-bold text-sm mb-2 opacity-80">
                                <Terminal className="w-4 h-4"/> Debug Values
                            </div>
                            <p className="text-xs opacity-70">Current Event Key: {metadata.current_event}</p>
                            <p className="text-xs opacity-70">Scouting Status: {metadata.scouting_status ?? "—"}</p>
                        </div>
                    </aside>

                </main>
            }
            footer={
                <>
                    <a
                        href="https://console.neon.tech"
                        target="_blank"
                        className="hover:opacity-70 transition text-inherit"
                    >
                        Neon URL
                    </a>

                    <div className="opacity-70 text-right">
                        <p>Branch: {version.VERCEL_GIT_COMMIT_REF || "development"}</p>
                        <p>Commit: {version.VERCEL_GIT_COMMIT_SHA_SHORT || "—"}</p>
                    </div>
                </>
            }
        />
    );
}
