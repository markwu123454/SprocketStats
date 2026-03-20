import React, {useState, useEffect} from "react";
import {ChevronDown, Book, AlertTriangle, Wrench, Monitor, Clock, ArrowLeft} from "lucide-react";
import {Link} from "react-router-dom";

function Accordion({title, icon: Icon, children}: { title: string, icon: any, children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div
            className="border rounded-xl shadow-sm overflow-hidden mb-4 transition-all duration-300 bg-purple-800 border-purple-700 hover:border-purple-500 hover:shadow-lg hover:shadow-purple-500/10">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 text-left focus:outline-none hover:bg-white/5 transition-colors group"
            >
                <div className="flex items-center gap-3 font-semibold text-lg group-hover:translate-x-1 transition-transform">
                    <Icon className="w-5 h-5 opacity-80 group-hover:opacity-100"/>
                    {title}
                </div>
                <ChevronDown
                    className={`w-5 h-5 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                />
            </button>
            {isOpen && (
                <div className="p-4 border-t bg-black/10 space-y-4 border-purple-700">
                    {children}
                </div>
            )}
        </div>
    );
}

function Term({term, definition}: { term: string, definition: string | React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1 hover:bg-white/5 p-2 rounded-lg transition-colors">
            <span className="font-bold text-base">{term}</span>
            <span className="text-sm opacity-80">{definition}</span>
        </div>
    );
}

export default function GlossaryPage() {
    return (
        <div
            className="min-h-screen bg-linear-to-b from-purple-950 via-purple-900 to-purple-950 overflow-x-hidden scrollbar-purple text-purple-200 p-6">

            <div className=" mx-auto w-full mb-8">
                <div className="flex flex-col gap-4">
                    <Link
                        to="/guest"
                        className="inline-flex items-center gap-2 text-purple-300 hover:text-white transition-colors group w-fit"
                    >
                        <ArrowLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform"/>
                        <span className="font-semibold">Back</span>
                    </Link>
                    <h1 className="text-3xl font-bold">Glossary</h1>
                </div>
            </div>

            <div className=" mx-auto w-full space-y-6 pb-12">
                <p className="text-sm opacity-80 mb-6 bg-purple-800/30 p-4 rounded-xl border border-purple-700/50">
                    Welcome to the SprocketStats Glossary! Here you can find definitions for common FRC, technical, and
                    application-specific terms.
                </p>

                <Accordion title="General FRC & Competition Terms" icon={Book}>
                    <Term term="TBA (The Blue Alliance)"
                          definition="A website and data service that tracks FRC team statistics, match results, and event schedules."/>
                    <Term term="SB (StatBotics)"
                          definition="A website and data service that analyzes FRC team performance and provides analytics and predictions."/>
                    <Term term="Match Type"
                          definition={
                              <ul className="list-disc pl-5 mt-1 space-y-1">
                                  <li><strong>QM:</strong> Qualification match
                                  </li>
                                  <li><strong>SF:</strong> Semi-finals(playoff) match
                                  </li>
                                  <li><strong>F:</strong> Finals match
                                  </li>
                              </ul>
                          }/>
                    <Term term="Pred"
                          definition="Abreviation for prediction"/>
                    <Term term="Avg"
                          definition="Abreviation for average"/>


                </Accordion>

                <Accordion title="Match Phases" icon={Clock}>
                    <Term term="Phase 1"
                          definition="Combination of shifts 1 & 2."/>
                    <Term term="Phase 2"
                          definition="Combination of shifts 3 & 4."/>
                </Accordion>

                <Accordion title="Post-Match Faults" icon={AlertTriangle}>
                    <Term term="Disconnected" definition="Robot goes dark or loses comms entirely."/>
                    <Term term="Brownout" definition="Flickering, sluggish, brief power loss behavior."/>
                    <Term term="Disabled" definition="Robot stops moving but lights stay on."/>
                    <Term term="Immobilized"
                          definition="Can still function but can't drive (e.g. stuck on field element)."/>
                    <Term term="Erratic Driving" definition="Spun uncontrollably, drifted, couldn't go straight."/>
                    <Term term="Jam" definition="Game piece visibly stuck in/on robot."/>
                    <Term term="Structural Failure" definition="A visible piece of the robot detaches."/>
                    <Term term="Failed Auto"
                          definition="Robot has an autonomous mode but it's obvious it isn't working as intended."/>
                    <Term term="Other" definition="Any other fault not categorized above."/>
                </Accordion>
            </div>
        </div>
    );
}