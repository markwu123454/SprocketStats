/* Subset of pages for displaying each team's data
Can use guest perms to view

get all data from useAPI: getProcessedData
Need to include:
team nickname(fetch using useAPI: getTeamBasicInfo), team number, team logo(in public/teams/team_icons)
Team current rp, team current ranking, team predicted rp, team predicted ranking
list of matches(past and future) with links to the match page.
rp source breakdown(pie chart)

include for 2025(future data should all be derived from data dict format):
team average l1, l2, l3, l4, barge, processor(count, and accuracy, and for auto and teleop), climb preference and success
team average score composition(pie chart)
team scores over time(line graph)
*/


import {useParams} from "react-router-dom"

export default function TeamData() {
    const {team} = useParams<{ team: string }>()
    return (
        <div className="flex h-full items-center justify-center text-2xl font-semibold bg-white">
            Team Data — {team}
        </div>
    )
}
