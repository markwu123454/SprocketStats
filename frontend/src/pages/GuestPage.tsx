import {useMemo} from "react"
import {useNavigate} from "react-router-dom"
import {ExternalLink, ChevronDown} from "lucide-react"

import {useAuthSuccess, useGuestName, usePermissions} from "@/components/wrappers/DataWrapper"

// If this is the format of pages required by the UI:
interface PageLink {
    title: string
    href: string
    type: "match" | "team"
}

export default function GuestDataPage() {
    const navigate = useNavigate()

    // Pull values from your new DataContext
    const authSuccess = useAuthSuccess()
    const name = useGuestName()
    const permissions = usePermissions()

    // Convert permissions → PageLink[]
    // Adjust this logic based on the actual structure of the permissions array.
    const accessiblePages = useMemo<PageLink[]>(() => {
        if (!permissions) return [];

        const pages: PageLink[] = [];

        //
        // 1. Ranking page (if allowed)
        //
        if (permissions.ranking) {
            pages.push({
                title: "Event Rankings",
                href: "/admin/data/ranking",
                type: "ranking",
            } as PageLink);
        }

        //
        // 2. Alliance Simulator page (if allowed)
        //
        if (permissions.alliance) {
            pages.push({
                title: "Alliance Simulator",
                href: "/admin/data/alliance-sim",
                type: "alliance",
            } as PageLink);
        }

        //
        // 3. Match pages
        //
        if (Array.isArray(permissions.match)) {
            for (const matchId of permissions.match) {
                pages.push({
                    title: `Match ${matchId}`,
                    href: `/admin/data/match/${matchId}`,
                    type: "match",
                });
            }
        }

        //
        // 4. Team pages
        //
        if (Array.isArray(permissions.team)) {
            for (const teamNumber of permissions.team) {
                pages.push({
                    title: `Team ${teamNumber}`,
                    href: `/admin/data/team/${teamNumber}`,
                    type: "team",
                });
            }
        }

        return pages;
    }, [permissions]);


    return (
        <div
            className="min-h-screen flex flex-col bg-gradient-to-b from-purple-950 via-purple-900 to-purple-950 text-purple-100 overflow-x-hidden"
            aria-label="Accessible data grid scroll area"
        >
            {/* AUTH CHECK (display error if DataWrapper says auth failed) */}
            {!authSuccess ? (
                <div className="flex-grow flex flex-col items-center justify-center text-center">
                    <h1 className="text-3xl font-bold mb-4">Access Denied</h1>
                    <p className="text-purple-300 mb-10">
                        You do not have valid guest access.
                        Please reopen your guest link or contact a Team 3473's scouting member.
                    </p>
                </div>
            ) : (
                <>
                    {/* SECTION 1 – Hero */}
                    <div className="flex flex-col min-h-[100svh]">
                        <header className="flex-shrink-0 flex flex-col items-center py-10 sm:pt-16 text-center px-4">
                            <div className="relative w-20 h-20 sm:w-24 sm:h-24 mb-5">
                                <img
                                    src="/static/sprocket_logo_ring.png"
                                    alt="Sprocket Logo Ring"
                                    className="absolute inset-0 w-full h-full animate-spin-slow"
                                />
                                <img
                                    src="/static/sprocket_logo_gear.png"
                                    alt="Sprocket Logo Gear"
                                    className="absolute inset-0 w-full h-full"
                                />
                            </div>

                            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                                Welcome {name}
                            </h1>

                            <p className="text-purple-300 mt-3 max-w-2xl text-center text-sm sm:text-base">
                                You’ve been granted guest access as an alliance partner for upcoming matches.
                                This portal provides synchronized scouting data to aid strategy planning.
                            </p>

                            <p className="text-purple-400 mt-1 text-xs sm:text-sm text-center">
                                Data is processed live through Team Sprocket’s internal analytics systems.
                            </p>
                        </header>

                        {/* SECTION 2 – Scrollable Data Grid */}
                        <main
                            className="flex-grow flex flex-col items-center justify-start max-w-6xl mx-auto px-4 sm:px-6 w-full pb-8"
                        >
                            <h2 className="text-xl sm:text-2xl font-semibold mb-4 border-b border-purple-700 pb-2 w-full text-left">
                                Available Data
                            </h2>

                            <div
                                className="w-full overflow-y-auto overflow-x-hidden pr-1"
                                style={{maxHeight: "calc(100vh - 490px)"}}
                                aria-label="Accessible data grid scroll area"
                            >
                                {accessiblePages.length === 0 ? (
                                    <p className="text-purple-300">
                                        Unfortunately no scouting data have been made available to you. :(
                                    </p>
                                ) : (
                                    <ul className="grid gap-5 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                                        {accessiblePages.map((p, i) => (
                                            <li
                                                key={i}
                                                className="cursor-pointer bg-purple-900/40 hover:bg-purple-800/60 transition rounded-2xl p-6 border border-purple-800 hover:border-purple-400 hover:shadow-purple-700/30 hover:shadow-lg"
                                                onClick={() => navigate(p.href)}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <h3 className="font-semibold text-lg">
                                                            {p.title}
                                                        </h3>
                                                        <p className="text-sm text-purple-300">
                                                            {p.type === "match"
                                                                ? "Match Data"
                                                                : p.type === "team"
                                                                    ? "Team Overview"
                                                                    : p.type === "ranking"
                                                                        ? "Ranking Overview"
                                                                        : "Alliance Simulator"}
                                                        </p>
                                                    </div>
                                                    <ExternalLink className="w-5 h-5 text-purple-300"/>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                        </main>
                        {/* Chevron */}
                        <div className="pb-6 animate-bounce flex justify-center mt-auto">
                            <ChevronDown className="w-6 h-6 sm:w-8 sm:h-8 text-purple-400 opacity-70"/>
                        </div>
                    </div>

                    {/* SECTION 3 – Overview */}
                    <section className="py-12 sm:py-20 text-center bg-purple-950/60 border-t border-purple-800">
                        <h2 className="text-2xl sm:text-3xl font-bold mb-6">A Full-Stack Scouting Platform</h2>
                        <p className="max-w-3xl mx-auto text-purple-300 mb-12 text-sm sm:text-base">
                            Engineered by Team Sprocket for precision, reliability, and speed. Every data point is
                            synchronized
                            from live match input, validated, and processed in minutes for strategic analysis.
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto text-purple-200">
                            <div><p className="text-3xl sm:text-4xl font-bold">15K+</p><p
                                className="text-xs sm:text-sm">Data Points Logged</p></div>
                            <div><p className="text-3xl sm:text-4xl font-bold">99.9%</p><p
                                className="text-xs sm:text-sm">Website uptime</p></div>
                            <div><p className="text-3xl sm:text-4xl font-bold">98.2%</p><p
                                className="text-xs sm:text-sm">Data accuracy</p></div>
                            <div><p className="text-3xl sm:text-4xl font-bold">100+</p><p
                                className="text-xs sm:text-sm">Matches Analyzed</p></div>
                        </div>
                    </section>

                    {/* SECTION 4 – Technical */}
                    <section className="py-16 sm:py-24 text-center bg-purple-900/30 border-t border-purple-800">
                        <h2 className="text-2xl sm:text-3xl font-bold mb-8">Under the Hood</h2>
                        <div
                            className="max-w-5xl mx-auto grid md:grid-cols-3 gap-8 sm:gap-10 text-purple-200 text-sm sm:text-base">
                            <div>
                                <h3 className="font-semibold mb-2 text-purple-400">Frontend</h3>
                                <p>React + Tailwind website for match scouting, pit scouting, live match monitoring, and
                                    interactive data presentation.</p>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2 text-purple-400">Backend</h3>
                                <p>FastAPI server integrated with Neon PostgreSQL database for high speed data transfer
                                    and data security.</p>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2 text-purple-400">Analytics</h3>
                                <p>Cutting edge ensemble analytics engine incorporating various algorithms like random
                                    forest, featured elo, and others to achieve ~80% theoretical baseline match
                                    accuracy.</p>
                            </div>
                        </div>
                    </section>

                    {/* SECTION 5 – Collaboration */}
                    <section className="py-16 sm:py-20 text-center bg-purple-950 border-t border-purple-800">
                        <h2 className="text-2xl sm:text-3xl font-bold mb-6">Partner With Us</h2>
                        <p className="max-w-2xl mx-auto text-purple-300 text-sm sm:text-base">
                            Team Sprocket shares scouted data with alliance partners to enhance strategy and performance
                            across matches. Contact us if you’d like access or integration for your own team.
                        </p>
                    </section>
                </>
            )}

            <footer
                className="text-center text-xs sm:text-sm text-purple-400 border-t border-purple-800 py-6 mt-auto shrink-0">
                © 2025 Mark Wu · Licensed to Team Sprocket
            </footer>

            <style>
                {`
                @keyframes spin-slow {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .animate-spin-slow { animation: spin-slow 10s linear infinite; }
                [aria-label="Accessible data grid scroll area"] {
                    scrollbar-gutter: stable;
                }
                [aria-label="Accessible data grid scroll area"]::-webkit-scrollbar { width: 8px; }
                [aria-label="Accessible data grid scroll area"]::-webkit-scrollbar-thumb {
                    background-color: rgba(180, 100, 255, 0.4);
                    border-radius: 4px;
                }
            `}
            </style>
        </div>
    )
}
