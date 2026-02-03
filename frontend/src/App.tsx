import { lazy, Suspense } from "react"
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom"
import "./index.css"
import ThemeProvider from "@/contexts/themeProvider.tsx"

import AuthWrapper from "@/components/wrappers/AuthWrapper.tsx"
import DataWrapper from "@/components/wrappers/DataWrapper.tsx"

// Lazy imports — each page becomes its own chunk
const AdminPage = lazy(() => import("@/pages/AdminPage.tsx"))
const AllianceSimDataPage = lazy(() => import("@/pages/data/AllianceSimDataPage.tsx"))
const CandyDataPage = lazy(() => import("@/pages/CandyDataPage.tsx"))
const GuestPage = lazy(() => import("@/pages/GuestPage.tsx"))
const HomePage = lazy(() => import("@/pages/HomePage.tsx"))
const DeveloperPage = lazy(() => import("@/pages/DeveloperPage.tsx"))
const MatchDataPostPage = lazy(() => import("@/pages/data/MatchDataPostPage.tsx"))
const MatchMonitorPage = lazy(() => import("@/pages/MatchMonitorPage.tsx"))
const MatchScoutingPage = lazy(() => import("@/pages/MatchScoutingPage.tsx"))
const MatchAssignmentPage = lazy(() => import("@/pages/MatchAssignmentPage.tsx"))
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage.tsx"))
const PingPage = lazy(() => import("@/pages/PingPage.tsx"))
const PitScoutingPage = lazy(() => import("@/pages/PitScoutingPage.tsx"))
const RankingDataPage = lazy(() => import("@/pages/data/RankingDataPage.tsx"))
const MorePage = lazy(() => import("@/pages/MorePage.tsx"))
const TeamDataPage = lazy(() => import("@/pages/data/TeamDataPage.tsx"))
const AdminSharePage = lazy(() => import("@/pages/AdminSharePage.tsx"))
const MatchDataPredPage = lazy(() => import("@/pages/data/MatchDataPredPage.tsx"))
const CountdownPage = lazy(() => import("@/pages/CountdownPage.tsx"))
const AttendancePage = lazy(() => import("@/pages/AttendancePage.tsx"))
const MeetingSchedulePage = lazy(() => import("@/pages/MeetingSchedulePage.tsx"))
const PrivacyPolicyPage = lazy(() => import("@/pages/PrivacyPolicyPage.tsx"))

// Shared fallback — swap this out for a spinner if you want
const PageFallback = () => (
    <div className="h-full flex items-center justify-center text-muted-foreground">
        Loading...
    </div>
)

export default function App() {
    return (
        <ThemeProvider>
            <BrowserRouter>
                <div className="h-screen flex flex-col min-h-0">
                    <Suspense fallback={<PageFallback />}>
                        <Routes>
                            <Route path="/" element={<HomePage />} />

                            <Route path="/ping" element={<PingPage />} />

                            <Route path="/more" element={<MorePage />} />

                            <Route path="/candy" element={<CandyDataPage />} />

                            <Route path="/countdown" element={<CountdownPage />} />

                            <Route path="/attendance" element={<AttendancePage />} />

                            <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />

                            <Route path="/scouting/match" element={
                                <AuthWrapper permission="match_scouting" device="mobile">
                                    <MatchScoutingPage />
                                </AuthWrapper>
                            } />

                            <Route path="/scouting/pit" element={
                                <AuthWrapper permission="pit_scouting" device="mobile">
                                    <PitScoutingPage />
                                </AuthWrapper>
                            } />

                            <Route path="/admin" element={<Outlet />}>
                                <Route element={<AuthWrapper permission="admin" device="desktop" />}>
                                    <Route index element={<AdminPage />} />
                                    <Route path="monitor/*" element={<MatchMonitorPage />} />
                                    <Route path="assignment" element={<MatchAssignmentPage />} />
                                    <Route path="share" element={<AdminSharePage />} />
                                    <Route path="schedule" element={<MeetingSchedulePage />} />
                                </Route>
                            </Route>

                            <Route element={<DataWrapper />}>
                                <Route path="data">
                                    <Route path="test" element={<MatchDataPostPage />} />
                                    <Route path="ranking" element={<RankingDataPage />} />
                                    <Route path="team/:team" element={<TeamDataPage />} />
                                    <Route path="match/:matchKey" element={<MatchDataPredPage />} />
                                    <Route path="alliance-sim" element={<AllianceSimDataPage />} />
                                </Route>
                                <Route path="guest" element={<GuestPage />} />
                            </Route>

                            <Route path="/dev" element={
                                <AuthWrapper permission="dev" device="desktop" mode="pessimistic">
                                    <DeveloperPage />
                                </AuthWrapper>
                            } />

                            <Route path="*" element={<NotFoundPage />} />
                        </Routes>
                    </Suspense>
                </div>
            </BrowserRouter>
        </ThemeProvider>
    )
}