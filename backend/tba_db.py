import os
import json
import requests
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import Json

# Load environment variables from .env
load_dotenv()

def get_tba_match(match_key: str):
    tba_key = os.getenv("TBA_KEY")
    if not tba_key:
        raise EnvironmentError("TBA_KEY not found in environment variables or .env file")

    url = f"https://www.thebluealliance.com/api/v3/match/{match_key}"
    headers = {"X-TBA-Auth-Key": tba_key}

    response = requests.get(url, headers=headers)
    if response.status_code != 200:
        raise RuntimeError(f"Failed to fetch match {match_key}: {response.status_code} {response.text}")

    return response.json()


def cache_match_to_db(match_data: dict):
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise EnvironmentError("DATABASE_URL not found in environment variables or .env file")

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    key = match_data["key"]
    event_key = match_data["event_key"]
    comp_level = match_data["comp_level"]
    set_number = match_data.get("set_number")
    match_number = match_data.get("match_number")
    time = match_data.get("time")
    actual_time = match_data.get("actual_time")
    predicted_time = match_data.get("predicted_time")
    post_result_time = match_data.get("post_result_time")
    winning_alliance = match_data.get("winning_alliance")

    red = match_data["alliances"]["red"]
    blue = match_data["alliances"]["blue"]
    red_teams = red["team_keys"]
    blue_teams = blue["team_keys"]
    red_score = red.get("score")
    blue_score = blue.get("score")

    score_breakdown = match_data.get("score_breakdown", {}) or {}
    videos = match_data.get("videos", [])

    red_breakdown = score_breakdown.get("red", {})
    blue_breakdown = score_breakdown.get("blue", {})

    red_rp = red_breakdown.get("rp")
    blue_rp = blue_breakdown.get("rp")
    red_auto = red_breakdown.get("autoPoints")
    blue_auto = blue_breakdown.get("autoPoints")
    red_teleop = red_breakdown.get("teleopPoints")
    blue_teleop = blue_breakdown.get("teleopPoints")
    red_endgame = red_breakdown.get("endGameBargePoints")
    blue_endgame = blue_breakdown.get("endGameBargePoints")

    # ---------- Coopertition Inference ----------
    def infer_coop(breakdown: dict) -> bool:
        """Infer Coopertition from official field or fallback rule."""
        # 1. Prefer direct TBA boolean
        if "coopertitionCriteriaMet" in breakdown:
            return bool(breakdown.get("coopertitionCriteriaMet"))

        # 2. Fallback: infer from algae delivered to Processor (approximation)
        processor_algae = breakdown.get("wallAlgaeCount", 0)
        return processor_algae >= 2

    red_coop = infer_coop(red_breakdown)
    blue_coop = infer_coop(blue_breakdown)

    cur.execute("""
        INSERT INTO matches_tba (
            match_key, event_key, comp_level, set_number, match_number,
            time, actual_time, predicted_time, post_result_time,
            winning_alliance, red_teams, blue_teams, red_score, blue_score,
            red_rp, blue_rp, red_auto_points, blue_auto_points,
            red_teleop_points, blue_teleop_points,
            red_endgame_points, blue_endgame_points,
            score_breakdown, videos,
            red_coopertition_criteria, blue_coopertition_criteria,
            last_update
        )
        VALUES (
            %(match_key)s, %(event_key)s, %(comp_level)s, %(set_number)s, %(match_number)s,
            %(time)s, %(actual_time)s, %(predicted_time)s, %(post_result_time)s,
            %(winning_alliance)s, %(red_teams)s, %(blue_teams)s, %(red_score)s, %(blue_score)s,
            %(red_rp)s, %(blue_rp)s, %(red_auto)s, %(blue_auto)s,
            %(red_teleop)s, %(blue_teleop)s,
            %(red_endgame)s, %(blue_endgame)s,
            %(score_breakdown)s, %(videos)s,
            %(red_coop)s, %(blue_coop)s,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (match_key) DO UPDATE SET
            red_score = EXCLUDED.red_score,
            blue_score = EXCLUDED.blue_score,
            score_breakdown = EXCLUDED.score_breakdown,
            red_coopertition_criteria = EXCLUDED.red_coopertition_criteria,
            blue_coopertition_criteria = EXCLUDED.blue_coopertition_criteria,
            videos = EXCLUDED.videos,
            last_update = CURRENT_TIMESTAMP;
    """, {
        "match_key": key,
        "event_key": event_key,
        "comp_level": comp_level,
        "set_number": set_number,
        "match_number": match_number,
        "time": time,
        "actual_time": actual_time,
        "predicted_time": predicted_time,
        "post_result_time": post_result_time,
        "winning_alliance": winning_alliance,
        "red_teams": red_teams,
        "blue_teams": blue_teams,
        "red_score": red_score,
        "blue_score": blue_score,
        "red_rp": red_rp,
        "blue_rp": blue_rp,
        "red_auto": red_auto,
        "blue_auto": blue_auto,
        "red_teleop": red_teleop,
        "blue_teleop": blue_teleop,
        "red_endgame": red_endgame,
        "blue_endgame": blue_endgame,
        "score_breakdown": Json(score_breakdown),
        "videos": Json(videos),
        "red_coop": red_coop,
        "blue_coop": blue_coop,
    })

    conn.commit()
    cur.close()
    conn.close()



def get_event_match_keys(event_key: str, cache_to_db: bool = False):
    """Fetch all match keys for an event, optionally caching full data to DB."""
    tba_key = os.getenv("TBA_KEY")
    if not tba_key:
        raise EnvironmentError("TBA_KEY not found in environment variables or .env file")

    url = f"https://www.thebluealliance.com/api/v3/event/{event_key}/matches/keys"
    headers = {"X-TBA-Auth-Key": tba_key}

    response = requests.get(url, headers=headers)
    if response.status_code != 200:
        raise RuntimeError(f"Failed to fetch event {event_key}: {response.status_code} {response.text}")

    match_keys = response.json()
    print(f"Found {len(match_keys)} matches for event {event_key}")

    if cache_to_db:
        for key in match_keys:
            data = get_tba_match(key)
            cache_match_to_db(data)

    return match_keys


if __name__ == "__main__":
    choice = input("Fetch (1) Single Match or (2) All Matches for Event? ").strip()
    if choice == "1":
        match_key = input("Enter match key (e.g. 2025casj_qm1): ").strip()
        data = get_tba_match(match_key)
        print(json.dumps(data, indent=2))
        if input("Cache to DB? (y/n): ").lower().startswith("y"):
            cache_match_to_db(data)
    elif choice == "2":
        event_key = input("Enter event key (e.g. 2025cass): ").strip()
        cache = input("Cache to DB? (y/n): ").lower().startswith("y")
        get_event_match_keys(event_key, cache_to_db=cache)
