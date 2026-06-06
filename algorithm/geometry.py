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


def _polyline_length(points: list[list[float]]) -> float:
    return sum(math.dist(start, end) for start, end in zip(points, points[1:]))


def _scale_polyline(points: list[list[float]], desired_length: float) -> list[list[float]]:
    actual_length = _polyline_length(points)
    if actual_length <= 1e-8:
        return [list(point) for point in points]

    scale = desired_length / actual_length
    origin = points[0]
    return [
        [origin[axis] + (point[axis] - origin[axis]) * scale for axis in range(3)]
        for point in points
    ]


def _sample_polyline(points: list[list[float]], num_segments: int) -> list[list[float]]:
    cumulative_lengths = [0.0]
    for start, end in zip(points, points[1:]):
        cumulative_lengths.append(cumulative_lengths[-1] + math.dist(start, end))

    total_length = cumulative_lengths[-1]
    if total_length <= 1e-8:
        return [list(points[0]) for _ in range(num_segments + 1)]

    sampled: list[list[float]] = []
    for segment_index in range(num_segments + 1):
        target_length = total_length * segment_index / num_segments
        control_index = 0
        while (
            control_index + 1 < len(cumulative_lengths)
            and cumulative_lengths[control_index + 1] < target_length
        ):
            control_index += 1

        if control_index + 1 >= len(points):
            sampled.append(list(points[-1]))
            continue

        local_length = cumulative_lengths[control_index + 1] - cumulative_lengths[control_index]
        ratio = 0.0 if local_length <= 1e-8 else (target_length - cumulative_lengths[control_index]) / local_length
        start = points[control_index]
        end = points[control_index + 1]
        sampled.append([start[axis] + (end[axis] - start[axis]) * ratio for axis in range(3)])

    return sampled


def _pocket_axis_bounds(environment: dict[str, float]) -> list[tuple[float, float]]:
    return [
        (0.0, environment["W"]),
        (-environment["H"] / 2.0, environment["H"] / 2.0),
        (-environment["T"] / 2.0, environment["T"] / 2.0),
    ]


def _translate_inside_pocket(
    positions: list[list[float]],
    radii: list[float],
    environment: dict[str, float],
) -> None:
    axis_bounds = _pocket_axis_bounds(environment)

    for axis, (lower_bound, upper_bound) in enumerate(axis_bounds):
        minimum = min(position[axis] - radius for position, radius in zip(positions, radii, strict=False))
        maximum = max(position[axis] + radius for position, radius in zip(positions, radii, strict=False))

        shift = 0.0
        if minimum < lower_bound:
            shift += lower_bound - minimum
        if maximum > upper_bound:
            shift += upper_bound - maximum

        if shift != 0.0:
            for position in positions:
                position[axis] += shift


def _positions_fit_inside_pocket(
    positions: list[list[float]],
    radii: list[float],
    environment: dict[str, float],
    tolerance: float = 1e-6,
) -> bool:
    for axis, (lower_bound, upper_bound) in enumerate(_pocket_axis_bounds(environment)):
        for position, radius in zip(positions, radii, strict=False):
            if position[axis] - radius < lower_bound - tolerance:
                return False
            if position[axis] + radius > upper_bound + tolerance:
                return False
    return True


def _confined_curve_length(
    start: list[float],
    end: list[float],
    y_amplitude: float,
    z_amplitude: float,
    wiggle_cycles: float,
    phase: float,
    sample_count: int = 256,
) -> float:
    return _polyline_length(
        _build_confined_curve_points(
            start,
            end,
            y_amplitude,
            z_amplitude,
            wiggle_cycles,
            phase,
            sample_count,
        )
    )


def _build_confined_curve_points(
    start: list[float],
    end: list[float],
    y_amplitude: float,
    z_amplitude: float,
    wiggle_cycles: float,
    phase: float,
    sample_count: int = 256,
) -> list[list[float]]:
    points: list[list[float]] = []
    for index in range(sample_count):
        t = index / (sample_count - 1)
        envelope = math.sin(math.pi * t)
        angle = 2.0 * math.pi * wiggle_cycles * t + phase
        points.append(
            [
                start[0] + (end[0] - start[0]) * t,
                start[1] + (end[1] - start[1]) * t + y_amplitude * envelope * math.sin(angle),
                start[2] + (end[2] - start[2]) * t + z_amplitude * envelope * math.cos(angle),
            ]
        )
    return points


def _build_confined_path(
    start: list[float],
    end: list[float],
    target_length: float,
    num_segments: int,
    y_amplitude: float,
    z_amplitude: float,
    phase: float,
) -> list[list[float]]:
    direct_distance = math.dist(start, end)
    if target_length + 1e-6 < direct_distance:
        raise ValueError(
            "Requested cable segment is shorter than the straight-line distance available inside the pocket. "
            "Please reduce endpoint separation or increase segment length."
        )

    low = 0.0
    high = 1.0
    for _ in range(20):
        if _confined_curve_length(start, end, y_amplitude, z_amplitude, high, phase) >= target_length:
            break
        high *= 2.0
    else:
        raise ValueError(
            "Unable to fold the initial geometry into the pocket for this parameter combination. "
            "Try reducing cable lengths or rigid-body radii, or increasing pocket size."
        )

    for _ in range(40):
        mid = 0.5 * (low + high)
        if _confined_curve_length(start, end, y_amplitude, z_amplitude, mid, phase) >= target_length:
            high = mid
        else:
            low = mid

    return _sample_polyline(
        _build_confined_curve_points(start, end, y_amplitude, z_amplitude, high, phase),
        num_segments,
    )


def build_initial_geometry(config: dict[str, Any]) -> dict[str, Any]:
    geometry = config["geometry"]
    environment = config["environment"]
    b = geometry["b"]
    n0 = max(2, round(geometry["L_0"] / b))
    n1 = max(2, round(geometry["L_1"] / b))
    max_radius = max(geometry["d_cable"] / 2.0, geometry["r_plug"], geometry["r_earbud"], geometry["r_junction"])
    padding = max(0.01, 0.25 * geometry["d_cable"])

    axis_bounds = _pocket_axis_bounds(environment)
    safe_bounds = []
    for lower_bound, upper_bound in axis_bounds:
        safe_lower = lower_bound + max_radius + padding
        safe_upper = upper_bound - max_radius - padding
        if safe_lower >= safe_upper:
            raise ValueError(
                "Pocket dimensions are too small for the chosen cable thickness and rigid-body radii."
            )
        safe_bounds.append((safe_lower, safe_upper))

    x_lower, x_upper = safe_bounds[0]
    y_lower, y_upper = safe_bounds[1]
    z_lower, z_upper = safe_bounds[2]
    x_span = x_upper - x_lower
    y_span = y_upper - y_lower
    z_span = z_upper - z_lower

    if x_span <= 0.0 or y_span <= 0.0 or z_span <= 0.0:
        raise ValueError("Pocket dimensions leave no feasible space for the initial geometry.")

    plug_x = x_lower + 0.14 * x_span
    junction_x = min(plug_x + min(0.34 * x_span, 0.65 * geometry["L_0"]), x_lower + 0.56 * x_span)
    junction_x = max(junction_x, plug_x + 0.08 * x_span)
    earbud_x = min(junction_x + min(0.24 * x_span, 0.58 * geometry["L_1"]), x_upper - 0.08 * x_span)
    earbud_x = max(earbud_x, junction_x + 0.06 * x_span)

    branch_y_offset = min(0.30 * y_span, max(0.12 * y_span, 0.35 * geometry["L_1"]))
    branch_z_offset = min(0.18 * z_span, max(0.08 * z_span, 0.16 * geometry["L_1"]))

    left_end = [earbud_x, min(y_upper - 0.05 * y_span, branch_y_offset), branch_z_offset]
    right_end = [earbud_x, max(y_lower + 0.05 * y_span, -branch_y_offset), -branch_z_offset]
    plug_position = [plug_x, -0.10 * y_span, -0.12 * z_span]
    junction_position = [junction_x, 0.02 * y_span, 0.0]

    left_direct_distance = math.dist(junction_position, left_end)
    right_direct_distance = math.dist(junction_position, right_end)
    if geometry["L_1"] <= max(left_direct_distance, right_direct_distance):
        available = max(geometry["L_1"] - (earbud_x - junction_x), 0.0)
        reduced_offset = min(branch_y_offset, 0.5 * available)
        reduced_depth = min(branch_z_offset, 0.35 * available)
        left_end = [earbud_x, min(y_upper - 0.05 * y_span, reduced_offset), reduced_depth]
        right_end = [earbud_x, max(y_lower + 0.05 * y_span, -reduced_offset), -reduced_depth]

    trunk_positions = _build_confined_path(
        plug_position,
        junction_position,
        geometry["L_0"],
        n0,
        0.24 * y_span,
        0.30 * z_span,
        phase=0.35 * math.pi,
    )
    junction_anchor = trunk_positions[-1]
    left_branch_positions = _build_confined_path(
        list(junction_anchor),
        left_end,
        geometry["L_1"],
        n1,
        0.14 * y_span,
        0.20 * z_span,
        phase=0.9 * math.pi,
    )
    right_branch_positions = _build_confined_path(
        list(junction_anchor),
        right_end,
        geometry["L_1"],
        n1,
        0.14 * y_span,
        0.20 * z_span,
        phase=1.4 * math.pi,
    )

    positions = trunk_positions + left_branch_positions[1:] + right_branch_positions[1:]
    arm_labels = (
        ["trunk"] * len(trunk_positions)
        + ["left"] * (len(left_branch_positions) - 1)
        + ["right"] * (len(right_branch_positions) - 1)
    )
    bead_types = ["flex"] * len(positions)
    radii = [geometry["d_cable"] / 2.0] * len(positions)
    bonds: list[list[int]] = []
    arm_segments: dict[str, list[int]] = {}

    for i in range(1, len(trunk_positions)):
        bonds.append([i - 1, i])

    plug_index = 0
    junction_index = len(trunk_positions) - 1
    bead_types[plug_index] = "plug"
    radii[plug_index] = geometry["r_plug"]
    bead_types[junction_index] = "junction"
    radii[junction_index] = geometry["r_junction"]
    arm_segments["trunk"] = list(range(0, junction_index + 1))

    branch_indices: dict[str, list[int]] = {"left": [junction_index], "right": [junction_index]}
    left_start = len(trunk_positions)
    right_start = len(trunk_positions) + len(left_branch_positions) - 1

    previous_index = junction_index
    for point_offset in range(len(left_branch_positions) - 1):
        current_index = left_start + point_offset
        bonds.append([previous_index, current_index])
        branch_indices["left"].append(current_index)
        previous_index = current_index

    previous_index = junction_index
    for point_offset in range(len(right_branch_positions) - 1):
        current_index = right_start + point_offset
        bonds.append([previous_index, current_index])
        branch_indices["right"].append(current_index)
        previous_index = current_index

    left_earbud_index = junction_index + n1
    right_earbud_index = junction_index + 2 * n1
    bead_types[left_earbud_index] = "earbud"
    bead_types[right_earbud_index] = "earbud"
    radii[left_earbud_index] = geometry["r_earbud"]
    radii[right_earbud_index] = geometry["r_earbud"]
    arm_segments["left"] = branch_indices["left"]
    arm_segments["right"] = branch_indices["right"]

    _translate_inside_pocket(positions, radii, environment)
    if not _positions_fit_inside_pocket(positions, radii, environment):
        raise ValueError(
            "Initial geometry still exceeds the pocket boundary for this parameter combination. "
            "Please reduce cable lengths or rigid-body radii, or enlarge the pocket."
        )
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
