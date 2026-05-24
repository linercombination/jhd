# Earphone Tangling in a Pocket: Engineering Plan (English Authoritative Version)

This English document is the authoritative engineering version for the project. The Chinese document is a faithful counterpart written from this version.

Related theory document:

- [earphone_tangling_project_plan_en.md](./earphone_tangling_project_plan_en.md)

## 1. Engineering Goal

The theory document defines what we want to study. This engineering document defines how to build a complete demo system for the course presentation.

The project should finally deliver:

- a frontend that can explain and visualize the model
- a backend that can manage simulation tasks and results
- an algorithm engine that simulates the Y-shaped earphone cable and computes tangling metrics
- a reproducible workflow from parameter input to animation, plots, and summary tables

In one sentence:

**We need a simulation-and-visualization platform for a Y-shaped earphone tangling model in a pocket environment.**

## 2. System Overview

The whole project should be organized into three main parts:

1. frontend demo application
2. backend service layer
3. algorithm and simulation engine

Recommended workflow:

1. the user selects model and environment parameters in the frontend
2. the frontend sends a simulation request to the backend
3. the backend creates a simulation task and calls the algorithm engine
4. the algorithm engine produces trajectory data, metrics, and summary outputs
5. the backend stores and serves the outputs
6. the frontend visualizes the 3D motion, tangling events, and statistical results

## 3. Frontend Plan

### 3.1 Frontend responsibilities

The frontend is not only a decorative interface. It is the main presentation tool. It should let the audience immediately understand:

- what the earphone model looks like
- what the pocket environment is
- how the cable moves
- when tangling happens
- how the metrics change when parameters change

### 3.2 Recommended frontend stack

Recommended stack:

- `React` + `TypeScript`
- `Vite` for fast setup and simple local development
- `Three.js` for 3D visualization
- `ECharts` or `Plotly` for statistical charts
- `Tailwind CSS` or simple modular CSS for layout

Why this stack:

- React is easy to demo and componentize
- TypeScript reduces interface and data-shape mistakes
- Three.js is well suited for cable animation and 3D debugging
- ECharts or Plotly is enough for heat maps, line plots, and metric time series

### 3.3 Frontend pages or panels

The frontend can be built as one single-page demo with several panels.

Recommended layout:

- `Model Overview` panel
- `Parameter Control` panel
- `3D Simulation Viewer` panel
- `Metric Dashboard` panel
- `Run History / Comparison` panel
- `Summary / Trend Analysis` panel

### 3.4 What each panel should show

`Model Overview`

- short explanation of the Y-shaped bead-chain model
- labeled diagram of `L_0`, `L_1`, `L_total`, and `L_mat`
- explanation of rigid parts: plug, earbuds, junction

`Parameter Control`

- geometry parameters
- stiffness parameters
- environment parameters
- simulation-step parameters
- start button and reset button

`3D Simulation Viewer`

- 3D earphone cable in the pocket box
- different colors for trunk arm, left arm, and right arm
- larger rigid markers for plug, earbuds, and junction
- optional playback controls: play, pause, step, speed
- optional event highlighting for loop formation and threading

`Metric Dashboard`

- line plot of `N_thread` over time
- line plot of `N_contact` over time
- line plot of `S_tangle` over time
- summary cards for final values and event counts

`Run History / Comparison`

- compare multiple parameter sets
- line plots of threading probability versus `L_0 / L_total`
- heat maps of `S_tangle` or threading probability

`Summary / Trend Analysis`

- aggregated view across many runs
- trend plots showing how one parameter affects one target metric
- comparison cards that summarize the dominant effects
- short text conclusions generated from simple rules, such as:
  - increasing `k_bend` reduces threading probability
  - increasing pocket thickness reduces contact density
  - increasing `L_0 / L_total` changes the balance between trunk-dominated and branch-dominated capture events

### 3.5 Frontend interaction requirements

The frontend should support:

- editing parameters before a run
- selecting a saved run for replay
- switching between animation view and statistics view
- switching between single-run view and multi-run summary view
- exporting images or screenshots for presentation slides

### 3.6 Frontend minimum deliverable

The first complete frontend version should at least support:

- fixed 3D pocket box
- animated Y-shaped cable trajectory playback
- one control form
- one metrics panel
- one comparison chart
- one summary page or summary panel with trend plots

### 3.7 Detailed implementation plan for the 3D simulation viewer

The 3D viewer can be implemented in a concrete and stable way with the following rendering strategy:

Scene objects:

- one transparent wireframe box for the pocket
- one polyline or tube-like geometry for the cable centerline
- three color groups for trunk, left arm, and right arm
- larger spheres or capsules for plug, earbuds, and junction
- optional marker objects for contact points and threading events

Recommended rendering approach for version 1:

- render the cable as one or more `BufferGeometry` line objects
- update only vertex positions during playback
- render rigid parts as spheres with fixed radii
- avoid expensive full geometry reconstruction at every frame

Recommended frontend playback data format:

- one trajectory file containing sampled frames
- each frame stores bead positions as an array of 3D coordinates
- one metadata object stores bead types, arm labels, and rigid-part indices

Suggested frame shape:

```text
frame = {
  time: 0.120,
  positions: [[x1, y1, z1], [x2, y2, z2], ...],
  events: {
    contacts: [[i, j], ...],
    threading: [event_id_1, event_id_2, ...]
  }
}
```

Suggested playback loop:

1. load trajectory metadata
2. create cable line objects and rigid-body meshes
3. on each animation frame, read the current sampled frame
4. overwrite cable vertex positions
5. overwrite rigid-body positions
6. update event highlights
7. render the scene

This design is simple enough for a course project and is fully compatible with precomputed simulation output.

### 3.8 Detailed implementation plan for the summary page

The summary page should not be treated as a loose collection of charts. It should answer one question:

How do parameter changes affect tangling behavior?

Version-1 chart set:

- trend plot: mean threading probability versus `L_0 / L_total`
- trend plot: mean `S_tangle` versus `k_bend`
- trend plot: mean `N_contact` versus pocket thickness
- heat map: `S_tangle` as a function of two parameters
- bar chart: compare several selected parameter sets

Version-1 text summary rules:

- if metric increases monotonically with a parameter, report an increasing trend
- if metric decreases monotonically with a parameter, report a decreasing trend
- if the slope changes sign, report a non-monotonic trend
- if uncertainty bands strongly overlap, report that the trend is weak or inconclusive

This makes the summary page explainable and reproducible.

## 4. Backend Plan

### 4.1 Backend responsibilities

The backend is responsible for:

- receiving simulation requests
- validating parameters
- launching and tracking simulation jobs
- saving outputs
- providing result data to the frontend

### 4.2 Recommended backend stack

Recommended stack:

- `Python`
- `FastAPI`
- `Pydantic` for request and response schemas
- local file storage for trajectory data and summaries

Why this stack:

- the algorithm engine will already be in Python
- FastAPI makes API design simple and explicit
- Pydantic is convenient for parameter validation

### 4.3 Backend architecture

Recommended backend modules:

- `api/`
- `services/`
- `schemas/`
- `storage/`
- `tasks/`

Suggested role of each module:

- `api/`: HTTP endpoints
- `schemas/`: request and response data models
- `services/`: orchestration logic
- `tasks/`: simulation execution and job management
- `storage/`: saving and loading outputs

### 4.4 Suggested API endpoints

Minimum API set:

- `POST /api/simulations`
- `GET /api/simulations/{run_id}`
- `GET /api/simulations/{run_id}/trajectory`
- `GET /api/simulations/{run_id}/metrics`
- `GET /api/simulations/{run_id}/summary`
- `GET /api/simulations`
- `POST /api/batches`
- `GET /api/batches/{batch_id}`
- `GET /api/batches/{batch_id}/summary`
- `GET /api/analysis/trends`

What they do:

- `POST /api/simulations`: create a new simulation run
- `GET /api/simulations/{run_id}`: get run status and metadata
- `GET /api/simulations/{run_id}/trajectory`: return trajectory frames
- `GET /api/simulations/{run_id}/metrics`: return time-series metrics
- `GET /api/simulations/{run_id}/summary`: return final statistics
- `GET /api/simulations`: list previous runs
- `POST /api/batches`: create a parameter-scan batch job
- `GET /api/batches/{batch_id}`: query batch status and metadata
- `GET /api/batches/{batch_id}/summary`: return aggregated batch results
- `GET /api/analysis/trends`: return trend-ready data for summary charts

### 4.5 Suggested request schema

Each simulation request should include:

- geometry:
  - `L_0`
  - `L_1`
  - `d_cable`
  - rigid-part radii
- mechanics:
  - `k_bend`
  - `gamma`
- environment:
  - `W`, `H`, `T`
  - agitation amplitude
  - agitation correlation time
- simulation control:
  - number of steps
  - time step
  - frame sampling interval
  - random seed

### 4.6 Output files

Recommended output artifacts for each run:

- `config.json`
- `trajectory.json` or `trajectory.npz`
- `metrics.csv`
- `summary.json`
- optional `preview.gif` or `preview.mp4`

This is enough for both debugging and presentation reuse.

For each batch scan, the backend should additionally save:

- `batch_config.json`
- `batch_summary.csv`
- `trend_data.json`
- `heatmap_data.json`
- optional `insights.txt`

### 4.7 Detailed backend execution plan

The backend should manage each simulation as a task with explicit states:

- `created`
- `queued`
- `running`
- `finished`
- `failed`

Suggested single-run execution flow:

1. receive request
2. validate request fields
3. create `run_id`
4. save `config.json`
5. mark task as `queued`
6. launch the simulation engine
7. save outputs incrementally
8. mark task as `finished` or `failed`

Suggested batch execution flow:

1. receive a batch definition
2. expand the parameter grid
3. generate repeated child runs
4. execute child runs one by one or in parallel
5. aggregate outputs after all children finish
6. export trend and heatmap data

The backend does not need a complicated distributed queue in version 1. A simple local task runner is enough.

## 5. Algorithm and Simulation Engine

### 5.1 Algorithm responsibilities

The algorithm engine is the scientific core of the project. It should:

- construct the Y-shaped earphone model
- simulate motion in the pocket
- detect tangling-related events
- compute metrics and summaries

### 5.2 Recommended algorithm stack

Recommended stack:

- `Python`
- `NumPy`
- optionally `SciPy`
- optionally `Numba` later if acceleration is needed

For the first version, plain NumPy is enough.

### 5.3 Internal algorithm modules

Recommended modules:

- `geometry.py`
- `model.py`
- `dynamics.py`
- `events.py`
- `metrics.py`
- `runner.py`
- `export.py`

Suggested responsibilities:

- `geometry.py`: build beads, bonds, and branch connectivity
- `model.py`: energy terms and force computation
- `dynamics.py`: Langevin update loop
- `events.py`: loop and threading detection
- `metrics.py`: `N_thread`, `N_contact`, `T_persist`, `S_tangle`
- `runner.py`: top-level run orchestration
- `export.py`: save outputs for frontend use

### 5.4 Data model for the earphone

The earphone can be stored using:

- `positions`: array of bead coordinates
- `bonds`: list of bead index pairs
- `bead_types`: flexible, plug, earbud, junction
- `arm_labels`: trunk, left, right
- `radii`: per-bead radii

This is a good compromise between simplicity and extensibility.

### 5.5 Simulation pipeline

One simulation run should follow this pipeline:

1. build the Y-shaped cable geometry
2. assign bead types and radii
3. place the cable in the pocket with an initial configuration
4. run overdamped Langevin updates
5. save sampled trajectory frames
6. detect loop and threading events
7. compute time-series metrics
8. export summary outputs

### 5.6 Detailed geometry construction plan

The geometry builder should convert physical lengths into bead counts.

Suggested procedure:

1. choose one discretization length `b`
2. compute:
   - `n0 = round(L_0 / b)`
   - `n1 = round(L_1 / b)`
3. build one trunk arm with `n0 + 1` beads
4. build two branch arms that share the junction bead
5. assign bead indices for:
   - plug
   - junction
   - left earbud
   - right earbud
6. assign radii and bead types

Suggested initial geometry:

- place the trunk along one axis
- place left and right arms symmetrically around the branch direction
- use a moderate initial branch angle, such as 30-60 degrees from the trunk direction

This gives a stable and easy-to-debug initial configuration.

### 5.7 Detailed dynamics implementation plan

The simulation engine should use overdamped Langevin dynamics with an Euler-Maruyama style update.

At each simulation step:

1. compute bond forces
2. compute bending forces
3. compute excluded-volume forces
4. compute wall forces
5. compute agitation forces
6. compute random-noise contribution
7. update bead positions
8. enforce any required post-step corrections

Suggested pseudo-code:

```text
for step in range(num_steps):
    F_bond = compute_bond_forces(positions)
    F_bend = compute_bend_forces(positions)
    F_excl = compute_excluded_volume_forces(positions)
    F_wall = compute_wall_forces(positions, box)
    F_agit = compute_agitation_forces(step, positions, params)
    F_rand = sample_noise(seed, step, shape=positions.shape)

    F_total = F_bond + F_bend + F_excl + F_wall + F_agit + F_rand
    positions = positions + dt * F_total / gamma

    if step % sample_interval == 0:
        save_frame(...)
```

This is enough for a first working version.

### 5.8 Detailed force model plan

Version-1 force design:

- bond force:
  - harmonic bond around equilibrium length `b`
- bending force:
  - penalty for large turning angle between consecutive segments
- excluded-volume force:
  - short-range repulsion between nonbonded beads
- wall force:
  - soft repulsion near box boundaries
- agitation force:
  - either white-noise-like kicks or low-frequency directional forcing

Recommended engineering choice for version 1:

- use soft potentials instead of hard constraints
- this is easier to implement and numerically more forgiving

### 5.9 Detailed threading and contact detection plan

Version-1 event detection should be explicit and testable.

Nonlocal contact detection:

1. iterate through bead pairs or segment pairs
2. ignore nearby contour neighbors
3. mark a contact if Euclidean distance is below a threshold

Candidate-loop detection:

1. find two distant contour locations that approach each other
2. extract the corresponding chain segment between them
3. treat that segment as a candidate loop region

Threading detection:

1. compute a local loop plane or loop bounding region
2. test whether a rigid bead or a branch segment moves across that region
3. require the event to persist for several sampled frames

Persistence logic:

- create event IDs
- track start frame, end frame, and duration
- accept only events longer than `t_min`

This design is not mathematically perfect, but it is implementable and defendable for the course project.

### 5.10 Detailed metric computation plan

The first engineering version should compute metrics at each sampled frame.

Frame-level metrics:

- `N_thread(t)`: number of active threading events
- `N_contact(t)`: number of active nonlocal contacts
- `S_tangle(t)`: weighted combination of frame-level indicators

Suggested summary metrics for one run:

- `threading_ever`: whether threading ever happened
- `threading_count_total`
- `contact_count_max`
- `contact_count_mean`
- `tangle_score_final`
- `tangle_score_mean`

Suggested batch-level aggregated metrics:

- mean and standard deviation of `threading_ever`
- mean and standard deviation of `S_tangle`
- mean and standard deviation of `contact_count_max`

These outputs are sufficient for both trend charts and final discussion.

### 5.11 Detailed animation-output plan

The simulation engine should export data in a way that is directly usable by Three.js.

Recommended exports:

- `trajectory.json` for easy debugging and direct frontend consumption
- `trajectory.npz` for faster loading if data grows large
- `summary.json` for cards and text
- `metrics.csv` for plots and analysis scripts

Recommended frame sampling strategy:

- do not save every simulation step
- save every `sample_interval` steps
- keep a separate `render_interval` if needed

This reduces file size and improves frontend playback.

For presentation export:

- optionally generate a short preview GIF or MP4
- optionally save a few representative snapshots
- save event timestamps so the frontend can jump to meaningful moments

### 5.12 Parameter scan engine

Besides single-run animation, we also need batch experiments for presentation figures.

The batch runner should support scanning:

- `L_0 / L_total`
- `k_bend`
- agitation amplitude
- pocket thickness

For each parameter set, the engine should run several repeats and export:

- mean threading probability
- mean tangling score
- standard deviation or standard error

This is the key requirement for the summary page. Without repeated batch results, the frontend can show single runs, but it cannot make reliable trend statements.

### 5.13 Feasibility assessment for the summary page

This summary-and-analysis page is feasible if we separate the problem into three layers:

Layer 1: algorithm layer

- run repeated simulations for each parameter set
- compute aggregated statistics

Layer 2: backend layer

- store aggregated outputs in a stable format
- expose them through dedicated APIs

Layer 3: frontend layer

- render trend charts, heat maps, and summary cards

Why this is feasible:

- the charts themselves are standard
- the main challenge is data preparation, not rendering
- once the batch output format is fixed, the summary page becomes straightforward

What the summary page should not do in version 1:

- it should not try to infer causal scientific conclusions with a complex AI agent
- it should not depend on real-time rerunning of many expensive jobs in the browser

What it should do in version 1:

- visualize precomputed aggregated results
- highlight monotonic trends and comparisons
- present simple rule-based textual summaries

## 6. Data Flow

The complete data flow should be:

1. frontend builds a simulation request
2. backend validates and saves the config
3. backend launches the algorithm engine
4. algorithm engine writes outputs to storage
5. backend exposes outputs through APIs
6. frontend loads trajectory and metric data for visualization

For batch analysis, the flow becomes:

1. frontend submits a batch scan definition
2. backend launches repeated runs
3. algorithm engine exports aggregated result tables
4. backend exposes trend-ready summaries
5. frontend renders the summary page

This separation is important because:

- the algorithm code remains testable
- the frontend remains independent from simulation internals
- rerunning with the same config becomes easy

## 7. Suggested Project Structure

Recommended repository structure:

```text
project/
  frontend/
    src/
      components/
      pages/
      hooks/
      services/
      types/
  backend/
    app/
      api/
      schemas/
      services/
      storage/
      tasks/
  algorithm/
    geometry.py
    model.py
    dynamics.py
    events.py
    metrics.py
    runner.py
    export.py
  data/
    runs/
  docs/
```

## 8. Milestones

Recommended milestone plan:

### Milestone 1: model and trajectory prototype

- build a fixed-parameter Y-shaped cable
- show cable motion in a pocket
- verify no obvious self-crossing bugs

### Milestone 2: event and metric prototype

- implement nonlocal contact detection
- implement simple threading candidate detection
- plot `N_thread` and `N_contact`

### Milestone 3: frontend-backend integration

- submit parameters from frontend
- return one complete run
- replay trajectory in browser

### Milestone 4: batch experiments and presentation figures

- run repeated scans
- generate heat maps and comparison plots
- prepare screenshots and short demo video

### Milestone 5: summary page

- connect frontend to aggregated batch APIs
- display trend plots and heat maps
- display summary cards and concise textual findings

## 9. Minimum Viable Demo

If time becomes tight, the minimum viable demo should still include:

- one configurable Y-shaped cable model
- one pocket box environment
- one simulation run shown as 3D animation
- one threading or tangling metric
- one parameter comparison plot
- one simple summary page based on precomputed batch results

That is already enough for a strong course demonstration.

## 10. Engineering Risks

Main engineering risks:

- event detection may be harder than the basic dynamics
- 3D visualization may become slow if trajectory files are too large
- parameter scans may take too long without batching
- frontend and algorithm data formats may drift apart
- summary conclusions may become misleading if based on too few repeats

How to reduce risk:

- start with a simple detector first
- save sampled frames rather than every step
- define JSON schemas early
- keep one shared example config for integration testing
- require repeated runs before displaying trend claims on the summary page
