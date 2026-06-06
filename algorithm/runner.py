from __future__ import annotations

from copy import deepcopy
from statistics import mean, pstdev
from typing import Any, Callable

from .dynamics import simulate_trajectory
from .exceptions import SimulationCancelled
from .events import (
    compute_contact_persistence,
    compute_frame_metrics,
    detect_contacts,
    detect_threading_candidates,
    update_persistent_threading,
)
from .geometry import build_initial_geometry


def _validate_batch_value(parameter: str, value: float) -> None:
    if parameter in {"k_bend", "agitation_amplitude"} and value < 0:
        raise ValueError(f"{parameter} must be >= 0, got {value}")
    if parameter in {"gamma", "W", "H", "T", "L_0", "L_1", "d_cable", "r_plug", "r_earbud", "r_junction", "b", "tau_a"} and value <= 0:
        raise ValueError(f"{parameter} must be > 0, got {value}")
    if parameter == "L_ratio" and not (0.0 < value < 1.0):
        raise ValueError(f"{parameter} must be between 0 and 1, got {value}")


def run_simulation(
    config: dict[str, Any],
    progress_callback: Callable[[dict[str, Any]], None] | None = None,
    cancel_event: Any = None,
) -> dict[str, Any]:
    total_steps = config["control"]["num_steps"]
    if progress_callback is not None:
        progress_callback(
            {
                "status": "running",
                "phase": "init",
                "progress": 0.02,
                "current_step": 0,
                "total_steps": total_steps,
            }
        )
    model = build_initial_geometry(config)
    if cancel_event is not None and cancel_event.is_set():
        raise SimulationCancelled("Simulation cancelled.")
    if progress_callback is not None:
        progress_callback(
            {
                "status": "running",
                "phase": "simulate",
                "progress": 0.05,
                "current_step": 0,
                "total_steps": total_steps,
            }
        )
    trajectory = simulate_trajectory(
        model,
        config,
        progress_callback=lambda update: progress_callback(
            {
                "status": "running",
                "phase": update["phase"],
                "progress": 0.05 + 0.75 * update["progress"],
                "current_step": update["current_step"],
                "total_steps": update["total_steps"],
            }
        )
        if progress_callback is not None
        else None,
        cancel_event=cancel_event,
    )

    frames: list[dict[str, Any]] = []
    metrics_series: list[dict[str, float]] = []
    frame_contacts: list[list[list[int]]] = []
    frame_threading_candidates: list[list[str]] = []

    total_frames = max(1, len(trajectory))
    for frame_index, frame in enumerate(trajectory):
        if cancel_event is not None and cancel_event.is_set():
            raise SimulationCancelled("Simulation cancelled.")
        contacts = detect_contacts(
            frame["positions"],
            model["radii"],
            model["graph_steps"],
            padding=0.5 * config["geometry"]["d_cable"],
        )
        threading_candidates = detect_threading_candidates(
            frame["positions"],
            model["indices"],
            model["radii"],
            model["arm_segments"],
            model["graph_steps"],
            config["geometry"]["d_cable"],
        )
        frame_contacts.append(contacts)
        frame_threading_candidates.append(threading_candidates)
        if progress_callback is not None:
            progress_callback(
                {
                    "status": "running",
                    "phase": "postprocess",
                    "progress": 0.82 + 0.08 * ((frame_index + 1) / total_frames),
                    "current_step": total_steps,
                    "total_steps": total_steps,
                }
            )

    persistent_threading_per_frame = update_persistent_threading(
        frame_threading_candidates,
        min_persistent_frames=2,
    )
    contact_persistence = compute_contact_persistence(
        frame_contacts,
        min_persistent_frames=2,
    )

    for frame_index, (frame, contacts, threading, persistence_value) in enumerate(zip(
        trajectory,
        frame_contacts,
        persistent_threading_per_frame,
        contact_persistence,
        strict=False,
    )):
        if cancel_event is not None and cancel_event.is_set():
            raise SimulationCancelled("Simulation cancelled.")
        metric = compute_frame_metrics(contacts, threading, persistence_value)
        metric["time"] = frame["time"]
        metrics_series.append(metric)
        frames.append(
            {
                "time": frame["time"],
                "positions": frame["positions"],
                "events": {"contacts": contacts, "threading": threading},
            }
        )
        if progress_callback is not None:
            progress_callback(
                {
                    "status": "running",
                    "phase": "postprocess",
                    "progress": 0.9 + 0.1 * ((frame_index + 1) / total_frames),
                    "current_step": total_steps,
                    "total_steps": total_steps,
                }
            )

    threading_event_ids = sorted({event_id for frame_events in persistent_threading_per_frame for event_id in frame_events})
    summary = {
        "threading_ever": any(m["N_thread"] > 0 for m in metrics_series),
        "threading_event_count": len(threading_event_ids),
        "threading_count_total": len(threading_event_ids),
        "threading_active_frame_count": sum(1 for m in metrics_series if m["N_thread"] > 0),
        "contact_count_max": max((m["N_contact"] for m in metrics_series), default=0.0),
        "contact_count_mean": mean(m["N_contact"] for m in metrics_series) if metrics_series else 0.0,
        "contact_persistence_mean": mean(contact_persistence) if contact_persistence else 0.0,
        "tangle_score_final": metrics_series[-1]["S_tangle"] if metrics_series else 0.0,
        "tangle_score_mean": mean(m["S_tangle"] for m in metrics_series) if metrics_series else 0.0,
        "bead_metadata": {
            "arm_labels": model["arm_labels"],
            "bead_types": model["bead_types"],
            "radii": model["radii"],
            "indices": model["indices"],
            "arm_segments": model["arm_segments"],
        },
    }
    if progress_callback is not None:
        progress_callback(
            {
                "status": "running",
                "phase": "postprocess",
                "progress": 1.0,
                "current_step": total_steps,
                "total_steps": total_steps,
            }
        )
    return {"trajectory": frames, "metrics": metrics_series, "summary": summary}


def run_batch(
    batch_config: dict[str, Any],
    progress_callback: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    parameter = batch_config["parameter"]
    values = batch_config["values"]
    repeats = batch_config["repeats"]
    base_config = batch_config["base_config"]
    total_jobs = len(values) * repeats
    completed_jobs = 0

    if progress_callback is not None:
        progress_callback(
            {
                "status": "running",
                "parameter": parameter,
                "values": values,
                "repeats": repeats,
                "total_jobs": total_jobs,
                "completed_jobs": completed_jobs,
                "current_value": None,
                "current_repeat": None,
                "progress": 0.0,
            }
        )

    results: list[dict[str, Any]] = []
    representative_run: dict[str, Any] | None = None
    representative_config: dict[str, Any] | None = None
    for value in values:
        _validate_batch_value(parameter, value)
        run_scores: list[float] = []
        threading_probs: list[float] = []
        for repeat in range(repeats):
            config = deepcopy(base_config)
            if parameter in config["mechanics"]:
                config["mechanics"][parameter] = value
            elif parameter in config["environment"]:
                config["environment"][parameter] = value
            elif parameter in config["geometry"]:
                config["geometry"][parameter] = value
            elif parameter == "L_ratio":
                total = config["geometry"]["L_0"] + config["geometry"]["L_1"]
                config["geometry"]["L_0"] = value * total
                config["geometry"]["L_1"] = total - config["geometry"]["L_0"]
            else:
                raise ValueError(f"Unsupported batch parameter: {parameter}")
            config["control"]["seed"] = base_config["control"]["seed"] + repeat
            result = run_simulation(config)
            run_scores.append(result["summary"]["tangle_score_mean"])
            threading_probs.append(1.0 if result["summary"]["threading_ever"] else 0.0)
            representative_run = result
            representative_config = deepcopy(config)
            completed_jobs += 1
            if progress_callback is not None:
                progress_callback(
                    {
                        "status": "running",
                        "parameter": parameter,
                        "values": values,
                        "repeats": repeats,
                        "total_jobs": total_jobs,
                        "completed_jobs": completed_jobs,
                        "current_value": value,
                        "current_repeat": repeat + 1,
                        "progress": completed_jobs / total_jobs if total_jobs else 1.0,
                    }
                )

        results.append(
            {
                "parameter": parameter,
                "value": value,
                "mean_tangle_score": mean(run_scores) if run_scores else 0.0,
                "std_tangle_score": pstdev(run_scores) if len(run_scores) > 1 else 0.0,
                "mean_threading_probability": mean(threading_probs) if threading_probs else 0.0,
                "std_threading_probability": pstdev(threading_probs) if len(threading_probs) > 1 else 0.0,
                "repeats": repeats,
            }
        )

    summary = {
        "parameter": parameter,
        "results": results,
        "repeats": repeats,
    }

    representative_payload = None
    if representative_run is not None and representative_config is not None:
        representative_payload = {
            "config": representative_config,
            "trajectory": representative_run["trajectory"],
            "metrics": representative_run["metrics"],
            "summary": representative_run["summary"],
        }

    return {
        "summary": summary,
        "representative_run": representative_payload,
    }
