# FRC Scouting App (SprocketStats)

[![License: Apache 2.0 + Commons Clause](https://img.shields.io/badge/License-Apache%202.0%20%2B%20Commons%20Clause-blue.svg)](https://commonsclause.com/)
![Version](https://img.shields.io/github/v/release/markwu123454/SprocketStats?sort=semver)
![Python](https://img.shields.io/badge/Python-3.11-blue)
![Node.js](https://img.shields.io/badge/Node.js-24.12-brightgreen)
![.NET](https://img.shields.io/badge/.NET-10%20LTS-purple)


SprocketStats is a cross-platform scouting system for **FIRST Robotics Competition (FRC)** teams.
It is designed for fast, reliable match and team data collection, and seamless analysis and data interpretation.

---

## Overview

This project provides a full scouting workflow:

- Match scouting
- Pit scouting
- RBAC (Role Based Access Control)
- analytics engine
- Data presentation and sharing

The system is built to persist across seasons with minimal rework, allowing teams to adapt quickly to
annual game changes.

---

## Project Status

This project is **actively maintained** and used in real competition settings.

Some areas are under active development and refactoring, particularly:
- mobile offline caching and sync logic
- mobile push notifications based on scouting assignment
- advanced analytics workflows

Public documentation may lag behind internal changes.

---

## System Overview

### Frontend
- React + Vite (TypeScript)
- Tailwind CSS
- Progressive Web App (PWA)
- Stateless client design for scalability

### Backend
- Python FastAPI server
- Async-first architecture for concurrent device connections
- TBA API integration for teams, matches, and metadata

### Analysis Tooling
- Separate desktop-oriented application for:
  - statistical analysis
  - algorithm testing
  - performance modeling

Releases for the analysis tool are available on GitHub Releases
(usage requires your own database API key).

---

## Ownership & Inquiries

SprocketStats is a privately developed project authored and maintained by **Mark Wu**.
It is licensed for use by team 3473(Team Sprocket) and is **primarily developed to support that team’s competition workflows**.

This repository is published for **reference and transparency only**.

* The codebase is **not open for independent use**
* The project is **not accepting public contributions**
* Forks, deployments, or derivative works require **explicit permission from the author**

### Contact

All inquiries regarding:

* usage or licensing
* collaboration
* adaptation for other teams
* contributions or access

must be directed to the author.

**Author:** Mark Wu (Legal: Mai Wu)
**Email:** [me@markwu.org](mailto:me@markwu.org)

---

## License

This project is licensed under  
**Apache License, Version 2.0 with Commons Clause License Condition**.