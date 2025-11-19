import {BrowserRouter, Routes, Route, Outlet} from "react-router-dom"
import "./index.css"

import ThemeProvider from "@/contexts/themeProvider.tsx"

import AuthWrapper from "@/components/wrappers/AuthWrapper.tsx"
import DataWrapper from "@/components/wrappers/DataWrapper.tsx";

import HomePage from "./pages/HomePage.tsx"
import AdminPage from "@/pages/AdminPage.tsx"
import MatchMonitorPage from "./pages/MatchMonitorPage.tsx"
import MatchScoutingPage from "./pages/MatchScoutingPage.tsx"
import PitScoutingPage from "@/pages/PitScoutingPage.tsx"
import NotFoundPage from "@/pages/NotFoundPage.tsx"
import SettingsPage from "@/pages/SettingsPage.tsx"
import PingPage from "@/pages/PingPage.tsx";
import GuestPage from "@/pages/GuestPage.tsx";
import GuestRedirectPage from "@/pages/GuestRedirectPage.tsx";
import AllianceSimDataPage from "@/pages/data/AllianceSimDataPage.tsx"
import MatchDataPostPage from "@/pages/data/MatchDataPostPage.tsx"
import RankingDataPage from "@/pages/data/RankingDataPage.tsx"
import TeamDataPage from "@/pages/data/TeamDataPage.tsx"
import DeveloperPage from "@/pages/DeveloperPage.tsx";

export default function App() {
    return (
        <ThemeProvider>
            <BrowserRouter>
                <div className="h-screen flex flex-col min-h-0">
                    <Routes>
                        <Route path="/" element={<HomePage/>}/>

                        <Route path="/guest" element={<GuestRedirectPage/>}/>

                        <Route path="/ping" element={
                            <PingPage/>
                        }/>

                        {/* --- Scouting pages (mobile-locked, user permissions) --- */}
                        <Route path="/scouting/match" element={
                            <AuthWrapper permission="match_scouting" device="mobile">
                                <MatchScoutingPage/>
                            </AuthWrapper>
                        }/>
                        <Route path="/scouting/pit" element={
                            <AuthWrapper permission="pit_scouting" device="mobile">
                                <PitScoutingPage/>
                            </AuthWrapper>
                        }/>

                        {/* --- Admin pages (desktop-locked) --- */}
                        <Route path="/admin" element={<Outlet/>}>

                            <Route element={<AuthWrapper permission="admin" device="desktop"/>}>
                                <Route index element={<AdminPage/>}/>
                                <Route path="monitor/*" element={<MatchMonitorPage/>}/>
                            </Route>

                            <Route path="data" element={<DataWrapper/>}>
                                <Route index element={<RankingDataPage/>}/>
                                <Route path="guest" element={<GuestPage/>}/>
                                <Route path="ranking" element={<RankingDataPage/>}/>
                                <Route path="team/:team" element={<TeamDataPage/>}/>
                                <Route path="match/:matchKey" element={<MatchDataPostPage/>}/>
                                <Route path="alliance-sim" element={<AllianceSimDataPage/>}/>
                            </Route>
                        </Route>

                        {/* --- Developer-only section --- */}
                        <Route path="/dev" element={
                            <AuthWrapper permission="dev" device="desktop">
                                <DeveloperPage/>
                            </AuthWrapper>
                        }/>

                        {/* --- Settings (always allowed) --- */}
                        <Route path="/setting" element={<SettingsPage/>}/>

                        {/* --- Catch-all --- */}
                        <Route path="*" element={<NotFoundPage/>}/>
                    </Routes>
                </div>
            </BrowserRouter>
        </ThemeProvider>
    )
}
