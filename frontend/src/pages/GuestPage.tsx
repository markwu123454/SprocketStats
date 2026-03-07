import React, {useEffect, useMemo, useState, useRef} from "react"
import {useNavigate, useLocation} from "react-router-dom"
import {ChevronDown} from "lucide-react"
import {motion} from "framer-motion"

import {useAuthSuccess, useGuestName, usePermissions, useLoading} from "@/components/wrappers/DataWrapper"
import {KeyRound, Eye, EyeOff} from "lucide-react"
import {useDataContext} from "@/components/wrappers/DataWrapper"

// If this is the format of pages required by the UI:
interface PageLink {
    title: string
    href: string
    type: "match" | "team" | "ranking" | "alliance"
}

const sectionReveal = {
    initial: {opacity: 0, y: 40},
    whileInView: {opacity: 1, y: 0},
    viewport: {once: true, amount: 0.1} as const,
    transition: {duration: 0.7, ease: "easeOut"},
}

const staggerContainer = {
    initial: {},
    whileInView: {transition: {staggerChildren: 0.12}},
    viewport: {once: true, amount: 0.1} as const,
}

const staggerItem = {
    initial: {opacity: 0, y: 24},
    whileInView: {opacity: 1, y: 0},
    transition: {duration: 0.5, ease: "easeOut"},
}

export default function GuestDataPage() {
    const navigate = useNavigate()
    const {refresh} = useDataContext()

    const [password, setPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [loginFailed, setLoginFailed] = useState(false)

    // Pull values from your new DataContext
    const authSuccess = useAuthSuccess()
    const name = useGuestName()
    const permissions = usePermissions()
    const loading = useLoading();

    const [teamQuery, setTeamQuery] = useState("");
    const [matchQuery, setMatchQuery] = useState("");
    const [teamOpen, setTeamOpen] = useState(false);
    const [matchOpen, setMatchOpen] = useState(false);

    const [teamNames, setTeamNames] = useState<Record<string, string>>({})

    const location = useLocation()
    const autoLoginTriggered = useRef(false)
    const overviewRef = useRef<HTMLElement>(null)

    useEffect(() => {
        if (autoLoginTriggered.current) return

        const params = new URLSearchParams(location.search)
        const pw = params.get("pw")

        if (!pw) return

        autoLoginTriggered.current = true

        // 1. Populate input
        setPassword(pw)

        // 2. Remove ?pw= from URL (no reload)
        params.delete("pw")
        navigate(
            {pathname: location.pathname, search: params.toString()},
            {replace: true}
        )

        // 3. Trigger login on next tick so state is applied
        queueMicrotask(() => {
            void handleLogin(
                {
                    preventDefault() {
                    }
                } as React.FormEvent,
                pw
            )
        })
    }, [location.search])

    useEffect(() => {
        fetch("/teams/team_names.json")
            .then((res) => res.json())
            .then((names: Record<string, string>) => {
                setTeamNames(names)
            })
            .catch(() => {
                setTeamNames({})
            })
    }, [])

    function stripNonAscii(s: string): string {
        return s.normalize("NFKD").replace(/[^\x20-\x7E]/g, "")
    }

    function saveToken(token: string) {
        const cleaned = stripNonAscii(token)
        const expiry = Date.now() + 60 * 60 * 1000
        localStorage.setItem("guest_pw_token", cleaned)
        localStorage.setItem("guest_pw_expiry", expiry.toString())
    }

    const [attemptedLogin, setAttemptedLogin] = useState(false)

    async function handleLogin(e: React.FormEvent, overrideToken?: string) {
        e.preventDefault()
        setLoginFailed(false)

        const token = overrideToken ?? password.trim()
        if (!token) {
            return
        }

        setAttemptedLogin(true)
        saveToken(token)
        await refresh()
    }

    // Add this useEffect to detect failed login attempts
    useEffect(() => {
        if (attemptedLogin && !loading && !authSuccess) {
            setLoginFailed(true)
            setAttemptedLogin(false)
        } else if (attemptedLogin && !loading && authSuccess) {
            setAttemptedLogin(false)
        }
    }, [attemptedLogin, loading, authSuccess])
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
                href: "/data/ranking",
                type: "ranking",
            } as PageLink);
        }

        //
        // 2. Alliance Simulator page (if allowed)
        //
        if (permissions.alliance) {
            pages.push({
                title: "Alliance Simulator",
                href: "/data/alliance-sim",
                type: "alliance",
            } as PageLink);
        }

        //
        // 3. Match pages
        //
        if (Array.isArray(permissions.match)) {
            for (const matchId of permissions.match) {
                pages.push({
                    title: matchId,
                    href: `/data/match/${matchId}`,
                    type: "match",
                });
            }
        }

        //
        // 4. Team pages
        //
        if (Array.isArray(permissions.team)) {
            for (const teamNumber of permissions.team) {
                const teamName = teamNames[String(teamNumber)] ?? "Unknown Team"

                pages.push({
                    title: `${teamNumber} - ${teamName}`,
                    href: `/data/team/${teamNumber}`,
                    type: "team",
                })
            }
        }

        return pages;
    }, [permissions, teamNames]);


    return (
        <div
            className="min-h-screen flex flex-col bg-linear-to-b from-purple-950 via-purple-900 to-purple-950 text-purple-100 overflow-x-hidden scrollbar-purple"
            aria-label="Accessible data grid scroll area"
        >
            {!authSuccess ? (
                /* ===============================
                   LOGIN / LOADING MODE
                   =============================== */
                <div className="flex flex-col min-h-svh">
                    <header className="shrink-0 flex flex-col items-center pt-10 sm:pt-16 text-center px-4">
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
                            Login
                        </h1>

                        <form
                            onSubmit={handleLogin}
                            className="mt-6 w-full max-w-sm bg-purple-900/40 backdrop-blur-sm
                           border border-purple-800 rounded-2xl p-6 shadow-xl"
                        >
                            <label className="text-sm flex items-center gap-2 text-purple-300 mb-2">
                                <KeyRound className="w-4 h-4 text-purple-400"/>
                                Guest Password
                            </label>

                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(stripNonAscii(e.target.value))}
                                    className="w-full px-4 py-2 rounded-lg bg-purple-950
                                   border border-purple-700 text-purple-100
                                   focus:outline-none focus:border-purple-400 pr-12"
                                    placeholder="Enter password"
                                />

                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    className="absolute inset-y-0 right-3 flex items-center
                                   text-purple-400 hover:text-purple-200"
                                >
                                    {showPassword
                                        ? <EyeOff className="w-5 h-5"/>
                                        : <Eye className="w-5 h-5"/>
                                    }
                                </button>
                            </div>

                            {loginFailed && (
                                <p className="text-red-400 text-sm mt-2 text-left">
                                    Invalid password
                                </p>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className={`mt-4 w-full py-2 rounded-lg font-semibold transition ${loading
                                    ? "bg-purple-700/40 cursor-not-allowed text-purple-300"
                                    : "bg-purple-700 hover:bg-purple-600 text-white"}
                                    `}
                            >
                                {loading ? "Checking access…" : "Continue"}
                            </button>
                        </form>
                    </header>
                    {/* Chevron */}
                    <button
                        onClick={() => overviewRef.current?.scrollIntoView({behavior: "smooth"})}
                        className="pb-6 animate-bounce flex justify-center mt-auto cursor-pointer"
                    >
                        <ChevronDown className="w-6 h-6 sm:w-8 sm:h-8 text-purple-400 opacity-70"/>
                    </button>
                </div>
            ) : (
                /* ===============================
                   AUTHENTICATED MODE
                   =============================== */
                <div className="flex flex-col min-h-svh">
                    {/* SECTION 1 – Hero (Welcome) */}
                    <header className="shrink-0 flex flex-col items-center pt-10 sm:pt-16 text-center px-4">
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
                            You've been granted guest access as an alliance partner.
                            This portal provides synchronized scouting data to aid strategy planning.
                        </p>
                    </header>

                    {/* SECTION 2 – Scrollable Data Grid */}
                    <main
                        className="grow flex flex-col items-center justify-start
                       max-w-6xl mx-auto px-4 sm:px-6 w-full pb-8 animate-fadeIn"
                    >
                        <div className="w-full flex items-center justify-between mb-4 border-b border-purple-700 pb-2">
                            <h2 className="text-xl sm:text-2xl font-semibold">
                                Available Data
                            </h2>
                            <button
                                onClick={async () => {
                                    localStorage.removeItem("guest_pw_token")
                                    localStorage.removeItem("guest_pw_expiry")
                                    window.location.reload()
                                }}
                                className="text-sm text-purple-400 hover:text-purple-200 transition underline"
                            >
                                Logout
                            </button>
                        </div>

                        <div
                            className="w-full flex-1 overflow-y-auto overflow-x-hidden pr-1"
                            aria-label="Accessible data grid scroll area"
                        >
                            {accessiblePages.length === 0 ? (
                                <p className="text-purple-300">
                                    No scouting pages have been made available to you.
                                </p>
                            ) : (
                                (() => {
                                    const rankingPage = accessiblePages.find(p => p.type === "ranking")
                                    const alliancePage = accessiblePages.find(p => p.type === "alliance")

                                    const teamPages = accessiblePages.filter(p => p.type === "team")
                                    const matchPages = accessiblePages.filter(p => p.type === "match")

                                    const filteredTeams = teamPages.filter(p =>
                                        p.title.toLowerCase().includes(teamQuery.toLowerCase())
                                    )

                                    const filteredMatches = matchPages.filter(p =>
                                        p.title.toLowerCase().includes(matchQuery.toLowerCase())
                                    )

                                    return (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                            {/* LEFT COLUMN */}
                                            <div className="space-y-8">
                                                {/* Ranking */}
                                                {rankingPage && (
                                                    <div>
                                                        <p className="font-semibold">Ranking</p>
                                                        <div className="border-b border-purple-800 my-2"/>
                                                        <button
                                                            onClick={() => navigate(rankingPage.href)}
                                                            className="text-purple-300 hover:text-purple-200 transition"
                                                        >
                                                            Open Ranking Overview
                                                        </button>
                                                    </div>
                                                )}

                                                {/* Team selector */}
                                                <div className="relative">
                                                    <p className="font-semibold">Team Data</p>
                                                    <div className="border-b border-purple-800 my-2"/>

                                                    <input
                                                        type="text"
                                                        value={teamQuery}
                                                        placeholder="Search team…"
                                                        onFocus={() => setTeamOpen(true)}
                                                        onChange={(e) => {
                                                            setTeamQuery(e.target.value)
                                                            setTeamOpen(true)
                                                        }}
                                                        onBlur={() => setTimeout(() => setTeamOpen(false), 100)}
                                                        className="w-full bg-purple-900/40 border border-purple-800 rounded-md
                                   px-3 py-2 text-purple-200 focus:outline-none
                                   focus:ring-1 focus:ring-purple-500"
                                                    />

                                                    {teamOpen && filteredTeams.length > 0 && (
                                                        <ul className="absolute z-10 mt-1 w-full bg-purple-950
                                       border border-purple-800 rounded-md
                                       max-h-60 overflow-y-auto scrollbar-purple">
                                                            {filteredTeams.map(p => (
                                                                <li
                                                                    key={p.href}
                                                                    onMouseDown={() => navigate(p.href)}
                                                                    className="px-3 py-2 cursor-pointer
                                               hover:bg-purple-800/50 text-purple-200"
                                                                >
                                                                    {p.title}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </div>
                                            </div>

                                            {/* RIGHT COLUMN */}
                                            <div className="space-y-8">
                                                {/* Alliance */}
                                                {alliancePage && (
                                                    <div>
                                                        <p className="font-semibold">Alliance Simulator</p>
                                                        <div className="border-b border-purple-800 my-2"/>
                                                        <button
                                                            onClick={() => navigate(alliancePage.href)}
                                                            className="text-purple-300 hover:text-purple-200 transition"
                                                        >
                                                            Open Alliance Simulator
                                                        </button>
                                                    </div>
                                                )}

                                                {/* Match selector */}
                                                <div className="relative">
                                                    <p className="font-semibold">Match Data</p>
                                                    <div className="border-b border-purple-800 my-2"/>

                                                    <input
                                                        type="text"
                                                        value={matchQuery}
                                                        placeholder="Search match…"
                                                        onFocus={() => setMatchOpen(true)}
                                                        onChange={(e) => {
                                                            setMatchQuery(e.target.value)
                                                            setMatchOpen(true)
                                                        }}
                                                        onBlur={() => setTimeout(() => setMatchOpen(false), 100)}
                                                        className="w-full bg-purple-900/40 border border-purple-800 rounded-md
                                   px-3 py-2 text-purple-200 focus:outline-none
                                   focus:ring-1 focus:ring-purple-500"
                                                    />

                                                    {matchOpen && filteredMatches.length > 0 && (
                                                        <ul className="absolute z-10 mt-1 w-full bg-purple-950
                                       border border-purple-800 rounded-md
                                       max-h-60 overflow-y-auto scrollbar-purple">
                                                            {filteredMatches.map(p => (
                                                                <li
                                                                    key={p.href}
                                                                    onMouseDown={() => navigate(p.href)}
                                                                    className="px-3 py-2 cursor-pointer
                                               hover:bg-purple-800/50 text-purple-200"
                                                                >
                                                                    {p.title}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })()
                            )}
                        </div>
                    </main>

                    {/* Chevron */}
                    <button
                        onClick={() => overviewRef.current?.scrollIntoView({behavior: "smooth"})}
                        className="pb-6 animate-bounce flex justify-center mt-auto cursor-pointer"
                    >
                        <ChevronDown className="w-6 h-6 sm:w-8 sm:h-8 text-purple-400 opacity-70"/>
                    </button>
                </div>
            )}

            {/* SECTION 3 – Overview */}
            <motion.section
                ref={overviewRef}
                {...sectionReveal}
                className="py-12 sm:py-20 text-center bg-purple-950/60 border-t border-purple-800 px-4"
            >
                <h2 className="text-2xl sm:text-3xl font-bold mb-6">A Full-Stack Scouting Platform</h2>
                <p className="max-w-3xl mx-auto text-purple-300 mb-12 text-sm sm:text-base">
                    Engineered by Team Sprocket for precision, reliability, and speed. Every data point is
                    synchronized
                    from live match input, validated, and processed in minutes for strategic analysis.
                </p>
                <motion.div
                    {...staggerContainer}
                    className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto text-purple-200"
                >
                    {[
                        {value: "15K+", label: "Data Points Logged"},
                        {value: "99.9%", label: "Website uptime"},
                        {value: "98.2%", label: "Data accuracy"},
                        {value: "100+", label: "Matches Analyzed"},
                    ].map((stat) => (
                        <motion.div key={stat.label} {...staggerItem}>
                            <p className="text-3xl sm:text-4xl font-bold">{stat.value}</p>
                            <p className="text-xs sm:text-sm">{stat.label}</p>
                        </motion.div>
                    ))}
                </motion.div>
            </motion.section>

            {/* SECTION 4 – Technical */}
            <motion.section
                {...sectionReveal}
                className="py-16 sm:py-24 text-center bg-purple-900/30 border-t border-purple-800 px-4"
            >
                <h2 className="text-2xl sm:text-3xl font-bold mb-8">Under the Hood</h2>
                <motion.div
                    {...staggerContainer}
                    className="max-w-5xl mx-auto grid md:grid-cols-3 gap-8 sm:gap-10 text-purple-200 text-sm sm:text-base"
                >
                    <motion.div {...staggerItem}>
                        <h3 className="font-semibold mb-2 text-purple-400">Frontend</h3>
                        <p>React + Tailwind website for match scouting, pit scouting, live match monitoring, and
                            interactive data presentation.</p>
                    </motion.div>
                    <motion.div {...staggerItem}>
                        <h3 className="font-semibold mb-2 text-purple-400">Backend</h3>
                        <p>FastAPI server integrated with Neon PostgreSQL database for high speed data transfer
                            and data security.</p>
                    </motion.div>
                    <motion.div {...staggerItem}>
                        <h3 className="font-semibold mb-2 text-purple-400">Analytics</h3>
                        <p>Cutting edge ensemble analytics engine incorporating various algorithms like random
                            forest, featured elo, and others to achieve ~80% theoretical baseline match
                            accuracy.</p>
                    </motion.div>
                </motion.div>
            </motion.section>

            {/* SECTION 5 – Collaboration */}
            <motion.section
                {...sectionReveal}
                className="py-16 sm:py-20 text-center bg-purple-950 border-t border-purple-800 px-4"
            >
                <h2 className="text-2xl sm:text-3xl font-bold mb-6">Partner With Us</h2>
                <p className="max-w-2xl mx-auto text-purple-300 text-sm sm:text-base">
                    Team Sprocket shares scouted data with alliance partners to enhance strategy and performance
                    across matches. Contact us if you'd like access or integration for your own team.
                </p>
            </motion.section>

            <motion.footer
                initial={{opacity: 0, y: 20}}
                whileInView={{opacity: 1, y: 0}}
                viewport={{once: true, amount: 0.1}}
                transition={{duration: 0.5, ease: "easeOut"}}
                className="text-center text-xs sm:text-sm text-purple-400 border-t border-purple-800 py-6 mt-auto shrink-0"
            >
                © 2025 Mark Wu · Licensed to Team Sprocket
            </motion.footer>

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
            `}
            </style>
        </div>
    )
}
