import statbotics
import asyncio
from typing import Dict, Any

sb = statbotics.Statbotics()


def get_team_epa(team: int) -> Dict[str, Any]:
    data = sb.get_team(team, fields=["all"])
    epa_fields = data.get("norm_epa", {})
    return {
        "team": team,
        "epa": epa_fields
    }


async def get_team_epa_async(team: int) -> Dict[str, Any]:
    """
    Async wrapper that runs Statbotics in a threadpool
    so it doesn't block FastAPI.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, get_team_epa, team)
