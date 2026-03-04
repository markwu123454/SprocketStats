import { useParams } from "react-router-dom"
import { useMatchCompleted } from "@/components/wrappers/DataWrapper"
import MatchDataPostPage from "./MatchDataPostPage"
import MatchDataPredPage from "./MatchDataPredPage"

export default function MatchDataRouter() {
    const { matchKey } = useParams<{ matchKey: string }>()
    const completed = useMatchCompleted(matchKey ?? "")
    if (completed === null) return null
    return completed ? <MatchDataPostPage /> : <MatchDataPredPage />
}
