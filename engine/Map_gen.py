from enum import Enum
from dataclasses import dataclass
from typing import Dict, Tuple
from rich.console import Console
console = Console(markup=True)
def get_int(prompt: str) -> int:
    while True:
        try:
            return int(input(prompt))
        except ValueError:
            print("Please enter a valid integer.")
# -----------------------------
# Cell types for the grid
# -----------------------------
class CellType(Enum):
    EMPTY = "O"
    START = "S"
    END = "E"
    OBSTACLE = "X"
# -----------------------------
# Map data container
# -----------------------------
@dataclass
class GridMap:
    width: int
    height: int
    cells: Dict[Tuple[int, int], CellType]
    start: Tuple[int, int]
    end: Tuple[int, int]

    def in_bounds(self, x: int, y: int) -> bool:
        return 0 <= x < self.width and 0 <= y < self.height
    def __repr__(self):
        return f"GridMap({self.width}x{self.height}, start={self.start}, end={self.end}, obstacles={sum(1 for c in self.cells.values() if c.name=='OBSTACLE')})"

# -----------------------------
# Map generator
# -----------------------------
def generate_map(width: int, height: int) -> GridMap:
    if width < 2 or height < 2:
        raise ValueError("Map must be at least 2x2")

    cells = {}

    # Initialize all cells as EMPTY
    for x in range(width):
        for y in range(height):
            cells[(x, y)] = CellType.EMPTY
    start = (0,0)
    end = (width-1,height-1)
    #The below code is reserved for later
    # Fixed but sensible defaults (easy to change later)
    #start_x = get_int("Enter start x coordinate:")
    #start_y = get_int("Enter start y coordinate:")
    #start = (start_x, start_y)

    #while True:
    #    end_x = get_int("Enter end x coordinate:")
    #    end_y = get_int("Enter end y coordinate:")
    #    if start != (end_x, end_y):
    #        end = (end_x, end_y)
    #        break
    #    else:
    #        print("The start and end cannot be on the same position")    

            
    cells[start] = CellType.START
    cells[end] = CellType.END

    return GridMap(
        width=width,
        height=height,
        cells=cells,
        start=start,
        end=end
    )


# -----------------------------
# Rich renderer (visual only)
# -----------------------------
def render_map(grid_map: GridMap, robot=None) -> None:
    for y in reversed(range(grid_map.height)):
        row = []
        for x in range(grid_map.width):
            pos = (x, y)

            # 🤖 Robot has highest priority here
            

            if robot is not None and pos == robot:
                row.append("[bold blue]R[/bold blue]")
                continue

            cell = grid_map.cells[pos]

            if cell == CellType.OBSTACLE:
                row.append("[yellow]X[/yellow]")
            elif cell == CellType.START:
                row.append("[green]S[/green]")
            elif cell == CellType.END:
                row.append("[red]E[/red]")
            else:
                row.append("[dim]O[/dim]")

        console.print(" ".join(row))
# -----------------------------
# Example usage
# -----------------------------
if __name__ == "__main__":
    game_map = generate_map(width=get_int("Enter map width:"), height=get_int("Enter map height:"))
    render_map(game_map)
