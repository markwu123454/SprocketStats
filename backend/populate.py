import asyncio
import json
import db
import tba_db as tba
import statbot_db as statbot
import importlib
translator = importlib.import_module("seasons.2025.translator")



async def get_candy_data():
    cache_key = "candy_cache"

    # ---------------------------------------------------------
    # Step 1 – Fetch teams for the two target events
    # ---------------------------------------------------------
    events = ["2026capoh", "2026casgv", "2025caoc", "2025cafr"]

    event_team_map = {
        event: await tba.fetch(f"event/{event}/teams/keys", use_backoff=True) or []
        for event in events
    }

    # Unique numeric team list
    all_numeric = sorted(
        {int(t[3:]) for team_list in event_team_map.values() for t in team_list}
    )

    # ---------------------------------------------------------
    # Step 2 – Fetch past events for each team (parallel)
    # ---------------------------------------------------------
    past_event_tasks = {
        num: tba.fetch(f"team/frc{num}/events", use_backoff=True)
        for num in all_numeric
    }

    team_past_events = {
        num: (await future) or []
        for num, future in past_event_tasks.items()
    }

    # ---------------------------------------------------------
    # Step 3 — Determine all events (regional or district) that have points for 2022–2025
    # ---------------------------------------------------------
    VALID_YEARS = {2022, 2023, 2024, 2025}

    district_event_keys = set()

    for num, ev_list in team_past_events.items():
        for e in ev_list:
            event_key = e.get("key")
            if not event_key:
                continue

            # Extract year: "2023cass" → 2023
            try:
                year = int(event_key[:4])
            except:
                continue

            # Only seasons you want
            if year not in VALID_YEARS:
                continue

            # Include all events that later have district_points available
            district_event_keys.add(event_key)

    # ---------------------------------------------------------
    # Step 4 – Fetch district points for all selected events (regional or district)
    # ---------------------------------------------------------
    dp_tasks = {
        ev_key: tba.fetch(f"event/{ev_key}/district_points", use_backoff=True)
        for ev_key in district_event_keys
    }

    full_dp_map = {}

    for ev_key, fut in dp_tasks.items():
        raw = await fut
        if raw and isinstance(raw, dict) and raw.get("points"):
            full_dp_map[ev_key] = raw["points"]
        else:
            full_dp_map[ev_key] = {}  # no district points for this event

    # ---------------------------------------------------------
    # Step 5 – Build per-team district point results
    # ---------------------------------------------------------
    # Structure: team_dp[num][event_key] = points
    team_dp = {num: {} for num in all_numeric}

    for event_key, points in full_dp_map.items():
        for team_key, team_points in points.items():
            try:
                num = int(team_key[3:])
            except:
                continue
            if num in team_dp:
                team_dp[num][event_key] = team_points

    # ---------------------------------------------------------
    # Step 6 – Fetch awards + EPA for each team (parallel)
    # ---------------------------------------------------------
    team_tasks = {
        num: asyncio.gather(
            tba.fetch(f"team/frc{num}/awards", use_backoff=True),
            statbot.get_team_epa_async(num),
        )
        for num in all_numeric
    }

    team_data = {}

    for num, future in team_tasks.items():
        awards, epa = await future

        team_data[num] = {
            "awards": awards or [],
            "epa": epa,
            "district_points": team_dp[num],  # uses expanded DP, not only 2 events
        }

    # ---------------------------------------------------------
    # Step 7 – Build per-event output (same structure as before)
    # ---------------------------------------------------------
    per_event_output = []

    for event in events:
        team_keys = event_team_map[event]
        numeric_teams = sorted(int(t[3:]) for t in team_keys)

        per_event_output.append({
            "event": event,
            "team_count": len(numeric_teams),
            "teams": numeric_teams,
            "data": {num: team_data[num] for num in numeric_teams},
        })

    final_output = {
        "events": events,
        "by_event": per_event_output,
    }

    # ---------------------------------------------------------
    # Step 8 – Cache + return
    # ---------------------------------------------------------
    print("Uploading...")
    await db.set_misc(cache_key, json.dumps(final_output))
    print("Done.")
    return final_output

asyncio.run(get_candy_data())
