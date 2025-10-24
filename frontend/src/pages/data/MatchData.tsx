// Subset of pages for displaying each match's data
// Can use guest perms to view

import { useParams } from "react-router-dom"

export default function MatchData() {
    const { matchKey } = useParams<{ matchKey: string }>()
    return (
        <div className="flex h-full items-center justify-center text-2xl font-semibold bg-white">
            Match Data — {matchKey}
        </div>
    )
}
