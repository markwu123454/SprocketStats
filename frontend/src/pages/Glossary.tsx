import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { HeaderFooterLayoutWrapper } from "@/components/wrappers/HeaderFooterLayoutWrapper";
import { ChevronDown, Book, AlertTriangle, Wrench, Monitor, Clock, ArrowLeft } from "lucide-react";

function Accordion({ title, icon: Icon, children }: { title: string, icon: any, children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="border rounded-xl shadow-sm overflow-hidden mb-4 theme-border theme-bg transition-colors">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 text-left focus:outline-none hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-3 font-semibold text-lg theme-text">
                    <Icon className="w-5 h-5 opacity-80" />
                    {title}
                </div>
                <ChevronDown
                    className={`w-5 h-5 theme-text transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                />
            </button>
            {isOpen && (
                <div className="p-4 border-t theme-border bg-black/5 dark:bg-white/5 space-y-4">
                    {children}
                </div>
            )}
        </div>
    );
}

function Term({ term, definition }: { term: string, definition: string | React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1">
            <span className="font-bold text-base theme-text">{term}</span>
            <span className="text-sm opacity-80 theme-text">{definition}</span>
        </div>
    );
}

export default function Glossary() {
    useEffect(() => {
        const root = document.documentElement;
        const originalClasses = Array.from(root.classList);

        // Define all possible theme classes that should be swapped
        const themeClasses = ["theme-light", "theme-dark", "theme-2025", "theme-2026", "theme-3473", "theme-968"];

        // Force Sprocket theme on the root for the page background
        root.classList.remove(...themeClasses);
        root.classList.add("theme-3473");

        return () => {
            // Restore original theme classes on unmount
            root.classList.remove("theme-3473");
            originalClasses.forEach(c => {
                if (themeClasses.includes(c)) {
                    root.classList.add(c);
                }
            });
        };
    }, []);

    return (
        <div className="theme-3473 min-h-screen">
            <HeaderFooterLayoutWrapper
                header={
                    <div className="flex items-center gap-4 text-xl theme-text w-full">
                        <Link
                            to="/"
                            className="flex items-center p-2 rounded-md theme-button-bg hover:theme-button-hover"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                        <span className="font-bold">Glossary</span>
                    </div>
                }
                body={
                    <div className="max-w-3xl mx-auto w-full space-y-6 pb-12">
                        <p className="text-sm opacity-80 theme-text mb-6">
                            Welcome to the SprocketStats Glossary! Here you can find definitions for common FRC, technical, and application-specific terms.
                        </p>

                        <Accordion title="General FRC & Competition Terms" icon={Book}>
                            <Term term="FRC (FIRST Robotics Competition)" definition="An international high school robotics competition where teams build large robots to play a themed field game." />
                            <Term term="TBA (The Blue Alliance)" definition="A popular website and data service that tracks FRC team statistics, match results, and event schedules." />
                            <Term term="Alliance" definition="A group of three teams working together in a match. There are always two alliances: Red and Blue." />
                            <Term term="Ranking Points (RP)" definition="Points earned during qualification matches that determine a team's standing in the event." />
                            <Term term="Match Type" definition="Refers to the stage of the tournament, usually Quals (Qualification) or Finals (Elimination)." />
                            <Term term="Event Key" definition="A unique code (e.g., 2026nytr) used to identify a specific competition in the database." />
                            <Term term="Scouter" definition="A person who observes and records data about robot performance to help their team make strategic decisions." />
                        </Accordion>

                        <Accordion title="Match Phases" icon={Clock}>
                            <Term term="Autonomous (Auto)" definition="The first 15 seconds of a match where robots operate solely on pre-programmed code without any human driver input." />
                            <Term term="Teleoperated (Teleop)" definition="The main part of the match (usually 2 minutes and 15 seconds) where robots are controlled by human drivers." />
                            <Term term="Endgame" definition="The final seconds of the Teleop phase, typically involving high-stakes tasks like climbing a structure." />
                            <Term term="Post-Match" definition="The period after the buzzer sounds where scouters finalize their data and submit it." />
                        </Accordion>

                        <Accordion title="Technical Robot Terms" icon={Wrench}>
                            <Term term="Drive Base" definition={
                                <ul className="list-disc pl-5 mt-1 space-y-1">
                                    <li><strong>Swerve:</strong> Advanced drive where every wheel can independently rotate 360° and move in any direction.</li>
                                    <li><strong>Tank (West Coast):</strong> A standard drive with two fixed sets of wheels on either side.</li>
                                    <li><strong>Mecanum:</strong> Specialized wheels with rollers that allow for sideways movement.</li>
                                </ul>
                            } />
                            <Term term="Cycle" definition="The time or process it takes for a robot to acquire a game piece and successfully score it." />
                            <Term term="AprilTags" definition='2D barcodes on the field that robots "see" with cameras to determine their exact position (localization).' />
                            <Term term="Brownout" definition="A temporary drop in battery voltage that can cause the robot's onboard computer or radio to reboot." />
                            <Term term="Auto-alignment" definition="Software that automatically points or positions the robot toward a target (like a scoring goal) using sensors." />
                            <Term term="Intake" definition="The mechanism used to pick up game pieces from the floor or a loading station." />
                        </Accordion>

                        <Accordion title="Application-Specific Terms" icon={Monitor}>
                            <Term term="Match Scouting" definition="Real-time data collection on a specific robot's actions during a match." />
                            <Term term="Pit Scouting" definition="Information gathered by visiting a team's workspace to learn about their robot's physical build and planned strategy." />
                            <Term term="Attendance / Check-in" definition="Tracking team members' presence at meetings, often verified via QR Codes or Geolocation." />
                            <Term term="Match Monitoring" definition="An admin view used to ensure every team in the current match is being scouted." />
                            <Term term="Alliance Simulator" definition="A tool within the app used to predict how different combinations of teams might perform together." />
                            <Term term="Offline-first" definition="The app's ability to save scouting data locally on your device if the internet is down, uploading it automatically once a connection is restored." />
                        </Accordion>

                        <Accordion title="Post-Match Faults" icon={AlertTriangle}>
                            <Term term="Disconnected" definition="Robot goes dark or loses comms entirely." />
                            <Term term="Brownout" definition="Flickering, sluggish, brief power loss behavior." />
                            <Term term="Disabled" definition="Robot stops moving but lights stay on." />
                            <Term term="Immobilized" definition="Can still function but can't drive (e.g. stuck on field element)." />
                            <Term term="Erratic Driving" definition="Spun uncontrollably, drifted, couldn't go straight." />
                            <Term term="Jam" definition="Game piece visibly stuck in/on robot." />
                            <Term term="Structural Failure" definition="A visible piece of the robot detaches." />
                            <Term term="Failed Auto" definition="Robot has an autonomous mode but it's obvious it isn't working as intended." />
                            <Term term="Other" definition="Any other fault not categorized above." />
                        </Accordion>
                    </div>
                }
            />
        </div>
    );
}