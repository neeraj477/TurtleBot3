# TurtleBot3 Navigation Dashboard

A web dashboard for a TurtleBot3 navigating autonomously with **ROS 2**, **Gazebo** and **Navigation2 (Nav2)**.
It connects to the robot stack through [rosbridge_suite](https://github.com/RobotWebTools/rosbridge_suite) over a WebSocket.

Built with React 18, TypeScript, Vite 6, Tailwind CSS 4, shadcn/ui-style components (Radix + CVA), Lucide icons and three.js.

**Live demo:** https://turtlebot3-dashboard.vercel.app (opens in Demo Mode, no ROS 2 needed)

## Two data sources

| | **Demo Mode** (default) | **Live mode** |
|---|---|---|
| Needs ROS 2? | No | Yes: rosbridge + Nav2 |
| Data | Simulated in the browser: A* planner, pure-pursuit controller, lifecycle bringup | Real topics, services and actions from the ROS graph |
| Labelling | Amber **DEMO** tags on every data panel and a "Demo Mode · Simulated Data" header pill | No tags. Missing data is shown as *Unavailable*, *N/A* or *Unknown* |

Switch with **Settings** in the header, the **Parameters** page, or the URL (`?mode=live`, `?mode=demo`).
Settings are saved in `localStorage`.

## Run the frontend

Requires Node.js 20+.

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run build      # type-check + production build to dist/
npm run preview    # serve the production build
npm run lint       # ESLint
npm run typecheck  # TypeScript only
npm test           # Vitest unit tests (rosbridge protocol client, planner, geometry)
```

## Deployment

The frontend is a static site deployed on **Vercel**: https://turtlebot3-dashboard.vercel.app

- Vercel detects Vite automatically: build command `npm run build`, output directory `dist`.
- To deploy manually from this folder: `npx vercel deploy --prod`.
- There is no backend to host. The only server the dashboard talks to is rosbridge, which runs on the machine running ROS 2.
- The deployed site is served over HTTPS, so browsers only allow a secure `wss://` rosbridge URL. The exception is `ws://localhost:9090` when the browser runs on the same machine as rosbridge. For a robot on another machine, put rosbridge behind TLS (a reverse proxy or a tunnel).

## Connect to ROS 2 (Live mode)

The commands below are for **ROS 2 Humble + Gazebo Classic**, the standard TurtleBot3 simulation setup.

```bash
sudo apt install ros-humble-rosbridge-suite ros-humble-navigation2 ros-humble-nav2-bringup \
                 ros-humble-turtlebot3 ros-humble-turtlebot3-simulations
export TURTLEBOT3_MODEL=burger

# 1. Simulation
ros2 launch turtlebot3_gazebo turtlebot3_world.launch.py

# 2. Nav2 with a saved map
ros2 launch turtlebot3_navigation2 navigation2.launch.py use_sim_time:=True map:=$HOME/map.yaml

# 3. rosbridge. This launch file also starts rosapi, which the dashboard uses to inspect the ROS graph.
ros2 launch rosbridge_server rosbridge_websocket_launch.xml
```

Then open the dashboard, go to **Settings → Live (ROS 2)**, enter `ws://<robot-host>:9090`, and press **Connect**.

Before the first goal, AMCL needs an initial pose. On the **Navigation** page, switch the target to **Initial pose**, click the robot's position on the map (drag to set its heading), and press **Set Initial Pose**. RViz's "2D Pose Estimate" works too.

Check that the interfaces the dashboard expects exist in your setup:

```bash
ros2 topic list -t          # /map, /odom, /amcl_pose, /plan, /local_plan, /rosout, /clock
ros2 action list -t         # /navigate_to_pose [nav2_msgs/action/NavigateToPose]
ros2 service list | grep -E "get_state|is_active|pause_physics"
```

If your names differ, change them on the **Parameters** page. In Live mode, a check mark next to each topic shows whether that topic was found in the ROS graph.

### What the dashboard uses

| Feature | Interface |
|---|---|
| Map (RViz panel and 3D view) | `/map` `nav_msgs/msg/OccupancyGrid` |
| Robot pose | `/amcl_pose` combined with `/odom` (the map→odom offset is estimated from the latest AMCL pose, so the pose stays smooth between AMCL updates). Without AMCL, the odom-frame pose is shown and labelled as such. |
| Paths | `/plan`, `/local_plan` `nav_msgs/msg/Path` (odom-frame paths are converted to the map frame) |
| Send goal | `/navigate_to_pose` `nav2_msgs/action/NavigateToPose` via rosbridge's `send_action_goal`. If this rosbridge version doesn't support action ops, it falls back to publishing `geometry_msgs/msg/PoseStamped` on `/goal_pose`, which `bt_navigator` turns into a NavigateToPose goal. |
| Goal state | `/navigate_to_pose/_action/status` `action_msgs/msg/GoalStatusArray` (also picks up goals sent from RViz) |
| Progress | `distance_remaining` from action feedback, or the remaining length of `/plan` when there is no feedback |
| Cancel | `cancel_action_goal`, or the `/navigate_to_pose/_action/cancel_goal` `action_msgs/srv/CancelGoal` service |
| Nav2 health | `/<node>/get_state` (`lifecycle_msgs/srv/GetState`) for amcl, map_server, costmaps, planner_server, controller_server and bt_navigator; `/lifecycle_manager_*/is_active` (`std_srvs/srv/Trigger`). Planner and controller plugin names come from `get_parameters`. A green check means the component reported **active**. |
| Pause / resume | Gazebo Classic `/pause_physics`, `/unpause_physics` (`std_srvs/srv/Empty`). The button is disabled when these services are absent. |
| Stop | Cancels the goal, then publishes zero velocity three times on `/cmd_vel` (`Twist` or `TwistStamped`, configurable) |
| Simulation time / status | `/clock`. The status shows *Running* while the clock advances, and *Paused* or *Clock Stalled* when it stops. |
| Battery | `/battery_state` `sensor_msgs/msg/BatteryState` (published on the real robot, not in Gazebo, so it shows N/A in simulation) |
| Logs | `/rosout` `rcl_interfaces/msg/Log`, split into Nav2 and Gazebo tabs by node name. The System tab holds the dashboard's own events. |
| Graph checks | rosapi: `/rosapi/topics`, `/rosapi/services`, `/rosapi/nodes`, `/rosapi/get_ros_version` |

The dashboard reconnects automatically with backoff (1–15 s) and shows a **Retry now** button while disconnected.

### Notes for other setups

- **Jazzy / Gazebo Harmonic (gz sim):** gz sim has no `/pause_physics` service, so Pause stays disabled. TurtleBot3 on Jazzy may use `TwistStamped` on `/cmd_vel`; set that on the Parameters page. The local plan topic depends on the controller plugin.
- **Map rotation:** rotated map origins are drawn axis-aligned, and the dashboard logs a warning when it receives one.
- **Security:** rosbridge has no authentication. Expose it only on a trusted network, or put it behind an authenticating proxy (`wss://`).

## The Gazebo Simulation panel

The browser can't show Gazebo's own render output without extra infrastructure (gzweb or a video stream), so this panel is a 3D rendering of data:

- **Live mode:** the real `/map` occupancy grid, extruded into walls, with the live robot pose, global and local plans, and the goal.
- **Demo Mode:** the simulated warehouse (shelves, table, workbench, blocks), driven by the in-browser simulator.

You can orbit, zoom, switch between 3D, Top and Follow views, save a screenshot, and go fullscreen. In **Click on Map** mode, clicking the floor fills the goal X/Y. On the RViz panel, click-and-drag also sets the yaw.

## Project structure

```
src/
  ros/rosbridge.ts            rosbridge v2 protocol client (topics, services, actions)
  data/
    types.ts, store.ts        dashboard state + tiny external store
    settings.ts               persisted settings (mode, URL, topic names)
    controller.ts             owns the active data source
    telemetry.ts              progress / distance / time / speed metrics (shared by both sources)
    nav2.ts                   Nav2 component list, status/lifecycle/log mappings
    live/LiveRosSource.ts     Live mode
    demo/                     Demo Mode world, A* planner, simulator
  components/
    ui/                       Button, Badge, Panel, Input, Dialog, Sparkline
    dashboard/                DashboardHeader, Sidebar, GazeboSimulationPanel, RVizMapPanel,
                              NavigationControls, RobotStatusCard, Nav2HealthPanel,
                              LogsConsole, NavigationMetricCards, SettingsDialog
    pages/                    Overview, Simulation, Navigation, Map & RViz, Logs, Parameters, About
```

## Verification status

- `npm run build`, `npm run lint` and `npm test` pass (11 unit tests).
- Demo Mode was exercised in headless Chrome: map-click and drag goal selection, input validation, send/cancel, pause/resume, log tabs, page navigation and the settings dialog.
- Live mode was exercised against a **mock rosbridge server** written to the rosbridge v2 protocol. Covered: graph discovery, lifecycle health (including an inactive node), action goals with feedback and result, the topic fallback with CancelGoal, pause, and disconnect handling.
- It has **not** yet been run against a real ROS 2 / Nav2 installation, because none was available in the development environment. Test against your stack before relying on it.
