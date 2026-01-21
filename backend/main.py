import os
import re
import socket
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles

import tba_db as tba
from endpoints import (
    admin,
    attendance,
    auth,
    data,
    general,
    match_scouting,
    pit_scouting,
    push_notification,
    cron,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting up...")

    # Initialize the databases
    #await db.init_db()
    await tba.get_db_pool()

    yield

    print("Shutting down...")

app = FastAPI(lifespan=lifespan)
app.mount("/static", StaticFiles(directory=Path(__file__).parent), name="static")

with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
    s.connect(("8.8.8.8", 80))  # Connect to a public DNS server to get the local IP
    local_ip = s.getsockname()[0]

load_dotenv()

regex_patterns = []
for origin in [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]:
    if "*" in origin:
        escaped = re.escape(origin).replace(r"\*", ".*")
        regex_patterns.append(rf"^{escaped}$")
    else:
        regex_patterns.append(rf"^{re.escape(origin)}$")

combined_regex = "|".join(regex_patterns) if regex_patterns else None

app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_origin_regex=combined_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin.router)
app.include_router(attendance.router)
app.include_router(auth.router)
app.include_router(data.router)
app.include_router(general.router)
app.include_router(match_scouting.router)
app.include_router(pit_scouting.router)
app.include_router(push_notification.router)
app.include_router(cron.router)
