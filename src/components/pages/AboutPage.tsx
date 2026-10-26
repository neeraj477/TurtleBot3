import { Info, Network } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { useSettings } from "@/data/settings";

export function AboutPage() {
  const s = useSettings();
  const t = s.topics;
  const interfaces: [string, string, string][] = [
    ["Map", t.map, "nav_msgs/msg/OccupancyGrid"],
    ["Robot pose", `${t.amclPose} + ${t.odom}`, "PoseWithCovarianceStamped, Odometry"],
    ["Global / local plan", `${t.globalPlan}, ${t.localPlan}`, "nav_msgs/msg/Path"],
    ["Navigation goal", s.navigateAction, "nav2_msgs/action/NavigateToPose (fallback: PoseStamped on " + t.goalPose + ")"],
    ["Goal status", `${s.navigateAction}/_action/status`, "action_msgs/msg/GoalStatusArray"],
    ["Cancel", `${s.navigateAction}/_action/cancel_goal`, "action_msgs/srv/CancelGoal"],
    ["Nav2 health", "/<node>/get_state, /lifecycle_manager_*/is_active", "lifecycle_msgs/srv/GetState, std_srvs/srv/Trigger"],
    ["Simulation", "/pause_physics, /unpause_physics, " + t.clock, "std_srvs/srv/Empty, rosgraph_msgs/msg/Clock"],
    ["Logs", t.rosout, "rcl_interfaces/msg/Log"],
    ["Battery", t.battery, "sensor_msgs/msg/BatteryState"],
  ];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <Panel icon={<Info />} title="About" bodyClassName="space-y-3 p-5 text-[14px] leading-relaxed text-[#c8d3e7]">
        <p>
          A web dashboard for a TurtleBot3 navigating with ROS 2, Gazebo and Nav2. It talks to the robot stack through{" "}
          <span className="font-mono text-[13px] text-fg">rosbridge_suite</span> over a WebSocket.
        </p>
        <p>
          <strong className="text-fg">Demo Mode</strong> runs a small simulator in the browser (A* planner, pure-pursuit controller,
          simulated lifecycle bringup) so the interface can be developed without ROS. Every panel shows a{" "}
          <span className="rounded border border-warn/40 bg-warn-soft px-1 text-[11px] font-semibold text-warn">DEMO</span> tag while it
          is active.
        </p>
        <p>
          <strong className="text-fg">Live mode</strong> shows only what the ROS graph reports. Missing topics stay empty or show
          “Unavailable”, and Nav2 components get a green check only when their lifecycle state is <em>active</em>.
        </p>
        <p className="text-fg-muted">Open Settings in the header to switch modes. Topic names are under Parameters.</p>
      </Panel>
      <Panel icon={<Network />} title="ROS 2 Interfaces Used" bodyClassName="overflow-x-auto p-4">
        <table className="w-full min-w-[560px] text-left text-[13px]">
          <thead className="text-fg-muted">
            <tr>
              <th className="pb-2 font-medium">Feature</th>
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Type</th>
            </tr>
          </thead>
          <tbody>
            {interfaces.map(([f, n, ty]) => (
              <tr key={f} className="border-t border-line">
                <td className="py-2 pr-3">{f}</td>
                <td className="py-2 pr-3 font-mono text-[12px] text-fg">{n}</td>
                <td className="py-2 font-mono text-[12px] text-fg-muted">{ty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
