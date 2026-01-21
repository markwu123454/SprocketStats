from fastapi import APIRouter
from starlette.responses import HTMLResponse

import db

router = APIRouter()

@router.get("/", response_class=HTMLResponse)
def root():
    return """
        <!doctype html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>API Status</title>
            <style>
                :root{
                    --bg1:#140a2a; --bg2:#1f0b46; --card:#2a124d; --ink:#ffffff;
                    --ok:#8b5cf6; /* vivid purple */
                }
                *{box-sizing:border-box}
                html,body{height:100%}
                body{
                    margin:0; color:var(--ink);
                    background: radial-gradient( 80% 110% at 10% 10%, #4c2c7a,var(--bg2) ) fixed,
                        linear-gradient(135deg, var(--bg1), var(--bg2)) fixed;
                    display:flex; align-items:center; justify-content:center;
                    font:16px/1.5 system-ui,Segoe UI,Roboto,Helvetica,Arial;
                }
                .logo{
                    position:fixed; top:16px; left:16px; width:168px; height:168px;
                }
                .logo img{ position:absolute; inset:0; width:100%; height:100%; object-fit:contain; }
                .ring{ animation: spin 14s linear infinite; transform-origin: 50% 50%; }
                @keyframes spin{ from{transform:rotate(0)} to{transform:rotate(360deg)} }

                .card{
                    background: rgba(255,255,255,0.06);
                    border: 1px solid rgba(139,92,246,0.35);
                    border-radius: 16px;
                    padding: 42px 64px;
                    text-align:center;
                    box-shadow: 0 12px 40px rgba(0,0,0,0.35), inset 0 0 60px rgba(139,92,246,0.08);
                    backdrop-filter: blur(10px);
                }
                h1{ margin:0 0 8px; font-size:28px; letter-spacing:.3px }
                .status{
                    display:inline-block; font-weight:700; font-size:14px;
                    padding:8px 14px; border-radius:999px;
                    background: var(--ok); color:#0b0420;
                    box-shadow: 0 0 0 0 rgba(139,92,246,.6);
                    animation: pulse 2.2s ease-out infinite;
                }
                @keyframes pulse{
                    0%{ box-shadow:0 0 0 0 rgba(139,92,246,.55) }
                    70%{ box-shadow:0 0 0 14px rgba(139,92,246,0) }
                    100%{ box-shadow:0 0 0 0 rgba(139,92,246,0) }
                }
                .links{ margin-top:14px; opacity:.9 }
                .links a{ color:#c4b5fd; text-decoration:none; margin:0 10px; font-size:14px }
                .links a:hover{ text-decoration:underline }
            </style>
        </head>
        <body>
            <div class="logo" aria-hidden="true">
                <img class="ring" src="/static/sprocket_logo_ring.png" alt="">
                <img class="gear" src="/static/sprocket_logo_gear.png" alt="">
            </div>

            <div class="card">
                <h1>Scouting Server is Online</h1>
                <div class="status">STATUS: OK</div>
                <div class="links">
                    <a href="/docs">Swagger UI</a>
                    <a href="/redoc">ReDoc</a>
                    <a href="#" id="pingLink" onclick="sendPing(event)">Ping</a>
                </div>
                <script>
        async function sendPing(event) {
            event.preventDefault();
            const link = document.getElementById("pingLink");
            link.textContent = "Pinging...";
            const start = performance.now();

            try {
                const res = await fetch("/ping");
                if (!res.ok) throw new Error("Ping failed");
                await res.text(); // consume body

                const ms = Math.round(performance.now() - start);
                link.textContent = `Pong! (${ms}ms)`;
            } catch (err) {
                link.textContent = "Ping failed";
            }
        }
        </script>
          </div>
        </body>
        </html>
    """


@router.get("/ping")
def ping():
    return {"ping": "pong"}


@router.get("/metadata/feature_flags")
async def get_feature_flags():
    return await db.get_feature_flags()
