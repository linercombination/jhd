# Earphone Tangling Demo

This repository contains a runnable demo for the course project "Earphone Tangling in a Pocket".

The English documents are the authoritative versions for theory and engineering design. Chinese documents are synchronized counterparts for presentation and discussion.

## Repository Structure

```text
docs/       theory, engineering, and overview documents
algorithm/  simulation and analysis engine
backend/    FastAPI service
frontend/   React + Three.js + ECharts demo
data/runs/  generated run outputs
```

## Current Scope

- Simulates a Y-shaped wired earphone cable inside a pocket-like box
- Uses a coarse-grained force-based overdamped dynamics model
- Detects nonlocal contacts and persistent threading-proxy events
- Provides single-run playback and batch trend analysis
- Uses a Chinese frontend UI for classroom presentation

## Demo Workflow

1. Adjust geometry, mechanics, environment, and control parameters in the frontend.
2. Run a single simulation to inspect the 3D trajectory and metric time series.
3. Run a batch scan on one selected parameter.
4. Compare how parameter changes affect contact count, threading-proxy probability, and tangle score.

## Frontend Panels

- `Parameter Controls`: geometry, mechanics, environment, control, and batch-scan inputs
- `3D Viewer`: playback of the Y-shaped earphone trajectory in the pocket
- `Run Summary`: run-level summary of threading-proxy events and tangling indicators
- `Metric Guide`: short student-friendly explanation of each metric
- `Metric Time Series`: time evolution of `N_thread`, `N_contact`, and `S_tangle`
- `Trend Analysis`: aggregated batch trend chart for the most recent scan

## Core Metrics

- `Contact count`: number of nonlocal bead pairs close enough to be counted as contacts
- `Threading proxy events`: persistent loop-capture proxy events where a rigid terminal enters a local loop region
- `Contact persistence`: persistence score of repeated nonlocal contacts across sampled frames
- `Tangle score`: an engineering score combining persistent threading-proxy events, contact count, and contact persistence

## Quick Start

### Backend

```text
cd backend
python -m venv .venv
.venv\\Scripts\\python -m pip install -r requirements.txt
.venv\\Scripts\\python -m uvicorn app.main:app --reload --port 8000
```

### Frontend

```text
cd frontend
npm.cmd install
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

Frontend default URL:

- [http://localhost:5173](http://localhost:5173)

Backend default URL:

- [http://localhost:8000](http://localhost:8000)

## API

- `POST /api/simulations`
- `GET /api/simulations`
- `GET /api/simulations/{run_id}`
- `GET /api/simulations/{run_id}/trajectory`
- `GET /api/simulations/{run_id}/metrics`
- `GET /api/simulations/{run_id}/summary`
- `POST /api/batches`
- `GET /api/batches/{batch_id}`
- `GET /api/batches/{batch_id}/summary`
- `GET /api/analysis/trends`

## Documents

- Theory, engineering, and overview documents are stored in [docs](</E:/openSourceProject/jhd/docs>).
- Authoritative theory document: [earphone_tangling_project_plan_en.md](/E:/openSourceProject/jhd/docs/earphone_tangling_project_plan_en.md)
- Authoritative engineering document: [earphone_tangling_engineering_plan_en.md](/E:/openSourceProject/jhd/docs/earphone_tangling_engineering_plan_en.md)
- Chinese overview document: [project overview (Chinese)](</E:/openSourceProject/jhd/docs/耳机线打结-项目执行方案.md>)

## Notes

- This is a coarse-grained educational demo, not a production scientific simulator.
- The frontend pocket visualization is aligned with the simulated `W/H/T`.
- Threading highlights are terminal-specific rather than global.
- The current threading detector is a geometrical proxy, not a strict topological knot classifier.
