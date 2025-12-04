import React from "react"
import type {MatchScoutingData} from "@/types"

export default function PostMatch({data, setData}: {
    data: MatchScoutingData,
    setData: React.Dispatch<React.SetStateAction<MatchScoutingData>>
}) {
    void data;
    void setData;

    return (
        <div className="p-4 w-full">
            <div className="text-xl font-semibold mb-4">Post-Match Screen</div>
        </div>
    )
}
