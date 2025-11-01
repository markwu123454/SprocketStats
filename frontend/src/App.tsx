import {BrowserRouter, Routes, Route, Outlet} from "react-router-dom"
import "./index.css"

import {ThemeProvider} from "@/contexts/themeProvider.tsx"
import AuthGate from "@/components/AuthGate.tsx"

import {HomeLayout} from "./pages/Home"
import {MatchScoutingLayout} from "./pages/MatchScouting"
import MatchMonitoringLayout from "./pages/MatchMonitoring"
import AdminHomeLayout from "@/pages/AdminHome.tsx"
import NotFoundPage from "@/pages/NotFoundPage.tsx"
import PitScoutingLayout from "@/pages/PitScoutingPage.tsx"
import SettingLayout from "@/pages/SettingsPage.tsx"

import AllianceSimData from "@/pages/data/AllianceSimData.tsx"
import MatchDataPost from "@/pages/data/MatchDataPost.tsx"
import RankingData from "@/pages/data/RankingData.tsx"
import TeamData from "@/pages/data/TeamData.tsx"
import {DataWrapper} from "@/components/DataWrapper.tsx";
import PingMonitor from "@/pages/PingPage.tsx";
import Guest from "@/pages/Guest.tsx";
import GuestRedirect from "@/pages/GuestRedir.tsx";

export default function App() {
    return (
        <ThemeProvider>
            <BrowserRouter>
                <div className="h-screen flex flex-col min-h-0">
                    <Routes>
                        <Route path="/" element={<HomeLayout/>}/>

                        <Route path="/guest" element={<GuestRedirect/>}/>

                        <Route
                            path="/ping"
                            element={
                                <PingMonitor/>
                            }
                        />

                        {/* --- Scouting pages (mobile-locked, user permissions) --- */}
                        <Route
                            path="/scouting/match"
                            element={
                                <AuthGate permission="match_scouting" device="mobile">
                                    <MatchScoutingLayout/>
                                </AuthGate>
                            }
                        />
                        <Route
                            path="/scouting/pit"
                            element={
                                <AuthGate permission="pit_scouting" device="mobile">
                                    <PitScoutingLayout/>
                                </AuthGate>
                            }
                        />

                        {/* --- Admin pages (desktop-locked) --- */}
                        <Route path="/admin" element={<Outlet/>}>

                            <Route element={<AuthGate permission="admin" device="desktop"/>}>
                                <Route index element={<AdminHomeLayout/>}/>
                                <Route path="monitor/*" element={<MatchMonitoringLayout/>}/>
                            </Route>

                            <Route path="data" element={<DataWrapper/>}>
                                <Route index element={<RankingData/>}/>
                                <Route path="guest" element={<Guest/>}/>
                                <Route path="ranking" element={<RankingData/>}/>
                                <Route path="team/:team" element={<TeamData/>}/>
                                <Route path="match/:matchKey" element={<MatchDataPost/>}/>
                                <Route path="alliance-sim" element={<AllianceSimData/>}/>
                            </Route>
                        </Route>

                        {/* --- Developer-only section --- */}
                        <Route
                            path="/dev"
                            element={
                                <AuthGate permission="dev" device="desktop">
                                    <NotFoundPage code={501}/>
                                </AuthGate>
                            }
                        />

                        {/* --- Guests not yet implemented --- */}
                        <Route path="/guest" element={<NotFoundPage code={501}/>}/>

                        {/* --- Settings (always allowed) --- */}
                        <Route path="/setting" element={<SettingLayout/>}/>

                        {/* --- Catch-all --- */}
                        <Route path="*" element={<NotFoundPage/>}/>
                    </Routes>
                </div>
            </BrowserRouter>
        </ThemeProvider>
    )
}
