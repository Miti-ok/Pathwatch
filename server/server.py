from collections import deque
from typing import Dict, List, Optional, Set, Tuple, TypedDict
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from engine.Map_gen import CellType, GridMap
from engine.robot import Robot

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


Position = Tuple[int, int]


class MapData(BaseModel):
    width: int
    height: int
    start: List[int]
    end: List[int]
    obstacles: List[List[int]]


class LastMoveData(BaseModel):
    from_pos: List[int]
    to_pos: List[int]


class NextMoveRequest(BaseModel):
    session_id: str
    updated_map: MapData


class LegalObstacleMovesRequest(BaseModel):
    session_id: str
    updated_map: MapData
    obstacle: List[int]
    last_move: Optional[LastMoveData] = None


class MoveObstacleRequest(BaseModel):
    session_id: str
    updated_map: MapData
    from_pos: List[int]
    to_pos: List[int]
    last_move: Optional[LastMoveData] = None


class SessionState(TypedDict):
    robot: Robot
    max_battery: int


sessions: Dict[str, SessionState] = {}


@app.get("/ping")
def ping():
    return {"status": "alive"}


def _to_pos(raw: List[int], label: str) -> Position:
    if len(raw) != 2:
        raise HTTPException(status_code=400, detail=f"{label} must have exactly 2 values")
    return raw[0], raw[1]


def _in_bounds(pos: Position, width: int, height: int) -> bool:
    x, y = pos
    return 0 <= x < width and 0 <= y < height


def _validate_map_data(map_data: MapData) -> None:
    if map_data.width <= 0 or map_data.height <= 0:
        raise HTTPException(status_code=400, detail="width and height must be positive")

    start = _to_pos(map_data.start, "start")
    end = _to_pos(map_data.end, "end")

    if not _in_bounds(start, map_data.width, map_data.height):
        raise HTTPException(status_code=400, detail="start is out of bounds")
    if not _in_bounds(end, map_data.width, map_data.height):
        raise HTTPException(status_code=400, detail="end is out of bounds")
    if start == end:
        raise HTTPException(status_code=400, detail="start and end cannot be the same")

    seen: Set[Position] = set()
    for obs in map_data.obstacles:
        pos = _to_pos(obs, "obstacle")
        if not _in_bounds(pos, map_data.width, map_data.height):
            raise HTTPException(status_code=400, detail=f"obstacle out of bounds: {list(pos)}")
        if pos == start or pos == end:
            raise HTTPException(status_code=400, detail=f"obstacle cannot be on start/end: {list(pos)}")
        if pos in seen:
            raise HTTPException(status_code=400, detail=f"duplicate obstacle: {list(pos)}")
        seen.add(pos)


def build_gridmap(map_data: MapData) -> GridMap:
    _validate_map_data(map_data)

    cells = {}
    for x in range(map_data.width):
        for y in range(map_data.height):
            cells[(x, y)] = CellType.EMPTY

    start = _to_pos(map_data.start, "start")
    end = _to_pos(map_data.end, "end")

    cells[start] = CellType.START
    cells[end] = CellType.END

    for obs in map_data.obstacles:
        cells[_to_pos(obs, "obstacle")] = CellType.OBSTACLE

    return GridMap(
        width=map_data.width,
        height=map_data.height,
        cells=cells,
        start=start,
        end=end,
    )


def _path_exists(grid_map: GridMap) -> bool:
    queue = deque([grid_map.start])
    visited = {grid_map.start}

    while queue:
        x, y = queue.popleft()
        if (x, y) == grid_map.end:
            return True

        for nx, ny in [
            (x + 1, y),
            (x - 1, y),
            (x, y + 1),
            (x, y - 1),
        ]:
            if not grid_map.in_bounds(nx, ny):
                continue
            if (nx, ny) in visited:
                continue
            if grid_map.cells[(nx, ny)] == CellType.OBSTACLE:
                continue

            visited.add((nx, ny))
            queue.append((nx, ny))

    return False


def _is_immediate_reverse(
    from_pos: Position,
    to_pos: Position,
    last_move: Optional[LastMoveData],
) -> bool:
    if last_move is None:
        return False

    return (
        from_pos == _to_pos(last_move.to_pos, "last_move.to_pos")
        and to_pos == _to_pos(last_move.from_pos, "last_move.from_pos")
    )


def _compute_legal_obstacle_moves(
    map_data: MapData,
    obstacle_pos: Position,
    robot_pos: Position,
    last_move: Optional[LastMoveData],
) -> List[List[int]]:
    _validate_map_data(map_data)

    obstacles = {_to_pos(obs, "obstacle") for obs in map_data.obstacles}
    if obstacle_pos not in obstacles:
        return []

    start = _to_pos(map_data.start, "start")
    end = _to_pos(map_data.end, "end")

    x, y = obstacle_pos
    neighbors = [
        (x + 1, y),
        (x - 1, y),
        (x, y + 1),
        (x, y - 1),
    ]

    legal_moves: List[List[int]] = []

    for to_pos in neighbors:
        nx, ny = to_pos

        if not _in_bounds(to_pos, map_data.width, map_data.height):
            continue
        if to_pos == start or to_pos == end or to_pos == robot_pos:
            continue
        if to_pos in obstacles:
            continue
        if _is_immediate_reverse(obstacle_pos, to_pos, last_move):
            continue

        candidate_obstacles = set(obstacles)
        candidate_obstacles.remove(obstacle_pos)
        candidate_obstacles.add(to_pos)

        candidate_map = MapData(
            width=map_data.width,
            height=map_data.height,
            start=map_data.start,
            end=map_data.end,
            obstacles=[list(pos) for pos in candidate_obstacles],
        )

        if _path_exists(build_gridmap(candidate_map)):
            legal_moves.append([nx, ny])

    return legal_moves


@app.post("/start-game")
def start_game(map_data: MapData):
    grid_map = build_gridmap(map_data)
    robot = Robot(grid_map)
    robot.battery = 21
    max_battery = 21
    moved = robot.move()

    session_id = str(uuid4())
    reached_end = robot.reached_end()
    game_over = reached_end or (not moved)
    winner = "robot" if reached_end else ("user" if game_over else None)

    sessions[session_id] = {
        "robot": robot,
        "max_battery": max_battery,
    }

    return {
        "session_id": session_id,
        "robot_position": robot.position,
        "battery": robot.battery,
        "max_battery": max_battery,
        "moved": moved,
        "reached_end": reached_end,
        "game_over": game_over,
        "winner": winner,
    }


@app.post("/next-move")
def next_move(payload: NextMoveRequest):
    session = sessions.get(payload.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    robot = session["robot"]
    updated_grid = build_gridmap(payload.updated_map)
    robot.grid_map = updated_grid
    robot.end = updated_grid.end

    moved = robot.move()
    reached_end = robot.reached_end()
    game_over = reached_end or (not moved)
    winner = "robot" if reached_end else ("user" if game_over else None)

    return {
        "session_id": payload.session_id,
        "robot_position": robot.position,
        "battery": robot.battery,
        "max_battery": session["max_battery"],
        "moved": moved,
        "reached_end": reached_end,
        "game_over": game_over,
        "winner": winner,
    }


@app.post("/legal-obstacle-moves")
def legal_obstacle_moves(payload: LegalObstacleMovesRequest):
    session = sessions.get(payload.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    robot = session["robot"]
    legal_moves = _compute_legal_obstacle_moves(
        map_data=payload.updated_map,
        obstacle_pos=_to_pos(payload.obstacle, "obstacle"),
        robot_pos=robot.position,
        last_move=payload.last_move,
    )

    return {"legal_moves": legal_moves}


@app.post("/move-obstacle")
def move_obstacle(payload: MoveObstacleRequest):
    session = sessions.get(payload.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    robot = session["robot"]
    from_pos = _to_pos(payload.from_pos, "from_pos")
    to_pos = _to_pos(payload.to_pos, "to_pos")

    legal_moves = _compute_legal_obstacle_moves(
        map_data=payload.updated_map,
        obstacle_pos=from_pos,
        robot_pos=robot.position,
        last_move=payload.last_move,
    )

    if [to_pos[0], to_pos[1]] not in legal_moves:
        raise HTTPException(status_code=400, detail="Illegal obstacle move")

    next_obstacles: List[List[int]] = []
    for obs in payload.updated_map.obstacles:
        pos = _to_pos(obs, "obstacle")
        if pos != from_pos:
            next_obstacles.append([pos[0], pos[1]])
    next_obstacles.append([to_pos[0], to_pos[1]])

    return {
        "updated_map": {
            "width": payload.updated_map.width,
            "height": payload.updated_map.height,
            "start": payload.updated_map.start,
            "end": payload.updated_map.end,
            "obstacles": next_obstacles,
        }
    }
