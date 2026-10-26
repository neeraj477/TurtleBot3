import { describe, expect, it, vi } from "vitest";
import { RosbridgeClient, type WebSocketLike } from "./rosbridge";

class FakeSocket implements WebSocketLike {
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

async function connected() {
  const sock = new FakeSocket();
  const client = new RosbridgeClient("ws://test", () => sock);
  const p = client.connect();
  sock.open();
  await p;
  return { sock, client };
}

describe("RosbridgeClient", () => {
  it("subscribes and dispatches published messages", async () => {
    const { sock, client } = await connected();
    const handler = vi.fn();
    const unsubscribe = client.subscribe("/odom", "nav_msgs/msg/Odometry", handler, { throttleRate: 50 });
    expect(sock.sent[0]).toMatchObject({ op: "subscribe", topic: "/odom", type: "nav_msgs/msg/Odometry", throttle_rate: 50 });
    sock.receive({ op: "publish", topic: "/odom", msg: { a: 1 } });
    expect(handler).toHaveBeenCalledWith({ a: 1 });
    unsubscribe();
    expect(sock.sent[1]).toMatchObject({ op: "unsubscribe", topic: "/odom" });
    sock.receive({ op: "publish", topic: "/odom", msg: { a: 2 } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("advertises once before publishing", async () => {
    const { sock, client } = await connected();
    client.publish("/goal_pose", "geometry_msgs/msg/PoseStamped", { x: 1 });
    client.publish("/goal_pose", "geometry_msgs/msg/PoseStamped", { x: 2 });
    expect(sock.sent.map((m) => m.op)).toEqual(["advertise", "publish", "publish"]);
  });

  it("resolves and rejects service calls", async () => {
    const { sock, client } = await connected();
    const ok = client.callService("/amcl/get_state", {}, "lifecycle_msgs/srv/GetState");
    const okId = sock.sent[0].id;
    sock.receive({ op: "service_response", id: okId, result: true, values: { current_state: { id: 3 } } });
    await expect(ok).resolves.toEqual({ current_state: { id: 3 } });

    const bad = client.callService("/missing", {});
    sock.receive({ op: "service_response", id: sock.sent[1].id, result: false, values: "Service /missing does not exist" });
    await expect(bad).rejects.toThrow("does not exist");
  });

  it("routes action feedback, results and unsupported-op errors", async () => {
    const { sock, client } = await connected();
    const onFeedback = vi.fn();
    const onResult = vi.fn();
    const id = client.sendActionGoal("/navigate_to_pose", "nav2_msgs/action/NavigateToPose", {}, { onFeedback, onResult });
    expect(sock.sent[0]).toMatchObject({ op: "send_action_goal", action: "/navigate_to_pose", feedback: true });
    sock.receive({ op: "action_feedback", id, values: { distance_remaining: 2 } });
    sock.receive({ op: "action_result", id, values: {}, status: 4, result: true });
    expect(onFeedback).toHaveBeenCalledWith({ distance_remaining: 2 });
    expect(onResult).toHaveBeenCalledWith({}, 4, true);

    const onError = vi.fn();
    const id2 = client.sendActionGoal("/navigate_to_pose", "nav2_msgs/action/NavigateToPose", {}, { onError });
    sock.receive({ op: "status", level: "error", id: id2, msg: "Unknown operation: send_action_goal" });
    expect(onError).toHaveBeenCalledWith("Unknown operation: send_action_goal");
  });

  it("rejects pending calls when the socket closes", async () => {
    const { sock, client } = await connected();
    const onClose = vi.fn();
    client.onClose(onClose);
    const p = client.callService("/rosapi/topics");
    sock.onclose?.({ code: 1006 });
    await expect(p).rejects.toThrow("Connection lost");
    expect(onClose).toHaveBeenCalled();
  });
});
