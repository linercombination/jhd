from __future__ import annotations

import math
import random
from typing import Any, Callable

from .exceptions import SimulationCancelled


def _zeros(num_points: int) -> list[list[float]]:
    return [[0.0, 0.0, 0.0] for _ in range(num_points)]


def _add_scaled(target: list[list[float]], source: list[list[float]], scale: float) -> None:
    for i in range(len(target)):
        for axis in range(3):
            target[i][axis] += scale * source[i][axis]


def _compute_bond_forces(
    positions: list[list[float]],
    bonds: list[list[int]],
    equilibrium_b: float,
    k_bend: float,
) -> list[list[float]]:
    forces = _zeros(len(positions))
    stiffness = 8.0
    for i, j in bonds:
        dx = positions[j][0] - positions[i][0]
        dy = positions[j][1] - positions[i][1]
        dz = positions[j][2] - positions[i][2]
        length = math.sqrt(dx * dx + dy * dy + dz * dz) or 1e-8
        stretch = length - equilibrium_b
        magnitude = stiffness * stretch / length
        fx = magnitude * dx
        fy = magnitude * dy
        fz = magnitude * dz
        forces[i][0] += fx
        forces[i][1] += fy
        forces[i][2] += fz
        forces[j][0] -= fx
        forces[j][1] -= fy
        forces[j][2] -= fz
    return forces


def _compute_bending_forces(
    positions: list[list[float]],
    arm_segments: dict[str, list[int]],
    k_bend: float,
) -> list[list[float]]:
    forces = _zeros(len(positions))
    stiffness = 1.5 * max(k_bend, 0.0)
    for segment_indices in arm_segments.values():
        for offset in range(1, len(segment_indices) - 1):
            prev_idx = segment_indices[offset - 1]
            curr_idx = segment_indices[offset]
            next_idx = segment_indices[offset + 1]
            midpoint = [
                0.5 * (positions[prev_idx][axis] + positions[next_idx][axis])
                for axis in range(3)
            ]
            for axis in range(3):
                delta = midpoint[axis] - positions[curr_idx][axis]
                forces[curr_idx][axis] += stiffness * delta
                shared = 0.5 * stiffness * delta
                forces[prev_idx][axis] -= shared
                forces[next_idx][axis] -= shared
    return forces


def _compute_excluded_volume_forces(
    positions: list[list[float]],
    radii: list[float],
    graph_steps: list[list[int]],
) -> list[list[float]]:
    forces = _zeros(len(positions))
    repulsion_strength = 1.4
    for i in range(len(positions)):
        for j in range(i + 1, len(positions)):
            if 0 <= graph_steps[i][j] <= 2:
                continue
            dx = positions[j][0] - positions[i][0]
            dy = positions[j][1] - positions[i][1]
            dz = positions[j][2] - positions[i][2]
            distance = math.sqrt(dx * dx + dy * dy + dz * dz) or 1e-8
            min_distance = 1.05 * (radii[i] + radii[j])
            overlap = min_distance - distance
            if overlap <= 0:
                continue
            magnitude = repulsion_strength * overlap / distance
            fx = magnitude * dx
            fy = magnitude * dy
            fz = magnitude * dz
            forces[i][0] -= fx
            forces[i][1] -= fy
            forces[i][2] -= fz
            forces[j][0] += fx
            forces[j][1] += fy
            forces[j][2] += fz
    return forces


def _compute_wall_forces(
    positions: list[list[float]],
    radii: list[float],
    env: dict[str, float],
) -> list[list[float]]:
    forces = _zeros(len(positions))
    stiffness = 18.0
    for i, p in enumerate(positions):
        radius = radii[i]
        x_min = radius
        x_max = env["W"] - radius
        y_min = -env["H"] / 2.0 + radius
        y_max = env["H"] / 2.0 - radius
        z_min = -env["T"] / 2.0 + radius
        z_max = env["T"] / 2.0 - radius

        if p[0] < x_min:
            forces[i][0] += stiffness * (x_min - p[0])
        elif p[0] > x_max:
            forces[i][0] -= stiffness * (p[0] - x_max)

        if p[1] < y_min:
            forces[i][1] += stiffness * (y_min - p[1])
        elif p[1] > y_max:
            forces[i][1] -= stiffness * (p[1] - y_max)

        if p[2] < z_min:
            forces[i][2] += stiffness * (z_min - p[2])
        elif p[2] > z_max:
            forces[i][2] -= stiffness * (p[2] - z_max)
    return forces


def _compute_agitation_forces(
    positions: list[list[float]],
    env: dict[str, float],
    gamma: float,
    k_bend: float,
    dt: float,
    t: float,
    correlated_push: list[float],
) -> tuple[list[list[float]], list[float]]:
    forces = _zeros(len(positions))
    amplitude = env["agitation_amplitude"]
    tau_a = max(env["tau_a"], 1e-6)
    memory = max(0.0, min(0.999, math.exp(-dt / tau_a)))
    updated_push = [
        memory * correlated_push[0] + (1.0 - memory) * (random.random() - 0.5) * amplitude * 18.0 / gamma,
        memory * correlated_push[1] + (1.0 - memory) * (random.random() - 0.5) * amplitude * 18.0 / gamma,
        memory * correlated_push[2] + (1.0 - memory) * (random.random() - 0.5) * amplitude * 6.0 / gamma,
    ]
    wave_scale = (0.25 * amplitude / gamma) * max(0.35, 1.1 - 0.45 * k_bend)

    for i in range(len(positions)):
        wave = wave_scale * math.sin(0.8 * t + i * 0.13)
        forces[i][0] += updated_push[0]
        forces[i][1] += updated_push[1] + wave
        forces[i][2] += updated_push[2]

    return forces, updated_push


def _compute_random_forces(num_points: int, env: dict[str, float], gamma: float) -> list[list[float]]:
    forces = _zeros(num_points)
    amplitude = env["agitation_amplitude"]
    scale = amplitude * 10.0 / gamma
    for i in range(num_points):
        forces[i][0] = (random.random() - 0.5) * scale
        forces[i][1] = (random.random() - 0.5) * scale
        forces[i][2] = (random.random() - 0.5) * scale * 0.35
    return forces


def simulate_trajectory(
    model: dict[str, Any],
    config: dict[str, Any],
    progress_callback: Callable[[dict[str, Any]], None] | None = None,
    cancel_event: Any = None,
) -> list[dict[str, Any]]:
    control = config["control"]
    env = config["environment"]
    mechanics = config["mechanics"]
    random.seed(control["seed"])

    positions = [list(p) for p in model["positions"]]
    frames: list[dict[str, Any]] = []
    gamma = max(mechanics["gamma"], 1e-6)
    k_bend = mechanics["k_bend"]
    correlated_push = [0.0, 0.0, 0.0]

    total_steps = control["num_steps"]
    progress_interval = max(1, min(control["sample_interval"], max(1, total_steps // 50)))

    for step in range(total_steps + 1):
        if cancel_event is not None and cancel_event.is_set():
            raise SimulationCancelled("Simulation cancelled.")
        t = step * control["dt"]
        total_forces = _zeros(len(positions))
        bond_forces = _compute_bond_forces(positions, model["bonds"], model["equilibrium_b"], k_bend)
        bend_forces = _compute_bending_forces(positions, model["arm_segments"], k_bend)
        excl_forces = _compute_excluded_volume_forces(positions, model["radii"], model["graph_steps"])
        wall_forces = _compute_wall_forces(positions, model["radii"], env)
        agitation_forces, correlated_push = _compute_agitation_forces(
            positions,
            env,
            gamma,
            k_bend,
            control["dt"],
            t,
            correlated_push,
        )
        random_forces = _compute_random_forces(len(positions), env, gamma)

        _add_scaled(total_forces, bond_forces, 1.0)
        _add_scaled(total_forces, bend_forces, 1.0)
        _add_scaled(total_forces, excl_forces, 1.0)
        _add_scaled(total_forces, wall_forces, 1.0)
        _add_scaled(total_forces, agitation_forces, 1.0)
        _add_scaled(total_forces, random_forces, 1.0)

        for i, p in enumerate(positions):
            for axis in range(3):
                p[axis] += control["dt"] * total_forces[i][axis] / gamma

            radius = model["radii"][i]
            p[0] = max(radius, min(env["W"] - radius, p[0]))
            p[1] = max(-env["H"] / 2.0 + radius, min(env["H"] / 2.0 - radius, p[1]))
            p[2] = max(-env["T"] / 2.0 + radius, min(env["T"] / 2.0 - radius, p[2]))

        if step % control["sample_interval"] == 0:
            frames.append({"time": round(t, 4), "positions": [list(p) for p in positions]})
        if progress_callback is not None and (step == 0 or step == total_steps or step % progress_interval == 0):
            progress_callback(
                {
                    "phase": "simulate",
                    "current_step": step,
                    "total_steps": total_steps,
                    "progress": step / total_steps if total_steps else 1.0,
                }
            )

    return frames
