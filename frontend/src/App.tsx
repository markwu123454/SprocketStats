import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom"
import "./index.css"

import { ThemeProvider } from "@/contexts/themeProvider.tsx"
import AuthGate from "@/components/AuthGate.tsx"

import { HomeLayout } from "./pages/Home"
import { MatchScoutingLayout } from "./pages/MatchScouting"
import { DataLayout } from "./pages/Data" // optional if still used
import MatchMonitoringLayout from "./pages/MatchMonitoring"
import AdminHomeLayout from "@/pages/AdminHome.tsx"
import NotFoundPage from "@/pages/NotFoundPage.tsx"
import PitScoutingLayout from "@/pages/PitScoutingPage.tsx"
import SettingLayout from "@/pages/SettingsPage.tsx"

// --- new data pages ---
import AllianceSimData from "@/pages/data/AllianceSimData.tsx"
import MatchData from "@/pages/data/MatchData.tsx"
import RankingData from "@/pages/data/RankingData.tsx"
import TeamData from "@/pages/data/TeamData.tsx"

export default function App() {
    return (
        <ThemeProvider>
            <BrowserRouter>
                <div className="h-screen flex flex-col min-h-0">
                    <Routes>
                        <Route path="/" element={<HomeLayout />} />

                        {/* --- Scouting pages (mobile-locked, user permissions) --- */}
                        <Route
                            path="/scouting/match"
                            element={
                                <AuthGate permission="match_scouting" device="mobile">
                                    <MatchScoutingLayout />
                                </AuthGate>
                            }
                        />
                        <Route
                            path="/scouting/pit"
                            element={
                                <AuthGate permission="pit_scouting" device="mobile">
                                    <PitScoutingLayout />
                                </AuthGate>
                            }
                        />

                        {/* --- Admin pages (desktop-locked) --- */}
                        <Route
                            path="/admin"
                            element={
                                <AuthGate permission="admin" device="desktop">
                                    <Outlet />
                                </AuthGate>
                            }
                        >
                            <Route index element={<AdminHomeLayout />} />
                            <Route path="monitor/*" element={<MatchMonitoringLayout />} />

                            {/* Data pages */}
                            <Route path="data" element={<Outlet />}>
                                <Route index element={<RankingData />} />
                                <Route path="ranking" element={<RankingData />} />
                                <Route path="team/:team" element={<TeamData />} />
                                <Route path="match/:matchKey" element={<MatchData />} />
                                <Route path="alliance-sim" element={<AllianceSimData />} />
                            </Route>
                        </Route>

                        {/* --- Developer-only section --- */}
                        <Route
                            path="/dev"
                            element={
                                <AuthGate permission="dev" device="desktop">
                                    <NotFoundPage code={501} />
                                </AuthGate>
                            }
                        />

                        {/* --- Guests not yet implemented --- */}
                        <Route path="/guest" element={<NotFoundPage code={501} />} />

                        {/* --- Settings (always allowed) --- */}
                        <Route path="/setting" element={<SettingLayout />} />

                        {/* --- Catch-all --- */}
                        <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                </div>
            </BrowserRouter>
        </ThemeProvider>
    )
}
