from __future__ import annotations

import json
import logging
import shutil
import sys
from pathlib import Path
from typing import Any
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from algorithm.runner import run_batch, run_simulation


RUNS_DIR = ROOT / "data" / "runs"
RUNS_DIR.mkdir(parents=True, exist_ok=True)


class GeometryConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    L_0: float = Field(default=0.7, gt=0)
    L_1: float = Field(default=0.3, gt=0)
    d_cable: float = Field(default=0.02, gt=0)
    r_plug: float = Field(default=0.04, gt=0)
    r_earbud: float = Field(default=0.03, gt=0)
    r_junction: float = Field(default=0.035, gt=0)
    b: float = Field(default=0.05, gt=0)


class MechanicsConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    k_bend: float = Field(default=0.2, ge=0)
    gamma: float = Field(default=1.0, gt=0)


class EnvironmentConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    W: float = Field(default=0.8, gt=0)
    H: float = Field(default=0.8, gt=0)
    T: float = Field(default=0.18, gt=0)
    agitation_amplitude: float = Field(default=0.02, ge=0)
    tau_a: float = Field(default=10.0, gt=0)


class SimulationControl(BaseModel):
    model_config = ConfigDict(extra="forbid")
    num_steps: int = Field(default=800, gt=0)
    dt: float = Field(default=0.02, gt=0)
    sample_interval: int = Field(default=10, gt=0)
    seed: int = 42


class SimulationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    geometry: GeometryConfig = Field(default_factory=GeometryConfig)
    mechanics: MechanicsConfig = Field(default_factory=MechanicsConfig)
    environment: EnvironmentConfig = Field(default_factory=EnvironmentConfig)
    control: SimulationControl = Field(default_factory=SimulationControl)


class BatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    parameter: str = "k_bend"
    values: list[float] = Field(default_factory=lambda: [0.1, 0.2, 0.4, 0.8], min_length=1)
    repeats: int = Field(default=3, gt=0)
    base_config: SimulationRequest = Field(default_factory=SimulationRequest)


app = FastAPI(title="Earphone Tangling Demo API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
logger = logging.getLogger(__name__)


def _write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _read_json(path: Path) -> Any:
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Missing file: {path.name}")
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/")
def root() -> dict[str, str]:
    return {"status": "ok", "service": "earphone-tangling-demo"}


@app.get("/api/simulations")
def list_simulations() -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for entry in sorted(RUNS_DIR.glob("run_*")):
        summary_path = entry / "summary.json"
        config_path = entry / "config.json"
        if summary_path.exists() and config_path.exists():
            results.append(
                {
                    "run_id": entry.name,
                    "config": _read_json(config_path),
                    "summary": _read_json(summary_path),
                }
            )
    return results


@app.post("/api/simulations")
def create_simulation(request: SimulationRequest) -> dict[str, str]:
    run_id = f"run_{uuid4().hex[:12]}"
    run_dir = RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    try:
        config = request.model_dump()
        _write_json(run_dir / "config.json", config)
        result = run_simulation(config)
        _write_json(run_dir / "trajectory.json", result["trajectory"])
        _write_json(run_dir / "metrics.json", result["metrics"])
        _write_json(run_dir / "summary.json", result["summary"])
        return {"run_id": run_id, "status": "finished"}
    except Exception as exc:
        logger.exception("Simulation %s failed", run_id)
        shutil.rmtree(run_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Simulation failed: {exc}") from exc


@app.get("/api/simulations/{run_id}")
def get_simulation(run_id: str) -> dict[str, Any]:
    run_dir = RUNS_DIR / run_id
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="Run not found")
    return {
        "run_id": run_id,
        "config": _read_json(run_dir / "config.json"),
        "summary": _read_json(run_dir / "summary.json"),
    }


@app.get("/api/simulations/{run_id}/trajectory")
def get_trajectory(run_id: str) -> Any:
    return _read_json(RUNS_DIR / run_id / "trajectory.json")


@app.get("/api/simulations/{run_id}/metrics")
def get_metrics(run_id: str) -> Any:
    return _read_json(RUNS_DIR / run_id / "metrics.json")


@app.get("/api/simulations/{run_id}/summary")
def get_summary(run_id: str) -> Any:
    return _read_json(RUNS_DIR / run_id / "summary.json")


@app.post("/api/batches")
def create_batch(request: BatchRequest) -> dict[str, str]:
    batch_id = f"batch_{uuid4().hex[:12]}"
    batch_dir = RUNS_DIR / batch_id
    batch_dir.mkdir(parents=True, exist_ok=True)
    try:
        config = request.model_dump()
        _write_json(batch_dir / "batch_config.json", config)
        result = run_batch(config)
        _write_json(batch_dir / "summary.json", result)
        return {"batch_id": batch_id, "status": "finished"}
    except ValueError as exc:
        shutil.rmtree(batch_dir, ignore_errors=True)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Batch %s failed", batch_id)
        shutil.rmtree(batch_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Batch failed: {exc}") from exc


@app.get("/api/batches/{batch_id}")
def get_batch(batch_id: str) -> dict[str, Any]:
    batch_dir = RUNS_DIR / batch_id
    if not batch_dir.exists():
        raise HTTPException(status_code=404, detail="Batch not found")
    return {"batch_id": batch_id, "summary": _read_json(batch_dir / "summary.json")}


@app.get("/api/batches/{batch_id}/summary")
def get_batch_summary(batch_id: str) -> Any:
    return _read_json(RUNS_DIR / batch_id / "summary.json")


@app.get("/api/analysis/trends")
def get_trends() -> list[dict[str, Any]]:
    trends: list[dict[str, Any]] = []
    for entry in sorted(RUNS_DIR.glob("batch_*")):
        summary_path = entry / "summary.json"
        if summary_path.exists():
            payload = _read_json(summary_path)
            trends.append({"batch_id": entry.name, "summary": payload})
    return trends
