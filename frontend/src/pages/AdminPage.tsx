// --- Imports ---
import {useEffect, useState} from "react";
import {useAPI} from "@/hooks/useAPI.ts";
import {useNavigate} from "react-router-dom";
import {ArrowLeft} from "lucide-react";
import * as React from "react";

// --- Global constants ---
const BASE_URL = import.meta.env.VITE_BACKEND_URL;

export default function AdminPage() {
    const navigate = useNavigate();
    const {get_metadata} = useAPI();

    // --- State ---
    const [version, setVersion] = useState<string>("");
    const [eventKey, setEventKey] = useState<string | null>(null);
    const [eventName, setEventName] = useState<string>("No event selected");
    const [kpis, setKpis] = useState({
        totalMatches: "—",
        scouted: "—",
        pending: "—",
        currentMatch: "—",
    });

    const [selectedMatch, setSelectedMatch] = useState<string>("");
    const [selectedTeam, setSelectedTeam] = useState<string>("");

    // --- Event Name Resolution ---
    useEffect(() => {
        (async () => {
            try {
                const nameRes = await fetch("/teams/event_names.json");
                const nameMap = await nameRes.json();
                if (eventKey && nameMap[eventKey]) {
                    setEventName(nameMap[eventKey].short);
                }
            } catch {
                setEventName("No event selected");
            }
        })();
    }, [eventKey]);

    // --- Version Fetch ---
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/version");
                const data = await res.json();
                setVersion(data.version);
            } catch {
                setVersion("—");
            }
        })();
    }, []);

    // --- Metadata Fetch + KPI Mapping ---
    useEffect(() => {
        void (async () => {
            const meta = await get_metadata();
            if (meta.current_event) {
                setEventKey(meta.current_event);
            }
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
            className="min-h-screen relative text-sm font-medium leading-relaxed
      theme-light:text-zinc-900
      theme-dark:text-white
      theme-2025:text-white
      theme-2026:text-[#3b2d00]
      theme-3473:text-white"
        >
            {/* Background */}
            <div
                className="absolute inset-0 bg-top bg-cover
        theme-light:bg-zinc-100
        theme-dark:bg-zinc-950
        theme-2025:bg-[url('/seasons/2025/expanded.png')]
        theme-2026:bg-[url('/seasons/2026/expanded.png')]
        theme-3473:bg-[radial-gradient(80%_110%_at_10%_10%,#4c2c7a,#1f0b46),linear-gradient(135deg,#140a2a,#1f0b46)]"
            />

            <div className="relative z-10 flex flex-col min-h-screen">

                {/* Header */}
                <header
                    className="flex items-center p-2 h-12 text-xl font-semibold tracking-wide
          bg-white/80 theme-dark:bg-[rgba(9,9,11,0.7)] theme-2025:bg-[rgba(11,35,79,0.7)]
          theme-2026:bg-[rgba(254,247,220,0.8)] theme-3473:bg-[rgba(76,29,149,0.75)]"
                >
                    {/* Top-Left Back Arrow (must persist) */}
                    <button
                        onClick={() => navigate("/")}
                        className="transition hover:opacity-70 ml-2 mr-4"
                        title="Back to Home"
                        type="button"
                    >
                        <ArrowLeft className="w-5 h-5"/>
                    </button>

                    <span className="mr-auto">ADMIN DASHBOARD</span>
                </header>

                {/* Event Name + ID Row */}
                <section className="px-4 pt-3 pb-2 border-b font-semibold
        theme-light:border-zinc-300 theme-dark:border-zinc-800 theme-2025:border-[#1b3d80]
        theme-2026:border-[#e6ddae] theme-3473:border-[#6d28d9]">
                    <h2 className="text-lg font-bold">Event: {eventName}</h2>
                    <p className="text-xs opacity-70">Event Key: {eventKey || "—"}</p>
                </section>

                {/* KPI Top Row */}
                <section
                    className="grid grid-cols-4 gap-4 px-4 py-3 text-center border-b font-semibold
          backdrop-blur-md
          theme-light:bg-white/50
          theme-dark:bg-zinc-900/40
          theme-2025:bg-[rgba(11,30,70,0.35)]
          theme-2026:bg-[#e6ddae]/25
          theme-3473:bg-[rgba(60,20,120,0.3)]"
                >
                    <KPIBlock label="Total Matches" value={kpis.totalMatches}/>
                    <KPIBlock label="Scouted" value={kpis.scouted}/>
                    <KPIBlock label="Pending" value={kpis.pending}/>
                    <KPIBlock label="Current Match" value={kpis.currentMatch}/>
                </section>

                {/* Primary Navigation with selectors */}
                <nav className="space-y-3 px-4 py-5">

                    <NavCard
                        label="Match Monitoring"
                        path="/admin/monitor"
                    />

                    <NavCard label="Data by Match">
                        <input
                            placeholder="Enter Match (e.g., QM 42, SF 1-2)"
                            value={selectedMatch}
                            onChange={(e) => setSelectedMatch(e.target.value)}
                            className="w-full p-2 rounded-2xl border backdrop-blur-sm
              theme-light:bg-white/60 theme-dark:bg-zinc-900/60"
                        />
                        <button
                            disabled={!selectedMatch.trim()}
                            onClick={() => navigate(`/admin/data/match/${selectedMatch.trim()}`)}
                            className="w-full mt-2 p-2 rounded-2xl border hover:opacity-80 transition disabled:opacity-40"
                            type="button"
                        >
                            View Match Data
                        </button>
                    </NavCard>

                    <NavCard label="Data by Team">
                        <input
                            placeholder="Enter Team Number or Name"
                            value={selectedTeam}
                            onChange={(e) => setSelectedTeam(e.target.value)}
                            className="w-full p-2 rounded-2xl border backdrop-blur-sm
              theme-light:bg-white/60 theme-dark:bg-zinc-900/60"
                        />
                        <button
                            disabled={!selectedTeam.trim()}
                            onClick={() => navigate(`/admin/data/team/${selectedTeam.trim()}`)}
                            className="w-full mt-2 p-2 rounded-2xl border hover:opacity-80 transition disabled:opacity-40"
                            type="button"
                        >
                            View Team Data
                        </button>
                    </NavCard>

                    <NavCard label="Rankings" path="/admin/data/ranking"/>
                    <NavCard label="Alliance Simulator" path="/admin/data/alliance-sim"/>
                    <NavCard label="Scouter Assignment" path="/admin/assign"/>

                    <NavCard label="Guest Page" path="/guest?pw=validdemo"/>
                </nav>

                {/* Placeholder Main */}
                <main className="flex-1 border-y-2 theme-light:border-zinc-300 theme-dark:border-zinc-800 px-4 py-6">
                    {/* Reserved For Content */}
                </main>

                {/* Footer */}
                <footer
                    className="p-3 h-14 flex items-center justify-between text-xs tracking-wide font-semibold
          backdrop-blur-md
          theme-light:bg-white/50
          theme-dark:bg-zinc-900/40
          theme-2025:bg-[rgba(11,30,70,0.35)]
          theme-2026:bg-[rgba(40,25,0,0.25)]
          theme-3473:bg-[rgba(60,20,120,0.3)]"
                >
                    <div className="ml-2 space-x-2">
                        <a href="https://neon.com" target="_blank" rel="noreferrer">Neon URL</a>
                        <span>•</span>
                        <button
                            onClick={() => window.open(BASE_URL, "_blank")}
                            className="px-3 py-1 rounded-2xl border hover:opacity-70 transition"
                            type="button"
                        >
                            Open Backend
                        </button>
                    </div>

                    <div className="text-right">
                        <p>Branch: main</p>
                        <p>Commit: {version.slice(0, 7) || "—"}</p>
                    </div>
                </footer>
            </div>
        </div>
    );
}

// --- Reusable Card-Style Navigation Element ---
function NavCard({
                     label,
                     path,
                     children,
                 }: {
    label: string;
    path?: string;
    children?: React.ReactNode;
}) {
    const navigate = useNavigate();
    const tintClasses = `
    theme-light:bg-white/50
    theme-dark:bg-zinc-900/40
    theme-2025:bg-[rgba(11,30,70,0.35)]
    theme-2026:bg-[#e6ddae]/25
    theme-3473:bg-[rgba(60,20,120,0.3)]
  `;

    return (
        <div
            onClick={path ? () => navigate(path) : undefined}
            className={`p-3 rounded-2xl border cursor-pointer transition hover:opacity-80 shadow-md ${tintClasses} backdrop-blur-lg`}
        >
            <div className="text-base font-bold uppercase mb-2 opacity-80">{label}</div>
            {children}
        </div>
    );
}

// --- KPI Block ---
function KPIBlock({label, value}: { label: string; value: string }) {
    return (
        <div>
            <p className="text-xs uppercase opacity-70">{label}</p>
            <p className="text-base font-semibold">{value}</p>
        </div>
    );
}
