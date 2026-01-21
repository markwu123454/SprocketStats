# **FRC Scouting App(SprocketStats)**
 
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

A modern, cross-platform web app for scouting **FIRST Robotics Competition (FRC)** matches.
Built for **mobile**, **tablet**, and **desktop** use — featuring real-time data syncing, visual match input, and full
TBA integration.

---

## **Key Features**

* **Progressive Web App (PWA)** — persistent and installable, runs like a native app.
* **Live Match Syncing** — real-time updates with offline caching.
* **TBA API Integration** — fetch matches, teams, and team logos.
* **Live Admin Control** — synchronize data across devices instantly.
* **Visual Scouting Interface** — optimized for touch input and fast entry.
* **Season Rollover Ready** — minimal changes required each new season.
* **Independent Analysis Tool** — separate desktop program for advanced data processing and algorithm testing.

---

## **Planned Improvements**

* Push notifications (mobile + web).
* Advanced data visualization and analytics dashboards.
* Complete admin control for:

    * Match creation and scheduling
    * Active event management
    * Scouting data deduplication
* Rewritten caching and sync logic for mobile.
* Data validation via cross-checks with official TBA data.

---

## **Architecture Overview**

### **Frontend**

* React + Vite (TypeScript)
* Tailwind CSS
* Stateless design for scalability

### **Backend**

* Python **FastAPI** server
* Lightweight and async for concurrent connections

### **Analysis**

* Independent program for data processing, performance analysis, and statistical modeling
* See [**Releases**](https://github.com/markwu123454/SprocketStats/releases)
  *(requires your own database API key)*
