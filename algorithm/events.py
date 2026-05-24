from __future__ import annotations

from itertools import combinations
from math import dist
from typing import Any


def detect_contacts(
    positions: list[list[float]],
    radii: list[float],
    graph_steps: list[list[int]],
    padding: float = 0.01,
    min_graph_separation: int = 3,
) -> list[list[int]]:
    contacts: list[list[int]] = []
    for i, j in combinations(range(len(positions)), 2):
        steps = graph_steps[i][j]
        if 0 <= steps < min_graph_separation:
            continue
        cutoff = 1.1 * (radii[i] + radii[j]) + padding
        if dist(positions[i], positions[j]) < cutoff:
            contacts.append([i, j])
    return contacts


def _triangle_area(a: list[float], b: list[float], c: list[float]) -> float:
    ab = [b[k] - a[k] for k in range(3)]
    ac = [c[k] - a[k] for k in range(3)]
    cross = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
    ]
    return 0.5 * (cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2]) ** 0.5


def _distance_to_triangle_centroid(
    point: list[float],
    a: list[float],
    b: list[float],
    c: list[float],
) -> float:
    centroid = [
        (a[0] + b[0] + c[0]) / 3.0,
        (a[1] + b[1] + c[1]) / 3.0,
        (a[2] + b[2] + c[2]) / 3.0,
    ]
    return dist(point, centroid)


def _dot(a: list[float], b: list[float]) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _sub(a: list[float], b: list[float]) -> list[float]:
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def _point_triangle_distance(
    point: list[float],
    a: list[float],
    b: list[float],
    c: list[float],
) -> float:
    ab = _sub(b, a)
    ac = _sub(c, a)
    ap = _sub(point, a)
    d1 = _dot(ab, ap)
    d2 = _dot(ac, ap)
    if d1 <= 0.0 and d2 <= 0.0:
        return dist(point, a)

    bp = _sub(point, b)
    d3 = _dot(ab, bp)
    d4 = _dot(ac, bp)
    if d3 >= 0.0 and d4 <= d3:
        return dist(point, b)

    vc = d1 * d4 - d3 * d2
    if vc <= 0.0 and d1 >= 0.0 and d3 <= 0.0:
        v = d1 / (d1 - d3)
        projection = [a[k] + v * ab[k] for k in range(3)]
        return dist(point, projection)

    cp = _sub(point, c)
    d5 = _dot(ab, cp)
    d6 = _dot(ac, cp)
    if d6 >= 0.0 and d5 <= d6:
        return dist(point, c)

    vb = d5 * d2 - d1 * d6
    if vb <= 0.0 and d2 >= 0.0 and d6 <= 0.0:
        w = d2 / (d2 - d6)
        projection = [a[k] + w * ac[k] for k in range(3)]
        return dist(point, projection)

    va = d3 * d6 - d5 * d4
    if va <= 0.0 and (d4 - d3) >= 0.0 and (d5 - d6) >= 0.0:
        bc = _sub(c, b)
        w = (d4 - d3) / ((d4 - d3) + (d5 - d6))
        projection = [b[k] + w * bc[k] for k in range(3)]
        return dist(point, projection)

    denom = 1.0 / (va + vb + vc)
    v = vb * denom
    w = vc * denom
    projection = [a[k] + ab[k] * v + ac[k] * w for k in range(3)]
    return dist(point, projection)


def detect_threading_candidates(
    positions: list[list[float]],
    indices: dict[str, int],
    radii: list[float],
    arm_segments: dict[str, list[int]],
    graph_steps: list[list[int]],
    cable_diameter: float,
) -> list[str]:
    _ = graph_steps
    min_loop_steps = 4
    closure_cutoff = 2.2 * cable_diameter
    min_loop_area = 0.18 * cable_diameter * cable_diameter
    terminals = {
        "plug": indices["plug"],
        "left_earbud": indices["left_earbud"],
        "right_earbud": indices["right_earbud"],
    }

    events: list[str] = []
    for arm_name, segment_indices in arm_segments.items():
        if len(segment_indices) <= min_loop_steps:
            continue
        for start_offset in range(len(segment_indices) - min_loop_steps):
            for end_offset in range(start_offset + min_loop_steps, len(segment_indices)):
                loop_i = segment_indices[start_offset]
                loop_j = segment_indices[end_offset]
                if dist(positions[loop_i], positions[loop_j]) >= closure_cutoff:
                    continue

                loop_path = segment_indices[start_offset : end_offset + 1]
                midpoint_index = loop_path[len(loop_path) // 2]
                loop_a = positions[loop_i]
                loop_b = positions[midpoint_index]
                loop_c = positions[loop_j]
                loop_area = _triangle_area(loop_a, loop_b, loop_c)
                if loop_area < min_loop_area:
                    continue

                loop_span = max(
                    dist(loop_a, loop_b),
                    dist(loop_b, loop_c),
                    dist(loop_a, loop_c),
                )
                for terminal_name, terminal_index in terminals.items():
                    if terminal_index in loop_path:
                        continue
                    point = positions[terminal_index]
                    surface_distance = _point_triangle_distance(point, loop_a, loop_b, loop_c)
                    centroid_distance = _distance_to_triangle_centroid(point, loop_a, loop_b, loop_c)
                    capture_radius = 0.9 * (radii[terminal_index] + cable_diameter)
                    if surface_distance <= capture_radius and centroid_distance <= 0.85 * loop_span:
                        events.append(
                            f"{terminal_name}_captured_by_{arm_name}_loop_{loop_i}_{loop_j}"
                        )

    return sorted(set(events))


def update_persistent_threading(
    frame_events: list[list[str]],
    min_persistent_frames: int,
) -> list[list[str]]:
    counters: dict[str, int] = {}
    persistent_events_per_frame: list[list[str]] = []

    for events in frame_events:
        next_counters: dict[str, int] = {}
        persistent_events: list[str] = []
        for event in events:
            count = counters.get(event, 0) + 1
            next_counters[event] = count
            if count >= min_persistent_frames:
                persistent_events.append(event)
        persistent_events_per_frame.append(persistent_events)
        counters = next_counters

    return persistent_events_per_frame


def compute_contact_persistence(
    frame_contacts: list[list[list[int]]],
    min_persistent_frames: int,
) -> list[int]:
    counters: dict[tuple[int, int], int] = {}
    persistence_per_frame: list[int] = []

    for contacts in frame_contacts:
        next_counters: dict[tuple[int, int], int] = {}
        persistence_total = 0
        for i, j in contacts:
            pair = tuple(sorted((i, j)))
            count = counters.get(pair, 0) + 1
            next_counters[pair] = count
            if count >= min_persistent_frames:
                persistence_total += count
        persistence_per_frame.append(persistence_total)
        counters = next_counters

    return persistence_per_frame


def compute_frame_metrics(
    contacts: list[list[int]],
    persistent_threading: list[str],
    contact_persistence: int,
) -> dict[str, float]:
    n_contact = len(contacts)
    n_thread = len(persistent_threading)
    s_tangle = n_thread * 3.0 + n_contact * 0.2 + 0.05 * contact_persistence
    return {
        "N_contact": float(n_contact),
        "N_thread": float(n_thread),
        "S_tangle": float(s_tangle),
    }
