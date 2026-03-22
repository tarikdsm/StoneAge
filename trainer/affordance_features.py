from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Tuple

import numpy as np


GRID_WIDTH = 10
GRID_HEIGHT = 10

GRID_CODE_EMPTY = 0
GRID_CODE_PLAYER = 1
GRID_CODE_BLOCK_ORIGINAL = 2
GRID_CODE_BLOCK_RESPAWNED = 3
GRID_CODE_ENEMY_ACTIVE = 4
GRID_CODE_ENEMY_SPAWNING = 5
GRID_CODE_ENEMY_DIGGING = 6
GRID_CODE_COLUMN = 7
GRID_CODE_PLAYER_CAUGHT = 8

DIRECTION_ORDER = ("up", "down", "left", "right")
DIRECTION_VECTORS: Dict[str, Tuple[int, int]] = {
    "up": (0, -1),
    "down": (0, 1),
    "left": (-1, 0),
    "right": (1, 0),
}

BLOCK_CODES = {GRID_CODE_BLOCK_ORIGINAL, GRID_CODE_BLOCK_RESPAWNED}
ENEMY_CODES = {GRID_CODE_ENEMY_ACTIVE, GRID_CODE_ENEMY_DIGGING, GRID_CODE_PLAYER_CAUGHT}
THREAT_CODES = {GRID_CODE_ENEMY_ACTIVE, GRID_CODE_ENEMY_DIGGING, GRID_CODE_PLAYER_CAUGHT}
SOLID_CODES = BLOCK_CODES | {GRID_CODE_COLUMN}
OCCUPIED_CODES = SOLID_CODES | ENEMY_CODES


@dataclass(frozen=True)
class AffordanceResult:
    values: np.ndarray
    names: list[str]


def build_affordance_features(grid_codes: Iterable[int], player_position: Tuple[int, int]) -> AffordanceResult:
    grid = np.asarray(list(grid_codes), dtype=np.int32).reshape(GRID_HEIGHT, GRID_WIDTH)
    player_x, player_y = int(player_position[0]), int(player_position[1])
    enemy_positions = list(_find_enemy_positions(grid))

    move_free = [_is_move_free(grid, player_x, player_y, direction) for direction in DIRECTION_ORDER]
    adjacent_block = [_has_adjacent_block(grid, player_x, player_y, direction) for direction in DIRECTION_ORDER]
    pushable = [_is_pushable(grid, player_x, player_y, direction) for direction in DIRECTION_ORDER]
    jammed_destroyable = [_is_jammed_destroyable(grid, player_x, player_y, direction) for direction in DIRECTION_ORDER]
    useful_launch = [_is_useful_launch(grid, player_x, player_y, direction) for direction in DIRECTION_ORDER]
    immediate_threat_lanes = [_has_immediate_threat_in_direction(grid, player_x, player_y, direction) for direction in DIRECTION_ORDER]

    immediate_threat = 1.0 if any(immediate_threat_lanes) or _min_enemy_distance(enemy_positions, (player_x, player_y)) <= 1 else 0.0
    escape_routes = [
        _is_escape_route(grid, enemy_positions, player_x, player_y, direction)
        for direction in DIRECTION_ORDER
    ]
    escape_route_immediate = 1.0 if any(escape_routes) else 0.0

    productive_action_count = (
        sum(1 for value in move_free if value)
        + sum(1 for value in pushable if value)
        + sum(1 for value in jammed_destroyable if value)
        + sum(1 for value in useful_launch if value)
    )
    player_trapped = 1.0 if productive_action_count == 0 else 0.0

    min_enemy_distance = _min_enemy_distance(enemy_positions, (player_x, player_y))
    legal_move_count = sum(1 for value in move_free if value)
    safe_move_count = sum(1 for value in escape_routes if value)
    adjacent_block_count = sum(1 for value in adjacent_block if value)
    pushable_count = sum(1 for value in pushable if value)
    jammed_block_count = sum(1 for value in jammed_destroyable if value)
    useful_launch_count = sum(1 for value in useful_launch if value)
    threat_direction_count = sum(1 for value in immediate_threat_lanes if value)

    names: List[str] = []
    values: List[float] = []

    def extend(prefix: str, directional_values: list[float]) -> None:
        for direction, value in zip(DIRECTION_ORDER, directional_values, strict=True):
            names.append(f"{prefix}_{direction}")
            values.append(float(value))

    extend("move_free", move_free)
    extend("adjacent_block", adjacent_block)
    extend("pushable", pushable)
    extend("jammed_destroyable", jammed_destroyable)
    extend("useful_launch", useful_launch)
    extend("immediate_threat_lane", immediate_threat_lanes)
    extend("escape_route", escape_routes)

    scalar_features = {
        "immediate_threat": immediate_threat,
        "escape_route_immediate": escape_route_immediate,
        "player_trapped": player_trapped,
        "productive_action_count": min(productive_action_count / 9.0, 1.0),
        "legal_move_count": legal_move_count / 4.0,
        "safe_move_count": safe_move_count / 4.0,
        "adjacent_block_count": adjacent_block_count / 4.0,
        "pushable_count": pushable_count / 4.0,
        "jammed_block_count": jammed_block_count / 4.0,
        "useful_launch_count": useful_launch_count / 4.0,
        "threat_direction_count": threat_direction_count / 4.0,
        "min_enemy_distance": min(min_enemy_distance / 9.0, 1.0),
    }

    for name, value in scalar_features.items():
        names.append(name)
        values.append(float(value))

    return AffordanceResult(values=np.asarray(values, dtype=np.float32), names=names)


def _find_enemy_positions(grid: np.ndarray) -> Iterable[Tuple[int, int]]:
    for y in range(GRID_HEIGHT):
        for x in range(GRID_WIDTH):
            if int(grid[y, x]) in THREAT_CODES:
                yield (x, y)


def _is_move_free(grid: np.ndarray, player_x: int, player_y: int, direction: str) -> float:
    nx, ny = _step(player_x, player_y, direction)
    return 1.0 if _in_bounds(nx, ny) and int(grid[ny, nx]) == GRID_CODE_EMPTY else 0.0


def _has_adjacent_block(grid: np.ndarray, player_x: int, player_y: int, direction: str) -> float:
    nx, ny = _step(player_x, player_y, direction)
    return 1.0 if _in_bounds(nx, ny) and int(grid[ny, nx]) in BLOCK_CODES else 0.0


def _is_pushable(grid: np.ndarray, player_x: int, player_y: int, direction: str) -> float:
    bx, by = _step(player_x, player_y, direction)
    if not (_in_bounds(bx, by) and int(grid[by, bx]) in BLOCK_CODES):
        return 0.0

    tx, ty = _step(bx, by, direction)
    if not _in_bounds(tx, ty):
        return 0.0

    target_code = int(grid[ty, tx])
    return 1.0 if target_code not in SOLID_CODES else 0.0


def _is_jammed_destroyable(grid: np.ndarray, player_x: int, player_y: int, direction: str) -> float:
    bx, by = _step(player_x, player_y, direction)
    if not (_in_bounds(bx, by) and int(grid[by, bx]) in BLOCK_CODES):
        return 0.0

    tx, ty = _step(bx, by, direction)
    if not _in_bounds(tx, ty):
        return 1.0

    return 1.0 if int(grid[ty, tx]) in SOLID_CODES else 0.0


def _is_useful_launch(grid: np.ndarray, player_x: int, player_y: int, direction: str) -> float:
    bx, by = _step(player_x, player_y, direction)
    if not (_in_bounds(bx, by) and int(grid[by, bx]) in BLOCK_CODES):
        return 0.0

    cx, cy = _step(bx, by, direction)
    if not _in_bounds(cx, cy) or int(grid[cy, cx]) in SOLID_CODES:
        return 0.0

    enemy_seen = False
    while _in_bounds(cx, cy) and int(grid[cy, cx]) not in SOLID_CODES:
        if int(grid[cy, cx]) in ENEMY_CODES:
            enemy_seen = True
        cx, cy = _step(cx, cy, direction)

    return 1.0 if enemy_seen else 0.0


def _has_immediate_threat_in_direction(grid: np.ndarray, player_x: int, player_y: int, direction: str) -> float:
    dx, dy = DIRECTION_VECTORS[direction]
    for distance in (1, 2):
        nx = player_x + dx * distance
        ny = player_y + dy * distance
        if not _in_bounds(nx, ny):
            break

        code = int(grid[ny, nx])
        if code in SOLID_CODES:
            break
        if code in THREAT_CODES:
            return 1.0

    return 0.0


def _is_escape_route(
    grid: np.ndarray,
    enemy_positions: list[Tuple[int, int]],
    player_x: int,
    player_y: int,
    direction: str,
) -> float:
    if _is_move_free(grid, player_x, player_y, direction) == 0.0:
        return 0.0

    current_distance = _min_enemy_distance(enemy_positions, (player_x, player_y))
    next_point = _step(player_x, player_y, direction)
    next_distance = _min_enemy_distance(enemy_positions, next_point)
    return 1.0 if next_distance > current_distance else 0.0


def _min_enemy_distance(enemy_positions: list[Tuple[int, int]], player_point: Tuple[int, int]) -> int:
    if not enemy_positions:
        return 9

    px, py = player_point
    return min(abs(px - ex) + abs(py - ey) for ex, ey in enemy_positions)


def _step(x: int, y: int, direction: str) -> Tuple[int, int]:
    dx, dy = DIRECTION_VECTORS[direction]
    return x + dx, y + dy


def _in_bounds(x: int, y: int) -> bool:
    return 0 <= x < GRID_WIDTH and 0 <= y < GRID_HEIGHT
