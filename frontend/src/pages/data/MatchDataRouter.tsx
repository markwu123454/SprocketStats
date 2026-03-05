import { useParams } from "react-router-dom"
import { useNextMatchID } from "@/components/wrappers/DataWrapper"
import MatchDataPostPage from "./MatchDataPostPage"
import MatchDataPredPage from "./MatchDataPredPage"

function matchOrder(key: string): number {
    const match = key.match(/^(qm|sf|f)(\d+)$/i)
    if (!match) return -1
    const [, prefix, num] = match
    const n = parseInt(num)
    switch (prefix.toLowerCase()) {
        case "qm": return n           // 1-999
        case "sf": return 1000 + n     // 1001-1013
        case "f":  return 2000 + n     // 2001-2003
        default:   return -1
    }
}

export default function MatchDataRouter() {
    const { matchKey, mode } = useParams<{ matchKey: string; mode?: string }>()
    const nextMatchID = useNextMatchID()

    if (mode === "post") return <MatchDataPostPage />
    if (mode === "pred") return <MatchDataPredPage />

    // null nextMatchID means all matches are done
    const isCompleted = nextMatchID === null
        || matchOrder(matchKey ?? "") < matchOrder(nextMatchID)

    return isCompleted ? <MatchDataPostPage /> : <MatchDataPredPage />
}