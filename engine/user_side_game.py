# user_side.py

from typing import Tuple, Set
from rich.console import Console
from Map_gen import GridMap, CellType
from Obstacles import ObstacleManager
from robot import Robot

Position = Tuple[int, int]


class UserSide:
    def __init__(self, grid_map: GridMap, obstacle_manager: ObstacleManager):
        self.grid_map = grid_map
        self.obstacles = obstacle_manager
        self.cursor: Position = (0, 0)
        self.turn_counter = 0
        self.console = Console()
        self.last_obstacle_move = None


    # -----------------------------
    # Cursor helpers
    # -----------------------------
    def _move_cursor(self, dx: int, dy: int):
        x, y = self.cursor
        nx, ny = x + dx, y + dy
        if self.grid_map.in_bounds(nx, ny):
            self.cursor = (nx, ny)

    def _render_with_cursor(self, preview: Set[Position] = None,robot = None):
        preview = preview or set()

        for y in reversed(range(self.grid_map.height)):
            row = []
            for x in range(self.grid_map.width):
                pos = (x, y)
                if robot is not None and pos == robot:
                    row.append("[bold blue]R[/bold blue]")
                    continue
                elif pos in preview:
                    row.append("[magenta]X[/magenta]")
                elif pos == self.cursor:
                    row.append("[bold cyan]C[/bold cyan]")
                else:
                    cell = self.grid_map.cells[pos]
                    if cell == CellType.START:
                        row.append("[green]S[/green]")
                    elif cell == CellType.END:
                        row.append("[red]E[/red]")
                    elif cell == CellType.OBSTACLE:
                        row.append("[yellow]X[/yellow]")
                    else:
                        row.append("[dim]O[/dim]")
            self.console.print(" ".join(row))
        self.console.print()

    # -----------------------------
    # Initial placement
    # -----------------------------

    def initial_placement(self, n: int, path_exists_fn):
        while True:  # 🔁 ENTIRE placement retry loop
            preview_positions = set()
            self.cursor = (0, 0)

            # -------- placement phase --------
            while len(preview_positions) < n:
                self._render_with_cursor(preview_positions)
                key = input("w/a/s/d move | p place: ").lower()

                if key == "w":
                    self._move_cursor(0, 1)
                elif key == "a":
                    self._move_cursor(-1, 0)
                elif key == "s":
                    self._move_cursor(0, -1)
                elif key == "d":
                    self._move_cursor(1, 0)
                elif key == "p":
                    if (
                        self.grid_map.cells[self.cursor] == CellType.EMPTY
                        and self.cursor not in preview_positions
                    ):
                        preview_positions.add(self.cursor)
                    else:
                        print("Cannot place obstacle here.")
                else:
                    print("Invalid input.")

            # -------- confirmation phase --------
            self._render_with_cursor(preview_positions)

            while True:
                confirm = input("Confirm placement? (y/n): ").lower()

                if confirm == "y":
                    self.obstacles.place_initial_obstacles(
                        list(preview_positions),
                        path_exists_fn
                    )
                    print("Placement confirmed.")
                    return  # ✅ EXIT FUNCTION CLEANLY

                elif confirm == "n":
                    print("Placement cancelled. Restarting placement...")
                    break   # 🔁 break confirmation loop → restart placement

                else:
                    print("Invalid input. Please press 'y' or 'n'.")



    # -----------------------------
    # User turn (with preview + confirm)
    # -----------------------------
    def user_turn(self, path_exists_fn, robot_pos: Position):

        selected_obstacle: Position | None = None
        preview_target: Position | None = None

        while True:
            preview = set()
            if preview_target is not None:
                preview.add(preview_target)

            self._render_with_cursor(preview=preview, robot=robot_pos)

            if selected_obstacle is None:
                print("w/a/s/d move cursor | p select obstacle")
            else:
                print("w/a/s/d move obstacle | p confirm | q cancel")

            key = input("> ").lower()

            # -------------------------
            # CURSOR MODE
            # -------------------------
            if selected_obstacle is None:

                if key == "w":
                    self._move_cursor(0, 1)
                elif key == "a":
                    self._move_cursor(-1, 0)
                elif key == "s":
                    self._move_cursor(0, -1)
                elif key == "d":
                    self._move_cursor(1, 0)

                elif key == "p":
                    if self.grid_map.cells[self.cursor] == CellType.OBSTACLE:
                        selected_obstacle = self.cursor
                        preview_target = None
                    else:
                        print("No obstacle at cursor.")

                else:
                    print("Invalid input.")

            # -------------------------
            # OBSTACLE MOVE MODE
            # -------------------------
            else:
                if key == "q":
                    selected_obstacle = None
                    preview_target = None
                    continue

                if key not in {"w", "a", "s", "d", "p"}:
                    print("Invalid input.")
                    continue

                if key in {"w", "a", "s", "d"}:
                    dx, dy = {
                        "w": (0, 1),
                        "a": (-1, 0),
                        "s": (0, -1),
                        "d": (1, 0),
                    }[key]

                    candidate = (
                        selected_obstacle[0] + dx,
                        selected_obstacle[1] + dy,
                    )

                    preview_target = candidate

                elif key == "p":
                    if preview_target is None:
                        print("No move selected.")
                        continue

                    # ❌ prevent immediate reversal
                    if (
                        self.last_obstacle_move is not None
                        and selected_obstacle == self.last_obstacle_move[1]
                        and preview_target == self.last_obstacle_move[0]
                    ):
                        print("❌ You cannot immediately undo the previous obstacle move.")
                        preview_target = None
                        continue

                    moved = self.obstacles.move_obstacle(
                        selected_obstacle,
                        preview_target,
                        path_exists_fn
                    )

                    if moved:
                        self.turn_counter += 1
                        self.last_obstacle_move = (
                            selected_obstacle,
                            preview_target,
                        )
                        print("Obstacle moved.")
                        return
                    else:
                        print("Move invalid.")
                        preview_target = None

