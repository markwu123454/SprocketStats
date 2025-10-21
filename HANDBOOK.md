# Developer Handbook

This document serves as a concise guide for developers working on the FRC Scouting App — covering setup, infrastructure, and collaboration rules to ensure consistent, stable development.

---

## Table of Contents
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Infrastructure](#infrastructure)
- [Branching Rules](#branching-rules)
- [Analysis Releases](#analysis-releases)

---

## Development Setup

**Installation**
```bash
npm install
pip install -r backend/requirements.txt
````

**Run Commands**

> Do **not** run `npm run dev` or `uvicorn main:app --reload` directly — use the unified runner below.

| Mode        | Command               |
|-------------|-----------------------|
| Development | `python3 run.py dev`  |
| Production  | `python3 run.py prod` |

---

## Project Structure

```
analysis/ → Standalone data processor and ELO/ML computation
│ └── seasons/ → Year-specific scouting data and analysis configs
│ └── main.py → Entry point for analysis executable
│ └── .env → Local environment for analysis module

backend/ → FastAPI server and API logic
│ ├── db.py → Database connection and helper utilities
│ ├── endpoints.py → All HTTP route definitions
│ ├── enums.py → Shared enums for data consistency
│ ├── main.py → FastAPI app entry point
│ ├── requirements.txt → Python dependencies
│ ├── .env → Backend-specific environment variables

frontend/ → React + Vite web client
│ ├── src/ → Main source directory
│ │ ├── assets/ → Images, icons, and static frontend assets
│ │ ├── components/ → Reusable UI components
│ │ │ ├── seasons/ → Year-spesific scouting pages and types
│ │ │ ├── ui/ → Pre-built ui elements for match and pit scouting
│ │ ├── contexts/ → React contexts (e.g. telemetry, auth)
│ │ ├── db/ → Local Dexie/IndexedDB interfaces
│ │ ├── hooks/ → Reusable custom React hooks
│ │ ├── lib/ → Utility functions and constants
│ │ ├── pages/ → Top-level routed pages
│ │ ├── types/ → TypeScript interfaces and type definitions
│ ├── .env → Frontend-specific environment

run.py → Unified runner for managing frontend + backend dev/prod modes
```

**Notes:**

* All new API endpoints belong under `backend/routes/`.
* Frontend components go in `frontend/src/components/`.
* Analysis scripts and computation logic live in `analysis/`.
* Keep test or experimental scripts in a local `sandbox/` folder — do not commit.

---

## Environment Variables

Each developer must maintain a valid `.env` file at the project root.
Sync with `.env.example` when new variables are added.

| Variable                | Description                            | Used By            |
|-------------------------|----------------------------------------|--------------------|
| `DATABASE_URL`          | Neon PostgreSQL connection URL         | Backend            |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID                 | Frontend           |
| `CORS_ORIGINS`          | Allowed CORS origins (comma-separated) | Backend            |
| `TBA_KEY`               | The Blue Alliance API key              | Backend / Analysis |
| `VITE_BACKEND_URL`      | Backend URL                            | Frontend           |

**Rules:**

* Never commit `.env` or actual secret values.
* `.env.example` should mirror structure but use placeholder values.
* Each new required variable must be added to `.env.example` and documented here.

---

## Infrastructure

| Service                                                           | Purpose                        | Development                                      | Production                                                                               |
|-------------------------------------------------------------------|--------------------------------|--------------------------------------------------|------------------------------------------------------------------------------------------|
| **[Neon](https://neon.com/)**                                     | PostgreSQL serverless database | —                                                | —                                                                                        |
| **[Vercel](https://vercel.com/)**                                 | Frontend deployment (Vite)     | [http://localhost:5173/](http://localhost:5173/) | [https://sprocket-scouting-demo.vercel.app/](https://sprocket-scouting-demo.vercel.app/) |
| **[Render](https://render.com/)**                                 | Backend deployment (FastAPI)   | [http://localhost:8000/](http://localhost:8000/) | [https://sprocketscoutingdemo.onrender.com/](https://sprocketscoutingdemo.onrender.com/) |
| **[Google OAuth](https://console.cloud.google.com/auth/clients)** | User login & identity          | —                                                | —                                                                                        |

---

## Branching Rules

All work must be done on separate branches — no direct commits to `main`.

**Branch name format:**

```text
<type>/<section>/<short-description>
```

**Type options:**

* `feature` – new functionality
* `bugfix` – fixes for existing code
* `refactor` – internal restructuring
* `hotfix` – urgent production fix

**Section options:**

* `frontend` – React/Vite client (TypeScript webapp)
* `backend` – FastAPI server (Python backend)
* `analysis` – data/ELO/ML computation (standalone analysis executable)
* `fullstack` – combining backend and frontend updates
* `other` – cross-section or miscellaneous changes

**Examples:**

* `feature/frontend/scouting-ui`
* `feature/backend/match-endpoints`
* `feature/analysis/elo-ranker`
* `bugfix/frontend/theme-flicker`

**Workflow:**

1. Push your branch
2. Open a Pull Request into `main`
3. Request review and wait for approval
4. **Squash merge** after review

**Additional Rules:**

* PR titles must clearly describe the change — they become the final commit after squash.
* Only one active branch per developer at a time.

---

## Analysis Releases

The `analysis/` module is a standalone executable used for ELO, ML, and data-processing tasks.
Unlike the frontend and backend, it is **not deployed automatically** — releases are built and uploaded manually to GitHub.

### Build

```bash
cd analysis
pyinstaller --onefile main.py --name scouting-analysis --add-data "seasons;seasons" --hidden-import pandas --hidden-import numpy --hidden-import asyncpg --hidden-import ttkbootstrap --hidden-import certifi --hidden-import sklearn --hidden-import sklearn.ensemble._forest --hidden-import sklearn.tree._classes --hidden-import sklearn.utils._joblib --hidden-import joblib
```

**Output:**

```
dist/scouting-analysis
```

Before building:

1. Ensure dependencies are pinned in `analysis/requirements.txt`.
2. Update the `__version__` constant in `analysis/main.py` (format: `v<year>.<major>.<minor>` → e.g. `v25.0.0`).
3. Test the executable locally on a clean environment.


### Versioning Scheme

| Field     | Meaning                                | Example                 |
|-----------|----------------------------------------|-------------------------|
| `<year>`  | FRC season year                        | 25 = 2025 season        |
| `<major>` | Major feature update within the season | 25.1 = second release   |
| `<minor>` | Minor patch within the season          | 25.1.1 = second release |

### Publishing a Release (Manual)

1. Go to **GitHub → Releases → “Draft a new release.”**
2. Under **Tag version**, create or select tag `analysis-build`.
3. Set **Target branch** to `main`.
4. Add a **title** and **description**, e.g.:

   ```
   Analysis build v25.0.1
   - Initial 2025 season model
   - Includes new ELO normalization and clustering improvements
   ```
5. **Attach binaries** from the `dist/` folder (e.g. Windows `.exe`, optionally macOS/Linux builds).
6. Click **“Publish release.”**


### Guidelines

* Do **NOT** commit built binaries.
* Each release must include version and changelog notes.
* Keep platform builds separate if needed (`-windows`, `-macos`, `-linux`).
* Test each uploaded binary before publishing.

---
