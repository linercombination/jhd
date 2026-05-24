# Earphone Tangling Demo

This repository contains a runnable demo for the "Earphone Tangling in a Pocket" project.

## Structure

```text
docs/       theory and engineering documents
algorithm/  simulation and analysis engine
backend/    FastAPI service
frontend/   React + Three.js + ECharts demo
data/runs/  generated run outputs
```

## Features

- Simulates a Y-shaped wired earphone cable inside a pocket-like box
- Exposes single-run and batch-summary APIs
- Visualizes trajectory playback with Three.js
- Displays metric and trend charts with ECharts
- Uses geometry-aware contact and threading thresholds so cable thickness and rigid-end sizes affect detection
- Provides a Chinese frontend UI for classroom presentation
- Provides a parameter control panel for geometry, mechanics, environment, and numerical settings
- Includes short in-page explanations of the tested metrics so students can understand the plots quickly

## Demo Workflow

1. Adjust parameters in the frontend control panel.
2. Run a single simulation to view the 3D trajectory and time-series metrics.
3. Run a batch scan on one selected parameter to generate a trend chart.
4. Compare how parameter changes affect contact count, threading events, and the tangle score.

## Frontend Panels

- `可控参数设置`: edit geometry, mechanics, environment, control, and batch-scan settings
- `三维模拟视图`: playback of the Y-shaped earphone trajectory in the pocket
- `结果摘要`: quick summary of whether threading-like events occurred
- `指标说明`: short student-friendly explanation of each plotted indicator
- `指标变化图`: time evolution of contact count, threading events, and tangle score
- `参数趋势分析`: aggregated batch trend chart for one scanned parameter

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

## Key Parameters

- `L_0`, `L_1`: trunk and branch lengths of the Y-shaped earphone
- `d_cable`: cable diameter
- `r_plug`, `r_earbud`, `r_junction`: rigid-end and junction sizes
- `k_bend`: effective bending stiffness
- `gamma`: damping strength
- `agitation_amplitude`: magnitude of pocket agitation
- `tau_a`: correlation time of the agitation
- `W`, `H`, `T`: pocket width, height, and thickness
- `num_steps`, `dt`, `sample_interval`, `seed`: numerical simulation controls

## Metrics

- `接触数 / Contact count`: how many non-bonded bead pairs are close enough to be considered a contact
- `穿线事件数 / Threading events`: how often the plug or earbuds approach the junction closely enough to signal a knot-like event
- `缠结评分 / Tangle score`: a simple combined score built from contact and threading information

## Documents

- Theory and project-planning documents are stored in [docs](</E:/openSourceProject/jhd/docs>).
- The English documents remain the authoritative versions for the theory and engineering plans.

## Notes

- The simulation is a coarse-grained engineering demo, not a production scientific package.
- The frontend reads precomputed trajectory frames from the backend.
- Batch trend plots are built from repeated runs and aggregated summaries.
- The batch trend view automatically refreshes after a successful batch run and shows an inline error if loading fails.
- The latest trend panel shows the most recently generated batch result stored by the backend.
