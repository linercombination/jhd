from __future__ import annotations

import math
from typing import Any


def _compute_graph_steps(num_nodes: int, bonds: list[list[int]]) -> list[list[int]]:
    adjacency = [[] for _ in range(num_nodes)]
    for i, j in bonds:
        adjacency[i].append(j)
        adjacency[j].append(i)

    graph_steps: list[list[int]] = [[-1] * num_nodes for _ in range(num_nodes)]
    for start in range(num_nodes):
        queue = [start]
        graph_steps[start][start] = 0
        head = 0
        while head < len(queue):
            current = queue[head]
            head += 1
            for neighbor in adjacency[current]:
                if graph_steps[start][neighbor] != -1:
                    continue
                graph_steps[start][neighbor] = graph_steps[start][current] + 1
                queue.append(neighbor)
    return graph_steps


def build_initial_geometry(config: dict[str, Any]) -> dict[str, Any]:
    geometry = config["geometry"]
    b = geometry["b"]
    n0 = max(2, round(geometry["L_0"] / b))
    n1 = max(2, round(geometry["L_1"] / b))

    positions: list[list[float]] = []
    arm_labels: list[str] = []
    bead_types: list[str] = []
    radii: list[float] = []
    bonds: list[list[int]] = []
    arm_segments: dict[str, list[int]] = {}

    for i in range(n0 + 1):
        positions.append([i * b, 0.0, 0.0])
        arm_labels.append("trunk")
        bead_types.append("flex")
        radii.append(geometry["d_cable"] / 2.0)
        if i > 0:
            bonds.append([i - 1, i])

    plug_index = 0
    junction_index = len(positions) - 1
    bead_types[plug_index] = "plug"
    radii[plug_index] = geometry["r_plug"]
    bead_types[junction_index] = "junction"
    radii[junction_index] = geometry["r_junction"]
    arm_segments["trunk"] = list(range(0, junction_index + 1))

    angle = math.radians(45.0)
    branch_indices: dict[str, list[int]] = {}
    for branch_name, sign in [("left", 1.0), ("right", -1.0)]:
        branch_indices[branch_name] = [junction_index]
        previous_index = junction_index
        for i in range(1, n1 + 1):
            x = positions[junction_index][0] + i * b * math.cos(angle)
            y = sign * i * b * math.sin(angle)
            positions.append([x, y, 0.0])
            current_index = len(positions) - 1
            arm_labels.append(branch_name)
            bead_types.append("flex")
            radii.append(geometry["d_cable"] / 2.0)
            bonds.append([previous_index, current_index])
            branch_indices[branch_name].append(current_index)
            previous_index = current_index

    left_earbud_index = junction_index + n1
    right_earbud_index = junction_index + 2 * n1
    bead_types[left_earbud_index] = "earbud"
    bead_types[right_earbud_index] = "earbud"
    radii[left_earbud_index] = geometry["r_earbud"]
    radii[right_earbud_index] = geometry["r_earbud"]
    arm_segments["left"] = branch_indices["left"]
    arm_segments["right"] = branch_indices["right"]
    graph_steps = _compute_graph_steps(len(positions), bonds)

    return {
        "positions": positions,
        "arm_labels": arm_labels,
        "bead_types": bead_types,
        "radii": radii,
        "bonds": bonds,
        "arm_segments": arm_segments,
        "bond_pairs": {tuple(sorted(bond)) for bond in bonds},
        "graph_steps": graph_steps,
        "equilibrium_b": b,
        "indices": {
            "plug": plug_index,
            "junction": junction_index,
            "left_earbud": left_earbud_index,
            "right_earbud": right_earbud_index,
        },
    }
