# pathfinding.py
from collections import deque
from typing import Callable, Dict, List, Optional, Tuple

from engine.Map_gen import CellType, GridMap

Position = Tuple[int, int]
PlannerFn = Callable[[GridMap, Position, Position], Optional[List[Position]]]


def bfs_shortest_path(
    grid_map: GridMap,
    start: Position,
    goal: Position,
) -> Optional[List[Position]]:
    """
    Canonical BFS shortest path on the current grid.
    Returns a list of positions from start -> goal, or None if unreachable.
    """
    queue = deque([start])
    came_from: Dict[Position, Optional[Position]] = {start: None}

    while queue:
        current = queue.popleft()
        if current == goal:
            break

        x, y = current
        for nx, ny in [
            (x + 1, y),
            (x - 1, y),
            (x, y + 1),
            (x, y - 1),
        ]:
            if not grid_map.in_bounds(nx, ny):
                continue

            next_pos = (nx, ny)
            if next_pos in came_from:
                continue
            if grid_map.cells[next_pos] == CellType.OBSTACLE:
                continue

            came_from[next_pos] = current
            queue.append(next_pos)

    if goal not in came_from:
        return None

    path: List[Position] = []
    cur: Optional[Position] = goal
    while cur is not None:
        path.append(cur)
        cur = came_from[cur]

    path.reverse()
    return path


PLANNERS: Dict[str, PlannerFn] = {
    "bfs": bfs_shortest_path,
}


def register_planner(name: str, planner_fn: PlannerFn) -> None:
    """
    Register additional planners (for example A* later) at runtime.
    """
    PLANNERS[name] = planner_fn


def shortest_path(
    grid_map: GridMap,
    start: Position,
    goal: Position,
    algorithm: str = "bfs",
) -> Optional[List[Position]]:
    """
    Dispatcher for path planning algorithms defined in this module.
    """
    planner = PLANNERS.get(algorithm)
    if planner is None:
        raise ValueError(f"Unknown planner: {algorithm}")
    return planner(grid_map, start, goal)


def path_exists(grid_map: GridMap, algorithm: str = "bfs") -> bool:
    """
    Convenience checker used by obstacle validation logic.
    """
    return shortest_path(
        grid_map=grid_map,
        start=grid_map.start,
        goal=grid_map.end,
        algorithm=algorithm,
    ) is not None

