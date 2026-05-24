from __future__ import annotations

import math
import random
from typing import Any


def _apply_soft_bond_relaxation(positions: list[list[float]], bonds: list[list[int]], equilibrium_b: float, k_bend: float) -> None:
    stiffness = min(0.25, 0.06 + 0.12 * k_bend)
    for i, j in bonds:
        dx = positions[j][0] - positions[i][0]
        dy = positions[j][1] - positions[i][1]
        dz = positions[j][2] - positions[i][2]
        length = math.sqrt(dx * dx + dy * dy + dz * dz) or 1e-8
        delta = length - equilibrium_b
        correction = stiffness * delta / length
        cx = dx * correction * 0.5
        cy = dy * correction * 0.5
        cz = dz * correction * 0.5
        positions[i][0] += cx
        positions[i][1] += cy
        positions[i][2] += cz
        positions[j][0] -= cx
        positions[j][1] -= cy
        positions[j][2] -= cz


def _apply_branch_stiffness(
    positions: list[list[float]],
    arm_segments: dict[str, list[int]],
    k_bend: float,
) -> None:
    smoothing = min(0.18, 0.03 + 0.06 * k_bend)
    for segment_indices in arm_segments.values():
        for offset in range(1, len(segment_indices) - 1):
            prev_idx = segment_indices[offset - 1]
            curr_idx = segment_indices[offset]
            next_idx = segment_indices[offset + 1]
            avg = [
                0.5 * (positions[prev_idx][axis] + positions[next_idx][axis])
                for axis in range(3)
            ]
            for axis in range(3):
                positions[curr_idx][axis] = (
                    (1.0 - smoothing) * positions[curr_idx][axis] + smoothing * avg[axis]
                )


def simulate_trajectory(model: dict[str, Any], config: dict[str, Any]) -> list[dict[str, Any]]:
    control = config["control"]
    env = config["environment"]
    mechanics = config["mechanics"]
    random.seed(control["seed"])

    positions = [list(p) for p in model["positions"]]
    frames: list[dict[str, Any]] = []
    gamma = max(mechanics["gamma"], 1e-6)
    k_bend = mechanics["k_bend"]
    noise_scale = env["agitation_amplitude"] / gamma
    wave_scale = (0.01 / gamma) * max(0.4, 1.2 - 0.5 * k_bend)
    tau_a = max(env["tau_a"], 1e-6)
    correlated_push = [0.0, 0.0, 0.0]

    for step in range(control["num_steps"] + 1):
        t = step * control["dt"]
        phase = t * 0.8
        memory = max(0.0, min(0.999, math.exp(-control["dt"] / tau_a)))
        correlated_push = [
            memory * correlated_push[0] + (1.0 - memory) * (random.random() - 0.5) * noise_scale * 0.8,
            memory * correlated_push[1] + (1.0 - memory) * (random.random() - 0.5) * noise_scale * 0.8,
            memory * correlated_push[2] + (1.0 - memory) * (random.random() - 0.5) * noise_scale * 0.2,
        ]

        for i, p in enumerate(positions):
            jitter = (
                (random.random() - 0.5) * noise_scale,
                (random.random() - 0.5) * noise_scale,
                (random.random() - 0.5) * noise_scale * 0.4,
            )
            wave = wave_scale * math.sin(phase + i * 0.13)
            p[0] += jitter[0] + correlated_push[0]
            p[1] += jitter[1] + wave + correlated_push[1]
            p[2] += jitter[2] + correlated_push[2]

            p[0] = max(0.0, min(env["W"], p[0]))
            p[1] = max(-env["H"] / 2.0, min(env["H"] / 2.0, p[1]))
            p[2] = max(-env["T"] / 2.0, min(env["T"] / 2.0, p[2]))

        _apply_soft_bond_relaxation(positions, model["bonds"], model["equilibrium_b"], k_bend)
        _apply_branch_stiffness(positions, model["arm_segments"], k_bend)

        if step % control["sample_interval"] == 0:
            frames.append({"time": round(t, 4), "positions": [list(p) for p in positions]})

    return frames
