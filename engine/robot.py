# robot.py

from typing import Tuple
from engine.Map_gen import GridMap
from engine.pathfinding import shortest_path

Position = Tuple[int, int]


class Robot:
    def __init__(self, grid_map: GridMap, planner: str = "bfs"):
        self.grid_map = grid_map
        self.position: Position = grid_map.start
        self.end: Position = grid_map.end
        self.planner = planner

        # Fixed initial battery for current game balancing.
        self.battery: int = 21

    # -----------------------------
    # Public API
    # -----------------------------
    def move(self) -> bool:
        """
        Robot takes one step toward the end.
        Returns True if move was successful.
        Returns False if robot cannot move (battery empty).
        """

        if self.battery <= 0:
            return False

        path = shortest_path(
            grid_map=self.grid_map,
            start=self.position,
            goal=self.end,
            algorithm=self.planner,
        )

        if path is None or len(path) < 2:
            # already at end or no path (should not happen)
            return False

        # move one step
        self.position = path[1]
        self.battery -= 1
        return True

    def reached_end(self) -> bool:
        return self.position == self.end
