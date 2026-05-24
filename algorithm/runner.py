from __future__ import annotations

from copy import deepcopy
from statistics import mean, pstdev
from typing import Any

from .dynamics import simulate_trajectory
from .events import compute_frame_metrics, detect_contacts, detect_threading
from .geometry import build_initial_geometry


def _validate_batch_value(parameter: str, value: float) -> None:
    if parameter in {"k_bend", "agitation_amplitude"} and value < 0:
        raise ValueError(f"{parameter} must be >= 0, got {value}")
    if parameter in {"gamma", "W", "H", "T", "L_0", "L_1", "d_cable", "r_plug", "r_earbud", "r_junction", "b", "tau_a"} and value <= 0:
        raise ValueError(f"{parameter} must be > 0, got {value}")
    if parameter == "L_ratio" and not (0.0 < value < 1.0):
        raise ValueError(f"{parameter} must be between 0 and 1, got {value}")


def run_simulation(config: dict[str, Any]) -> dict[str, Any]:
    model = build_initial_geometry(config)
    trajectory = simulate_trajectory(model, config)

    frames: list[dict[str, Any]] = []
    metrics_series: list[dict[str, float]] = []

    for frame in trajectory:
        contacts = detect_contacts(
            frame["positions"],
            model["radii"],
            model["bond_pairs"],
            padding=0.5 * config["geometry"]["d_cable"],
        )
        threading = detect_threading(
            frame["positions"],
            model["indices"],
            model["radii"],
            config["geometry"]["d_cable"],
        )
        metric = compute_frame_metrics(contacts, threading)
        metric["time"] = frame["time"]
        metrics_series.append(metric)
        frames.append(
            {
                "time": frame["time"],
                "positions": frame["positions"],
                "events": {"contacts": contacts, "threading": threading},
            }
        )

    summary = {
        "threading_ever": any(m["N_thread"] > 0 for m in metrics_series),
        "threading_count_total": int(sum(m["N_thread"] for m in metrics_series)),
        "contact_count_max": max((m["N_contact"] for m in metrics_series), default=0.0),
        "contact_count_mean": mean(m["N_contact"] for m in metrics_series) if metrics_series else 0.0,
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
    return {"trajectory": frames, "metrics": metrics_series, "summary": summary}


def run_batch(batch_config: dict[str, Any]) -> dict[str, Any]:
    parameter = batch_config["parameter"]
    values = batch_config["values"]
    repeats = batch_config["repeats"]
    base_config = batch_config["base_config"]

    results: list[dict[str, Any]] = []
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

    return {"parameter": parameter, "results": results}
