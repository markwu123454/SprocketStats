# FRC Scouting Demo App

A modern web app for scouting FRC matches, built for mobile, tablets, and desktops. It features real-time syncing,
interactive match input, and TBA integration.

## Features

- Using PWA for a persistent semi-native app
- Live match syncing and local caching
- TBA API integration: match/team fetching, team logos
- Live admin control and sync across devices
- Visual scouting interface
- Modular component-based architecture (React + TypeScript)
- Minimal changes required per season

### TODO:

- Push mobile notifications
- Data visualization
- Complete admin control(matches, active event, scouting data dedupe)
- Redo mobile caching and sync logic

## Architecture

### Frontend

* React + Vite(TypeScript)
* Tailwind
* Stateless

### Backend

* Python FastAPI server
* polling requests use time.time_ns()
* non-polling requests use unix timestamp in seconds
* Stateless

### analysis

* Independent program for data processing, analysis, and interpretation

