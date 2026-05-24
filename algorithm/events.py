from __future__ import annotations

from itertools import combinations
from math import dist
from typing import Any


def detect_contacts(
    positions: list[list[float]],
    radii: list[float],
    bond_pairs: set[tuple[int, int]],
    padding: float = 0.01,
) -> list[list[int]]:
    contacts: list[list[int]] = []
    for i, j in combinations(range(len(positions)), 2):
        if tuple(sorted((i, j))) in bond_pairs:
            continue
        cutoff = 1.1 * (radii[i] + radii[j]) + padding
        if dist(positions[i], positions[j]) < cutoff:
            contacts.append([i, j])
    return contacts


def detect_threading(
    positions: list[list[float]],
    indices: dict[str, int],
    radii: list[float],
    cable_diameter: float,
) -> list[str]:
    events: list[str] = []
    junction = indices["junction"]
    for name in ["plug", "left_earbud", "right_earbud"]:
        terminal_index = indices[name]
        cutoff = 1.25 * (radii[terminal_index] + radii[junction]) + 0.5 * cable_diameter
        if dist(positions[terminal_index], positions[junction]) < cutoff:
            events.append(f"{name}_near_junction")
    return events


def compute_frame_metrics(contacts: list[list[int]], threading: list[str]) -> dict[str, float]:
    n_contact = len(contacts)
    n_thread = len(threading)
    s_tangle = n_thread * 3.0 + n_contact * 0.2
    return {
        "N_contact": float(n_contact),
        "N_thread": float(n_thread),
        "S_tangle": float(s_tangle),
    }
