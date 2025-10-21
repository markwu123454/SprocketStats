// Subset of pages for displaying each team's data
// Can use guest perms to view

import { useParams } from "react-router-dom"

export default function TeamData() {
    const { team } = useParams<{ team: string }>()
    return (
        <div className="flex h-full items-center justify-center text-2xl font-semibold">
            Team Data — {team}
        </div>
    )
}
