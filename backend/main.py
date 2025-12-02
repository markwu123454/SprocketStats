import os
import socket
from datetime import timedelta
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles

import db
import tba_db as tba
import endpoints

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting up...")

    # Initialize the databases
    await db.init_data_db()
    await tba.get_db_pool()
    await db.init_session_db()

    yield

    print("Shutting down...")


app = FastAPI(lifespan=lifespan)
app.mount("/static", StaticFiles(directory=Path(__file__).parent), name="static")

with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
    s.connect(("8.8.8.8", 80))  # Connect to a public DNS server to get the local IP
    local_ip = s.getsockname()[0]

load_dotenv()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



app.include_router(endpoints.router)



