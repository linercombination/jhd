from __future__ import annotations

import atexit
import logging
import shutil
import sys
import threading
from pathlib import Path
from typing import Any
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from algorithm.exceptions import SimulationCancelled
from algorithm.runner import run_batch, run_simulation
from backend.app.task_runtime import (
    TaskRecoverySpec,
    build_progress_payload,
    mark_active_tasks_on_exit,
    mark_progress_status,
    progress_path,
    read_json,
    read_progress,
    recover_stale_tasks,
    register_active_task,
    request_cancel,
    unregister_active_task,
    utc_now_iso,
    write_json,
    write_progress,
)


RUNS_DIR = ROOT / "data" / "runs"
RUNS_DIR.mkdir(parents=True, exist_ok=True)


class GeometryConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    L_0: float = Field(default=0.8, gt=0)
    L_1: float = Field(default=0.2, gt=0)
    d_cable: float = Field(default=0.0025, gt=0)
    r_plug: float = Field(default=0.007, gt=0)
    r_earbud: float = Field(default=0.0075, gt=0)
    r_junction: float = Field(default=0.0065, gt=0)
    b: float = Field(default=0.02, gt=0)


class MechanicsConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    k_bend: float = Field(default=0.2, ge=0)
    gamma: float = Field(default=1.0, gt=0)


class EnvironmentConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    W: float = Field(default=0.252, gt=0)
    H: float = Field(default=0.177, gt=0)
    T: float = Field(default=0.056, gt=0)
    agitation_amplitude: float = Field(default=0.01, ge=0)
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


def _http_read_json(path: Path) -> Any:
    try:
        return read_json(path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Missing file: {path.name}") from None


def _read_simulation_result(run_dir: Path) -> dict[str, Any] | None:
    config_path = run_dir / "config.json"
    trajectory_path = run_dir / "trajectory.json"
    metrics_path = run_dir / "metrics.json"
    summary_path = run_dir / "summary.json"
    required_paths = [config_path, trajectory_path, metrics_path, summary_path]
    if not all(path.exists() for path in required_paths):
        return None
    return {
        "config": _http_read_json(config_path),
        "trajectory": _http_read_json(trajectory_path),
        "metrics": _http_read_json(metrics_path),
        "summary": _http_read_json(summary_path),
    }


def _read_representative_run(batch_dir: Path) -> dict[str, Any] | None:
    config_path = batch_dir / "representative_config.json"
    trajectory_path = batch_dir / "representative_trajectory.json"
    metrics_path = batch_dir / "representative_metrics.json"
    summary_path = batch_dir / "representative_summary.json"
    required_paths = [config_path, trajectory_path, metrics_path, summary_path]
    if not all(path.exists() for path in required_paths):
        return None
    return {
        "config": _http_read_json(config_path),
        "trajectory": _http_read_json(trajectory_path),
        "metrics": _http_read_json(metrics_path),
        "summary": _http_read_json(summary_path),
    }


def _run_result_is_complete(run_dir: Path) -> bool:
    required_paths = [
        run_dir / "config.json",
        run_dir / "trajectory.json",
        run_dir / "metrics.json",
        run_dir / "summary.json",
    ]
    return all(path.exists() for path in required_paths)


def _clear_simulation_result_files(run_dir: Path) -> None:
    for filename in ("trajectory.json", "metrics.json", "summary.json"):
        path = run_dir / filename
        if path.exists():
            path.unlink(missing_ok=True)


def _batch_result_is_complete(batch_dir: Path) -> bool:
    required_paths = [
        batch_dir / "summary.json",
        batch_dir / "representative_config.json",
        batch_dir / "representative_trajectory.json",
        batch_dir / "representative_metrics.json",
        batch_dir / "representative_summary.json",
    ]
    return all(path.exists() for path in required_paths)


def _single_finish_details(progress: dict[str, Any]) -> dict[str, Any]:
    total_steps = progress.get("total_steps", 0)
    return {
        "run_id": progress.get("run_id", progress["task_id"]),
        "current_step": total_steps,
        "total_steps": total_steps,
    }


def _batch_finish_details(progress: dict[str, Any]) -> dict[str, Any]:
    total_jobs = progress.get("total_jobs", 0)
    return {
        "batch_id": progress.get("batch_id", progress["task_id"]),
        "completed_jobs": total_jobs,
        "total_jobs": total_jobs,
        "current_repeat": progress.get("repeats"),
    }


def _recover_stale_tasks() -> None:
    recover_stale_tasks(
        RUNS_DIR,
        [
            TaskRecoverySpec(
                prefix="run_*",
                config_filename="config.json",
                completion_checker=_run_result_is_complete,
                unfinished_error="Simulation interrupted by backend restart or shutdown.",
                finish_details_builder=_single_finish_details,
            ),
            TaskRecoverySpec(
                prefix="batch_*",
                config_filename="batch_config.json",
                completion_checker=_batch_result_is_complete,
                unfinished_error="Batch interrupted by backend restart or shutdown.",
                finish_details_builder=_batch_finish_details,
            ),
        ],
        logger,
    )


def _start_background_worker(target: Any, *args: Any) -> None:
    worker = threading.Thread(target=target, args=args, daemon=False)
    worker.start()


def _execute_simulation(
    run_id: str,
    run_dir: Path,
    config: dict[str, Any],
    started_at: str,
    cancel_event: threading.Event,
) -> None:
    total_steps = config["control"]["num_steps"]

    try:
        mark_progress_status(
            run_dir,
            status="running",
            phase="init",
            progress=0.0,
            run_id=run_id,
            current_step=0,
            total_steps=total_steps,
        )

        result = run_simulation(
            config,
            progress_callback=lambda update: mark_progress_status(
                run_dir,
                status="running",
                phase=update.get("phase"),
                progress=update.get("progress"),
                run_id=run_id,
                current_step=update.get("current_step"),
                total_steps=update.get("total_steps"),
            ),
            cancel_event=cancel_event,
        )

        if cancel_event.is_set():
            raise SimulationCancelled("Simulation cancelled.")

        mark_progress_status(
            run_dir,
            status="loading_result",
            phase="loading_result",
            progress=1.0,
            run_id=run_id,
            current_step=total_steps,
            total_steps=total_steps,
        )
        if cancel_event.is_set():
            raise SimulationCancelled("Simulation cancelled during result loading.")
        write_json(run_dir / "trajectory.json", result["trajectory"])
        if cancel_event.is_set():
            raise SimulationCancelled("Simulation cancelled during result loading.")
        write_json(run_dir / "metrics.json", result["metrics"])
        if cancel_event.is_set():
            raise SimulationCancelled("Simulation cancelled during result loading.")
        write_json(run_dir / "summary.json", result["summary"])
        if cancel_event.is_set():
            raise SimulationCancelled("Simulation cancelled during result loading.")
        mark_progress_status(
            run_dir,
            status="finished",
            phase="finished",
            progress=1.0,
            finished_at=utc_now_iso(),
            error=None,
            run_id=run_id,
            current_step=total_steps,
            total_steps=total_steps,
        )
    except SimulationCancelled as exc:
        _clear_simulation_result_files(run_dir)
        mark_progress_status(
            run_dir,
            status="cancelled",
            phase="cancelled",
            finished_at=utc_now_iso(),
            error=str(exc),
            run_id=run_id,
        )
    except Exception as exc:
        logger.exception("Simulation %s failed", run_id)
        _clear_simulation_result_files(run_dir)
        mark_progress_status(
            run_dir,
            status="failed",
            phase="failed",
            finished_at=utc_now_iso(),
            error=str(exc),
            run_id=run_id,
        )
    finally:
        unregister_active_task(run_id)


def _execute_batch(batch_id: str, batch_dir: Path, batch_config: dict[str, Any], started_at: str) -> None:
    register_active_task(
        task_id=batch_id,
        kind="batch",
        task_dir=batch_dir,
        started_at=started_at,
        completion_checker=_batch_result_is_complete,
        finish_details_builder=_batch_finish_details,
    )
    total_jobs = len(batch_config["values"]) * batch_config["repeats"]

    try:
        mark_progress_status(
            batch_dir,
            status="running",
            phase="simulate",
            progress=0.0,
            batch_id=batch_id,
            parameter=batch_config["parameter"],
            values=batch_config["values"],
            repeats=batch_config["repeats"],
            total_jobs=total_jobs,
            completed_jobs=0,
            current_value=None,
            current_repeat=None,
        )

        result = run_batch(
            batch_config,
            progress_callback=lambda update: mark_progress_status(
                batch_dir,
                status="running",
                phase="simulate",
                progress=update.get("progress"),
                batch_id=batch_id,
                parameter=batch_config["parameter"],
                values=batch_config["values"],
                repeats=batch_config["repeats"],
                total_jobs=update.get("total_jobs"),
                completed_jobs=update.get("completed_jobs"),
                current_value=update.get("current_value"),
                current_repeat=update.get("current_repeat"),
            ),
        )

        mark_progress_status(
            batch_dir,
            status="loading_result",
            phase="loading_result",
            progress=1.0,
            batch_id=batch_id,
            parameter=batch_config["parameter"],
            values=batch_config["values"],
            repeats=batch_config["repeats"],
            total_jobs=total_jobs,
            completed_jobs=total_jobs,
        )

        summary_payload = result["summary"]
        write_json(batch_dir / "summary.json", summary_payload)
        representative_run = result.get("representative_run")
        if representative_run:
            write_json(batch_dir / "representative_config.json", representative_run["config"])
            write_json(batch_dir / "representative_trajectory.json", representative_run["trajectory"])
            write_json(batch_dir / "representative_metrics.json", representative_run["metrics"])
            write_json(batch_dir / "representative_summary.json", representative_run["summary"])

        mark_progress_status(
            batch_dir,
            status="finished",
            phase="finished",
            progress=1.0,
            finished_at=utc_now_iso(),
            error=None,
            batch_id=batch_id,
            parameter=batch_config["parameter"],
            values=batch_config["values"],
            repeats=batch_config["repeats"],
            total_jobs=total_jobs,
            completed_jobs=total_jobs,
            current_repeat=batch_config["repeats"],
        )
    except Exception as exc:
        logger.exception("Batch %s failed", batch_id)
        mark_progress_status(
            batch_dir,
            status="failed",
            phase="failed",
            finished_at=utc_now_iso(),
            error=str(exc),
            batch_id=batch_id,
            parameter=batch_config["parameter"],
            values=batch_config["values"],
            repeats=batch_config["repeats"],
            total_jobs=total_jobs,
        )
    finally:
        unregister_active_task(batch_id)


_recover_stale_tasks()
atexit.register(mark_active_tasks_on_exit, logger)


@app.get("/")
def root() -> dict[str, str]:
    return {"status": "ok", "service": "earphone-tangling-demo"}


@app.get("/api/simulations")
def list_simulations() -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for entry in sorted(RUNS_DIR.glob("run_*")):
        try:
            progress = read_progress(entry)
        except Exception:
            continue
        if progress.get("status") != "finished":
            continue
        if not _run_result_is_complete(entry):
            continue
        results.append(
            {
                "run_id": entry.name,
                "config": _http_read_json(entry / "config.json"),
                "summary": _http_read_json(entry / "summary.json"),
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
        started_at = utc_now_iso()
        write_json(run_dir / "config.json", config)
        write_progress(
            run_dir,
            build_progress_payload(
                task_id=run_id,
                kind="single",
                status="queued",
                progress=0.0,
                started_at=started_at,
                phase="queued",
                run_id=run_id,
                current_step=0,
                total_steps=config["control"]["num_steps"],
            ),
        )
        cancel_event = register_active_task(
            task_id=run_id,
            kind="single",
            task_dir=run_dir,
            started_at=started_at,
            completion_checker=_run_result_is_complete,
            finish_details_builder=_single_finish_details,
        )
        _start_background_worker(_execute_simulation, run_id, run_dir, config, started_at, cancel_event)
        return {"run_id": run_id, "status": "running"}
    except Exception as exc:
        unregister_active_task(run_id)
        shutil.rmtree(run_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Simulation submission failed: {exc}") from exc


@app.get("/api/simulations/{run_id}")
def get_simulation(run_id: str) -> dict[str, Any]:
    run_dir = RUNS_DIR / run_id
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="Run not found")
    progress = _http_read_json(progress_path(run_dir))
    payload: dict[str, Any] = {"run_id": run_id, "status": progress["status"], "progress": progress}
    if _run_result_is_complete(run_dir):
        payload.update(_read_simulation_result(run_dir) or {})
    return payload


@app.get("/api/simulations/{run_id}/trajectory")
def get_trajectory(run_id: str) -> Any:
    return _http_read_json(RUNS_DIR / run_id / "trajectory.json")


@app.get("/api/simulations/{run_id}/metrics")
def get_metrics(run_id: str) -> Any:
    return _http_read_json(RUNS_DIR / run_id / "metrics.json")


@app.get("/api/simulations/{run_id}/summary")
def get_summary(run_id: str) -> Any:
    return _http_read_json(RUNS_DIR / run_id / "summary.json")


@app.get("/api/simulations/{run_id}/progress")
def get_simulation_progress(run_id: str) -> dict[str, Any]:
    run_dir = RUNS_DIR / run_id
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="Run not found")
    return _http_read_json(progress_path(run_dir))


@app.post("/api/simulations/{run_id}/cancel")
def cancel_simulation(run_id: str) -> dict[str, str]:
    run_dir = RUNS_DIR / run_id
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="Run not found")
    progress = _http_read_json(progress_path(run_dir))
    if progress.get("status") in {"finished", "failed", "cancelled"}:
        raise HTTPException(status_code=409, detail="Run is already finished")
    if not request_cancel(run_id):
        raise HTTPException(status_code=409, detail="Run is no longer cancellable")
    mark_progress_status(
        run_dir,
        status=progress["status"],
        phase=progress.get("phase"),
        error="正在中断……",
    )
    return {"run_id": run_id, "status": "cancelling"}


@app.post("/api/batches")
def create_batch(request: BatchRequest) -> dict[str, Any]:
    batch_id = f"batch_{uuid4().hex[:12]}"
    batch_dir = RUNS_DIR / batch_id
    batch_dir.mkdir(parents=True, exist_ok=True)
    try:
        config = request.model_dump()
        started_at = utc_now_iso()
        total_jobs = len(config["values"]) * config["repeats"]
        write_json(batch_dir / "batch_config.json", config)
        write_progress(
            batch_dir,
            build_progress_payload(
                task_id=batch_id,
                kind="batch",
                status="queued",
                progress=0.0,
                started_at=started_at,
                phase="queued",
                batch_id=batch_id,
                parameter=config["parameter"],
                values=config["values"],
                repeats=config["repeats"],
                total_jobs=total_jobs,
                completed_jobs=0,
                current_value=None,
                current_repeat=None,
            ),
        )
        _start_background_worker(_execute_batch, batch_id, batch_dir, config, started_at)
        return {"batch_id": batch_id, "status": "running"}
    except Exception as exc:
        shutil.rmtree(batch_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Batch submission failed: {exc}") from exc


@app.get("/api/batches/{batch_id}")
def get_batch(batch_id: str) -> dict[str, Any]:
    batch_dir = RUNS_DIR / batch_id
    if not batch_dir.exists():
        raise HTTPException(status_code=404, detail="Batch not found")
    progress = _http_read_json(progress_path(batch_dir))
    summary = _http_read_json(batch_dir / "summary.json") if (batch_dir / "summary.json").exists() else None
    return {
        "batch_id": batch_id,
        "status": progress["status"],
        "summary": summary,
        "representative_run": _read_representative_run(batch_dir),
    }


@app.get("/api/batches/{batch_id}/summary")
def get_batch_summary(batch_id: str) -> Any:
    return _http_read_json(RUNS_DIR / batch_id / "summary.json")


@app.get("/api/batches/{batch_id}/progress")
def get_batch_progress(batch_id: str) -> dict[str, Any]:
    batch_dir = RUNS_DIR / batch_id
    if not batch_dir.exists():
        raise HTTPException(status_code=404, detail="Batch not found")
    return _http_read_json(progress_path(batch_dir))


@app.get("/api/analysis/trends")
def get_trends() -> list[dict[str, Any]]:
    trends: list[dict[str, Any]] = []
    for entry in sorted(RUNS_DIR.glob("batch_*"), key=lambda path: path.stat().st_mtime):
        try:
            progress = read_progress(entry)
        except Exception:
            continue
        if progress.get("status") != "finished":
            continue
        summary_path = entry / "summary.json"
        if summary_path.exists():
            trends.append({"batch_id": entry.name, "summary": _http_read_json(summary_path)})
    return trends
