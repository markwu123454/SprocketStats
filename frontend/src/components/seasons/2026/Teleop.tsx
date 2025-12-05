import React from "react";
import type {MatchScoutingData} from "@/types"

export default function TeleopPhase({data, setData}: {
    data: MatchScoutingData,
    setData: React.Dispatch<React.SetStateAction<MatchScoutingData>>
}) {
    void data;
    void setData;

    return (
        <div className="w-screen h-max flex flex-col p-4 select-none">
            {/* Top: fixed height */}
            <div className="text-xl font-semibold">
                teleop
            </div>

            {/* Middle: expands to fill space */}
            <div className="items-center justify-center gap-6 overflow-hidden">

            </div>
        </div>
    )
}
