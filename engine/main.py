# main.py

from Map_gen import generate_map, render_map, get_int
from Obstacles import ObstacleManager
from pathfinding import path_exists
from user_side_game import UserSide
from robot import Robot


def print_status(robot: Robot, user: UserSide):
    print(f"Robot battery: {robot.battery}")
    print(f"User turns taken: {user.turn_counter}")
    print("-" * 40)


if __name__ == "__main__":

    # -----------------------------
    # 1. Create map
    # -----------------------------
    width = get_int("Enter map width: ")
    height = get_int("Enter map height: ")
    game_map = generate_map(width=width, height=height)

    print("\nInitial empty map:")
    render_map(game_map)

    # -----------------------------
    # 2. Managers & controllers
    # -----------------------------
    obstacle_manager = ObstacleManager(game_map)
    user = UserSide(game_map, obstacle_manager)

    # -----------------------------
    # 3. User initial placement
    # -----------------------------
    total_cells = width * height
    max_obstacles =int(total_cells * 0.12)

    while True:
        print("You can place atmost",max_obstacles,"obstacles in this",width,"*",height,"map")
        n = get_int("Enter number of obstacles to place: ")
        if n <= max_obstacles:
            user.initial_placement(n, path_exists)
            break
    print("\nMap after initial placement:")
    render_map(game_map)

    # -----------------------------
    # 4. Create robot
    # -----------------------------
    robot = Robot(game_map)

    print("\nRobot spawned at start.")
    render_map(game_map)
    print_status(robot, user)

    # -----------------------------
    # 5. Main game loop
    # -----------------------------
    while True:

        # ---- Robot turn ----
        moved = robot.move()

        print("\nRobot moved to",robot.position)
        render_map(game_map,robot.position)
        print_status(robot, user)

        if robot.reached_end():
            print("🤖 Robot reached the end. Robot wins!")
            break

        if robot.battery <= 0 or not moved:
            print("🧑 User drained the robot battery. User wins!")
            break

        # ---- User turn ----
        print("\nUser turn:")
        user.user_turn(path_exists,robot.position)

        print("\nMap after user move:")
        render_map(game_map,robot.position)
        print_status(robot, user)

