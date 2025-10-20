import {BrowserRouter, Routes, Route, Outlet} from "react-router-dom"
import "./index.css"

import {ThemeProvider} from "@/contexts/themeProvider.tsx"

import {HomeLayout} from "./pages/Home"
import {MatchScoutingLayout} from "./pages/MatchScouting"
import {DataLayout} from "./pages/Data"
import MatchMonitoringLayout from "./pages/MatchMonitoring"
import AdminHomeLayout from "@/pages/AdminHome.tsx"
import MatchDetailPage from "@/pages/DataMatch.tsx"
import NotFoundPage from "@/pages/NotFoundPage.tsx"
import {LargeDataWrapper} from "@/contexts/dataProvider.tsx"
import PitScoutingLayout from "@/pages/PitScoutingPage.tsx"
import SettingLayout from "@/pages/SettingsPage.tsx"

export default function App() {
    return (
        <ThemeProvider>
            <BrowserRouter>
                <div className="h-screen flex flex-col min-h-0">
                    <Routes>
                        <Route path="/" element={<HomeLayout/>}/>

                        <Route path="/scouting">
                            <Route path="match" element={<MatchScoutingLayout/>}/>
                            <Route path="pit" element={<PitScoutingLayout/>}/>
                        </Route>

                        <Route path="/admin">
                            <Route index element={<AdminHomeLayout/>}/>
                            <Route path="monitor/*" element={<MatchMonitoringLayout/>}/>
                            <Route
                                path="data"
                                element={
                                    <LargeDataWrapper>
                                        <Outlet/>
                                    </LargeDataWrapper>
                                }
                            >
                                <Route index element={<DataLayout/>}/>
                                <Route
                                    path="match/:matchType/:matchNumStr"
                                    element={<MatchDetailPage/>}
                                />
                            </Route>
                        </Route>

                        <Route path="/dev" element={<NotFoundPage code={501}/>}/>
                        <Route path="/guest" element={<NotFoundPage code={501}/>}/>
                        <Route path="/setting" element={<SettingLayout/>}/>
                        <Route path="*" element={<NotFoundPage/>}/>
                    </Routes>
                </div>
            </BrowserRouter>
        </ThemeProvider>
    )
}
