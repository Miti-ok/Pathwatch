# obstacles.py
from typing import List, Tuple
from Map_gen import GridMap, CellType
Position = Tuple[int, int]
class ObstacleManager:
    def __init__(self, grid_map: GridMap):
        self.grid_map = grid_map
        self.obstacles: List[Position] = []

    # -----------------------------
    # Utility helpers
    # -----------------------------
    def neighbours(self, x: int, y: int) -> List[Position]:
        return [
            (x + 1, y),
            (x - 1, y),
            (x, y + 1),
            (x, y - 1),
        ]

    def is_free_cell(self, pos: Position) -> bool:
        x, y = pos
        if not self.grid_map.in_bounds(x, y):
            return False
        return self.grid_map.cells[(x, y)] == CellType.EMPTY

    # -----------------------------
    # Initial placement (WITH BFS)
    # -----------------------------
    def place_initial_obstacles(
        self,
        positions: List[Position],
        path_exists_fn,
    ) -> None:
        """
        Place initial obstacles one by one.
        Each placement is validated using BFS to ensure
        at least one path from start to end still exists.
        """

        for pos in positions:
            if not self._can_place_initial(pos):
                raise ValueError(f"Invalid obstacle position: {pos}")

            # simulate placement
            self._place_obstacle(pos)

            # check path validity
            if not path_exists_fn(self.grid_map):
                # rollback
                self._remove_obstacle(pos)
                raise ValueError(
                    f"Obstacle at {pos} blocks all paths"
                )

    def _can_place_initial(self, pos: Position) -> bool:
        if pos == self.grid_map.start:
            return False
        if pos == self.grid_map.end:
            return False
        if not self.is_free_cell(pos):
            return False
        return True

    def _place_obstacle(self, pos: Position) -> None:
        self.grid_map.cells[pos] = CellType.OBSTACLE
        self.obstacles.append(pos)

    # -----------------------------
    # Moving obstacles (user or robot)
    # -----------------------------
    def move_obstacle(
        self,
        from_pos: Position,
        to_pos: Position,
        path_exists_fn,
    ) -> bool:

        if from_pos not in self.obstacles:
            return False

        if to_pos not in self.neighbours(*from_pos):
            return False

        if not self.is_free_cell(to_pos):
            return False

        # simulate move
        self._remove_obstacle(from_pos)
        self._place_obstacle(to_pos)

        # validate with BFS
        if not path_exists_fn(self.grid_map):
            # rollback
            self._remove_obstacle(to_pos)
            self._place_obstacle(from_pos)
            return False

        return True

    def _remove_obstacle(self, pos: Position) -> None:
        self.grid_map.cells[pos] = CellType.EMPTY
        self.obstacles.remove(pos)
