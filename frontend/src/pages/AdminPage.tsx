/**
 * This page NEEDS:
 *
 * Header
 *
 * Event name (fallback: “No event selected”)
 * Event ID
 * Back to   Home button
 *
 * KPIs (top row)
 *
 * Total matches
 * Scouted
 * Pending
 * Current match (e.g., QM 42 or SF 1-2; show “—” if none)
 *
 * Primary Navigation
 *
 * Match Monitoring → /admin/monitor
 *
 * Data Pages → /admin/data
 * By Match selector(input) → /admin/data/match
 * By Team selector(input) → /admin/data/team
 * Rankings → /admin/rankings
 * Alliance Simulator → /admin/alliance-sim
 * Scouter Assignment → /admin/assign
 *
 * Footer
 *
 * Neon URL (clickable)
 * Branch + short commit (e.g., main • a1b2c3d)
 *
 * **/

// Imports

// Global constants

export default function AdminPage() {

    // state

    // refs

    // handlers

    // effects

    return (
        <div
            className="
            min-h-screen relative text-sm
            theme-light:text-zinc-900
            theme-dark:text-white
            theme-2025:text-white
            theme-2026:text-[#3b2d00]
            theme-3473:text-white
            "
        >
            {/* --- Background --- */}
            <div
                className="
                absolute inset-0 bg-top bg-cover
                theme-light:bg-zinc-100
                theme-dark:bg-zinc-950
                theme-2025:bg-[url('/seasons/2025/expanded.png')]
                theme-2026:bg-[url('/seasons/2026/expanded.png')]
                theme-3473:bg-[radial-gradient(80%_110%_at_10%_10%,#4c2c7a,#1f0b46),linear-gradient(135deg,#140a2a,#1f0b46)]
                "
            />

            {/* --- Foreground --- */}
            <div className="relative z-10 flex flex-col min-h-screen">

                {/* Header */}
                <div
                    className={`
                    pb-8 h-10
                    theme-light:bg-[#ffffff]/75
                    theme-dark:bg-[rgba(9,9,11,0.7)]/75
                    theme-2025:bg-[rgba(11,35,79,0.7)]/75
                    theme-2026:bg-[rgba(254,247,220,0.8)]/75
                    theme-3473:bg-[rgba(76,29,149,0.75)]/75
                `}
                >
                    {/* Put header block here */}
                </div>

                {/* Content (fills remaining space) */}
                <div
                    className="
                    flex-1 space-y-8 border-y-2
                    theme-light:border-zinc-300
                    theme-dark:border-zinc-800
                    theme-2025:border-[#1b3d80]
                    theme-2026:border-[#e6ddae]
                    theme-3473:border-[#6d28d9]
                    "
                >

                    {/* Put main content blocks here */}
                </div>

                {/* Footer */}
                <div className="pt-8 h-10 theme-light:bg-[#ffffff]/75
                theme-dark:bg-[rgba(9,9,11,0.7)]/75
                theme-2025:bg-[rgba(11,35,79,0.7)]/75
                theme-2026:bg-[rgba(254,247,220,0.8)]/75
                theme-3473:bg-[rgba(76,29,149,0.75)]/75">
                    {/* Put footer block here */}
                </div>

            </div>
        </div>
    );
}
