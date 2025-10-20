import os
import asyncio
import aiohttp
import logging
import base64
from tqdm.asyncio import tqdm_asyncio

# === CONFIG ===
TBA_KEY = "ldpsOPcknI172x94QFD4r8BLMopCk9Kq23qnWaZjcIBugxULh7uHPGPlX7xOOaaT"
HEADERS = {"X-TBA-Auth-Key": TBA_KEY}
BASE_URL = "https://www.thebluealliance.com/api/v3"
OUT_DIR = "team_icons"
MAX_SIZE = 65536  # bytes
CURRENT_YEAR = 2025
CONCURRENCY = 25

os.makedirs(OUT_DIR, exist_ok=True)

# === LOGGING ===
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger("tba_fetch")

# === CORE FUNCTIONS ===

async def fetch_json(session, url):
    try:
        async with session.get(url, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=10)) as r:
            if r.status != 200:
                return None
            return await r.json()
    except Exception as e:
        log.warning(f"Fetch failed {url}: {e}")
        return None


async def get_all_teams(session):
    teams = []
    page = 0
    while True:
        log.info(f"Fetching team page {page} ...")
        data = await fetch_json(session, f"{BASE_URL}/teams/{page}")
        if not data:
            log.info("No more teams.")
            break
        teams.extend(data)
        page += 1
    log.info(f"Total teams fetched: {len(teams)}")
    return teams


async def get_team_image(session, team_key):
    """Fetch avatar or fallback image for one team."""
    media_url = f"{BASE_URL}/team/{team_key}/media/{CURRENT_YEAR}"
    media = await fetch_json(session, media_url)
    if not media:
        return None

    # Priority 1: avatar base64
    for item in media:
        if item.get("type") == "avatar":
            details = item.get("details", {})
            if "base64Image" in details:
                try:
                    img = base64.b64decode(details["base64Image"])
                    if len(img) <= MAX_SIZE:
                        return img
                    else:
                        log.info(f"Skipped {team_key} ({len(img)/1024:.1f} KB > {MAX_SIZE/1024:.1f} KB)")
                except Exception as e:
                    log.error(f"Decode error for {team_key}: {e}")
                return None

    # Priority 2: preferred imgur direct_url
    for item in media:
        if item.get("type") == "imgur" and item.get("direct_url"):
            try:
                async with session.get(item["direct_url"]) as r:
                    if r.status == 200:
                        data = await r.read()
                        if len(data) <= MAX_SIZE:
                            return data
                        else:
                            log.info(f"Skipped {team_key} imgur ({len(data)/1024:.1f} KB > {MAX_SIZE/1024:.1f} KB)")
            except Exception as e:
                log.warning(f"Imgur fetch failed {team_key}: {e}")
            break

    return None


async def process_team(sem, session, team, existing_files):
    team_key = team["key"]
    team_num = team_key[3:]
    out_path = os.path.join(OUT_DIR, f"{team_num}.png")

    if team_num in existing_files:
        # Skip immediately, no HTTP call
        return False

    async with sem:
        img = await get_team_image(session, team_key)
        if not img:
            log.info(f"{team_num} - No image found.")
            return False

        try:
            with open(out_path, "wb") as f:
                f.write(img)
            log.info(f"Saved {out_path} ({len(img)} bytes)")
            return True
        except Exception as e:
            log.error(f"Write failed {team_num}: {e}")
            return False


async def main():
    # Pre-scan output directory for already downloaded icons
    existing_files = {
        os.path.splitext(f)[0]
        for f in os.listdir(OUT_DIR)
        if f.lower().endswith(".png")
    }
    log.info(f"Found {len(existing_files)} existing icons; skipping them.")

    async with aiohttp.ClientSession() as session:
        teams = await get_all_teams(session)
        sem = asyncio.Semaphore(CONCURRENCY)
        tasks = [process_team(sem, session, t, existing_files) for t in teams]
        results = await tqdm_asyncio.gather(*tasks, desc="Downloading icons")
        saved = sum(results)
        log.info("=== SUMMARY ===")
        log.info(f"Teams processed: {len(teams)}")
        log.info(f"Already present: {len(existing_files)}")
        log.info(f"Images saved:    {saved}")
        log.info(f"Images skipped:  {len(teams) - saved - len(existing_files)}")


if __name__ == "__main__":
    asyncio.run(main())
