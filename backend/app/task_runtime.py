from __future__ import annotations

import datetime as dt
import json
import os
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable


TERMINAL_STATUSES = {"finished", "failed", "cancelled"}
_PROGRESS_RESERVED_KEYS = {
    "task_id",
    "kind",
    "status",
    "progress",
    "started_at",
    "finished_at",
    "error",
    "phase",
}


@dataclass
class ActiveTask:
    task_id: str
    kind: str
    task_dir: Path
    started_at: str
    cancel_event: threading.Event
    completion_checker: Callable[[Path], bool]
    finish_details_builder: Callable[[dict[str, Any]], dict[str, Any]]


@dataclass(frozen=True)
class TaskRecoverySpec:
    prefix: str
    config_filename: str
    completion_checker: Callable[[Path], bool]
    unfinished_error: str
    finish_details_builder: Callable[[dict[str, Any]], dict[str, Any]]


_ACTIVE_TASKS: dict[str, ActiveTask] = {}
_ACTIVE_TASKS_LOCK = threading.Lock()


def utc_now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def write_json(path: Path, payload: Any) -> None:
    temp_path = path.with_name(f"{path.name}.{threading.get_ident()}.tmp")
    temp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    for attempt in range(5):
        try:
            os.replace(temp_path, path)
            return
        except PermissionError:
            if attempt == 4:
                raise
            time.sleep(0.02)


def read_json(path: Path) -> Any:
    if not path.exists():
        raise FileNotFoundError(path.name)
    for attempt in range(5):
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, PermissionError):
            if attempt == 4:
                raise
            time.sleep(0.02)
    raise RuntimeError(f"Failed to read JSON from {path}")


def progress_path(task_dir: Path) -> Path:
    return task_dir / "progress.json"


def write_progress(task_dir: Path, payload: dict[str, Any]) -> None:
    write_json(progress_path(task_dir), payload)


def read_progress(task_dir: Path) -> dict[str, Any]:
    return read_json(progress_path(task_dir))


def build_progress_payload(
    *,
    task_id: str,
    kind: str,
    status: str,
    progress: float,
    started_at: str,
    finished_at: str | None = None,
    error: str | None = None,
    phase: str | None = None,
    **details: Any,
) -> dict[str, Any]:
    payload = {
        "task_id": task_id,
        "kind": kind,
        "status": status,
        "progress": max(0.0, min(1.0, progress)),
        "started_at": started_at,
        "finished_at": finished_at,
        "error": error,
        "phase": phase,
    }
    payload.update(details)
    return payload


def register_active_task(
    *,
    task_id: str,
    kind: str,
    task_dir: Path,
    started_at: str,
    completion_checker: Callable[[Path], bool],
    finish_details_builder: Callable[[dict[str, Any]], dict[str, Any]],
    cancel_event: threading.Event | None = None,
) -> threading.Event:
    cancel_event = cancel_event or threading.Event()
    with _ACTIVE_TASKS_LOCK:
        _ACTIVE_TASKS[task_id] = ActiveTask(
            task_id=task_id,
            kind=kind,
            task_dir=task_dir,
            started_at=started_at,
            cancel_event=cancel_event,
            completion_checker=completion_checker,
            finish_details_builder=finish_details_builder,
        )
    return cancel_event


def unregister_active_task(task_id: str) -> None:
    with _ACTIVE_TASKS_LOCK:
        _ACTIVE_TASKS.pop(task_id, None)


def request_cancel(task_id: str) -> bool:
    with _ACTIVE_TASKS_LOCK:
        active_task = _ACTIVE_TASKS.get(task_id)
    if active_task is None:
        return False
    active_task.cancel_event.set()
    return True


def mark_progress_status(
    task_dir: Path,
    *,
    status: str,
    finished_at: str | None = None,
    error: str | None = None,
    phase: str | None = None,
    progress: float | None = None,
    **details: Any,
) -> dict[str, Any]:
    existing = read_progress(task_dir)
    payload = build_progress_payload(
        task_id=existing["task_id"],
        kind=existing["kind"],
        status=status,
        progress=existing["progress"] if progress is None else progress,
        started_at=existing["started_at"],
        finished_at=finished_at,
        error=error,
        phase=phase if phase is not None else existing.get("phase"),
        **{
            **{
                key: value
                for key, value in existing.items()
                if key not in _PROGRESS_RESERVED_KEYS
            },
            **details,
        },
    )
    write_progress(task_dir, payload)
    return payload


def recover_stale_tasks(root_dir: Path, specs: list[TaskRecoverySpec], logger: Any) -> None:
    for spec in specs:
        for task_dir in root_dir.glob(spec.prefix):
            current_progress_path = progress_path(task_dir)
            config_path = task_dir / spec.config_filename
            if not current_progress_path.exists() or not config_path.exists():
                continue
            try:
                progress = read_json(current_progress_path)
                if progress.get("status") in TERMINAL_STATUSES:
                    continue
                if spec.completion_checker(task_dir):
                    mark_progress_status(
                        task_dir,
                        status="finished",
                        finished_at=utc_now_iso(),
                        error=None,
                        phase="finished",
                        progress=1.0,
                        **spec.finish_details_builder(progress),
                    )
                else:
                    mark_progress_status(
                        task_dir,
                        status="failed",
                        finished_at=utc_now_iso(),
                        error=spec.unfinished_error,
                        phase="failed",
                    )
            except Exception:
                logger.exception("Failed to recover stale task at %s", task_dir)


def mark_active_tasks_on_exit(logger: Any) -> None:
    with _ACTIVE_TASKS_LOCK:
        active_tasks = list(_ACTIVE_TASKS.values())
    for active_task in active_tasks:
        try:
            if active_task.completion_checker(active_task.task_dir):
                mark_progress_status(
                    active_task.task_dir,
                    status="finished",
                    finished_at=utc_now_iso(),
                    error=None,
                    phase="finished",
                    progress=1.0,
                    **active_task.finish_details_builder(read_progress(active_task.task_dir)),
                )
            else:
                mark_progress_status(
                    active_task.task_dir,
                    status="failed",
                    finished_at=utc_now_iso(),
                    error="Task interrupted by backend restart or shutdown.",
                    phase="failed",
                )
        except Exception:
            logger.exception("Failed to mark active task %s during shutdown", active_task.task_id)
