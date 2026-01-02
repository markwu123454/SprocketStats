import {BrowserRouter, Routes, Route, Outlet} from "react-router-dom"
import "./index.css"

import ThemeProvider from "@/contexts/themeProvider.tsx"

import AuthWrapper from "@/components/wrappers/AuthWrapper.tsx"
import DataWrapper from "@/components/wrappers/DataWrapper.tsx";

import AdminPage from "@/pages/AdminPage.tsx"
import AllianceSimDataPage from "@/pages/data/AllianceSimDataPage.tsx"
import CandyDataPage from "@/pages/CandyDataPage.tsx"
import GuestPage from "@/pages/GuestPage.tsx"
import GuestRedirectPage from "@/pages/GuestLoginPage.tsx"
import HomePage from "@/pages/HomePage.tsx"
import DeveloperPage from "@/pages/DeveloperPage.tsx"
import MatchDataPostPage from "@/pages/data/MatchDataPostPage.tsx"
import MatchMonitorPage from "@/pages/MatchMonitorPage.tsx"
import MatchScoutingPage from "@/pages/MatchScoutingPage.tsx"
import MatchAssignmentPage from "@/pages/MatchAssignmentPage.tsx"
import NotFoundPage from "@/pages/NotFoundPage.tsx"
import PingPage from "@/pages/PingPage.tsx"
import PitScoutingPage from "@/pages/PitScoutingPage.tsx"
import RankingDataPage from "@/pages/data/RankingDataPage.tsx"
import SettingsPage from "@/pages/SettingsPage.tsx"
import TeamDataPage from "@/pages/data/TeamDataPage.tsx"
import AdminSharePage from "@/pages/AdminSharePage.tsx";
import React from "react";
import MatchDataPredPage from "@/pages/data/MatchDataPredPage.tsx";

export default function App() {
    return (
            <ThemeProvider>
                <BrowserRouter>
                    <div className="h-screen flex flex-col min-h-0">
                        <Routes>
                            <Route path="/" element={<HomePage/>}/>

                            <Route path="/ping" element={<PingPage/>}/>

                            <Route path="/candy" element={<CandyDataPage/>}/>

                            <Route path="/settings" element={<SettingsPage/>}/>

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

                            <Route path="/admin" element={<Outlet/>}>
                                <Route element={<AuthWrapper permission="admin" device="desktop"/>}>
                                    <Route index element={<AdminPage/>}/>
                                    <Route path="monitor/*" element={<MatchMonitorPage/>}/>
                                    <Route path="assignment" element={<MatchAssignmentPage/>}/>
                                    <Route path="share" element={<AdminSharePage/>}/>
                                </Route>
                            </Route>

                            <Route element={<DataWrapper/>}>
                                <Route path="data">
                                    <Route index element={<RankingDataPage/>}/>
                                    <Route path="test" element={<MatchDataPostPage/>}/>
                                    <Route path="guest" element={<GuestPage/>}/>
                                    <Route path="ranking" element={<RankingDataPage/>}/>
                                    <Route path="team/:team" element={<TeamDataPage/>}/>
                                    <Route path="match/:matchKey" element={<MatchDataPredPage/>}/>
                                    <Route path="alliance-sim" element={<AllianceSimDataPage/>}/>
                                </Route>
                                <Route path="/guest" element={<GuestRedirectPage/>}/>
                            </Route>

                            <Route path="/dev" element={
                                <AuthWrapper permission="dev" device="desktop" mode="pessimistic">
                                    <DeveloperPage/>
                                </AuthWrapper>
                            }/>

                            <Route path="*" element={<NotFoundPage/>}/>
                        </Routes>
                    </div>
                </BrowserRouter>
            </ThemeProvider>
    )
}
