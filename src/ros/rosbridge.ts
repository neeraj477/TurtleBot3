/**
 * Minimal client for the rosbridge v2 protocol (rosbridge_suite, ROS 2).
 *
 * Supports topics, services and — on rosbridge versions that implement them —
 * the action operations `send_action_goal` / `cancel_action_goal`.
 * Protocol reference: https://github.com/RobotWebTools/rosbridge_suite/blob/ros2/ROSBRIDGE_PROTOCOL.md
 */

type Json = Record<string, unknown>;

export type MessageHandler<T = unknown> = (msg: T) => void;

export interface SubscribeOptions {
  /** Minimum time between messages in ms (rosbridge `throttle_rate`). */
  throttleRate?: number;
  /** rosbridge `queue_length`. */
  queueLength?: number;
}

export interface ActionGoalHandlers<F = unknown, R = unknown> {
  onFeedback?: (feedback: F) => void;
  /** `status` is the action_msgs/GoalStatus code reported by rosbridge (4 = succeeded, 5 = canceled, 6 = aborted). */
  onResult?: (result: R | null, status: number | null, ok: boolean) => void;
  /** Called when rosbridge reports an error for this goal request (e.g. unsupported op). */
  onError?: (message: string) => void;
}

export interface RosbridgeStatus {
  level: string;
  msg: string;
  id?: string;
}

interface PendingCall {
  resolve: (values: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class RosbridgeError extends Error {}

export interface WebSocketLike {
  readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  send(data: string): void;
  close(): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

const OPEN = 1;

export class RosbridgeClient {
  private ws: WebSocketLike | null = null;
  private counter = 0;
  private readonly pending = new Map<string, PendingCall>();
  private readonly topicHandlers = new Map<string, Map<string, MessageHandler>>();
  private readonly advertised = new Set<string>();
  private readonly actionGoals = new Map<string, ActionGoalHandlers>();
  private closeListeners = new Set<(reason: string) => void>();
  private statusListeners = new Set<(status: RosbridgeStatus) => void>();

  constructor(
    readonly url: string,
    private readonly factory: WebSocketFactory = (u) => new WebSocket(u) as unknown as WebSocketLike,
  ) {}

  get isOpen(): boolean {
    return this.ws?.readyState === OPEN;
  }

  connect(timeoutMs = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let ws: WebSocketLike;
      try {
        ws = this.factory(this.url);
      } catch (err) {
        reject(new RosbridgeError(`Invalid rosbridge URL "${this.url}": ${(err as Error).message}`));
        return;
      }
      this.ws = ws;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        ws.close();
        reject(new RosbridgeError(`Timed out connecting to ${this.url}`));
      }, timeoutMs);

      ws.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      ws.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new RosbridgeError(`Could not connect to rosbridge at ${this.url}`));
      };
      ws.onclose = (ev) => {
        clearTimeout(timer);
        const reason = ev?.reason || `connection closed (code ${ev?.code ?? "?"})`;
        this.handleClosed(reason);
        if (!settled) {
          settled = true;
          reject(new RosbridgeError(`Could not connect to rosbridge at ${this.url}: ${reason}`));
        }
      };
      ws.onmessage = (ev) => this.handleMessage(ev.data);
    });
  }

  close(): void {
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      ws.close();
    }
    this.handleClosed("closed by client", false);
  }

  onClose(listener: (reason: string) => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  onStatus(listener: (status: RosbridgeStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  subscribe<T>(topic: string, type: string, handler: MessageHandler<T>, opts: SubscribeOptions = {}): () => void {
    const id = this.nextId(`subscribe:${topic}`);
    let handlers = this.topicHandlers.get(topic);
    if (!handlers) {
      handlers = new Map();
      this.topicHandlers.set(topic, handlers);
    }
    handlers.set(id, handler as MessageHandler);
    this.send({
      op: "subscribe",
      id,
      topic,
      type,
      throttle_rate: opts.throttleRate ?? 0,
      queue_length: opts.queueLength ?? 1,
    });
    return () => {
      handlers?.delete(id);
      if (this.isOpen) this.send({ op: "unsubscribe", id, topic });
    };
  }

  publish(topic: string, type: string, msg: Json): void {
    if (!this.advertised.has(topic)) {
      this.send({ op: "advertise", id: this.nextId(`advertise:${topic}`), topic, type });
      this.advertised.add(topic);
    }
    this.send({ op: "publish", topic, msg });
  }

  callService<T = Json>(service: string, args: Json = {}, type?: string, timeoutMs = 5000): Promise<T> {
    if (!this.isOpen) return Promise.reject(new RosbridgeError("Not connected to rosbridge"));
    const id = this.nextId(`call_service:${service}`);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RosbridgeError(`Service ${service} timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      const msg: Json = { op: "call_service", id, service, args };
      if (type) msg.type = type;
      this.send(msg);
    });
  }

  /** Sends an action goal using rosbridge's `send_action_goal` op. Returns the goal request id. */
  sendActionGoal<F = unknown, R = unknown>(
    action: string,
    actionType: string,
    args: Json,
    handlers: ActionGoalHandlers<F, R>,
  ): string {
    const id = this.nextId(`send_action_goal:${action}`);
    this.actionGoals.set(id, handlers as ActionGoalHandlers);
    this.send({ op: "send_action_goal", id, action, action_type: actionType, args, feedback: true });
    return id;
  }

  cancelActionGoal(action: string, id: string): void {
    this.send({ op: "cancel_action_goal", id, action });
  }

  private nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}:${this.counter}`;
  }

  private send(msg: Json): void {
    if (!this.ws || this.ws.readyState !== OPEN) throw new RosbridgeError("Not connected to rosbridge");
    this.ws.send(JSON.stringify(msg));
  }

  private handleClosed(reason: string, notify = true): void {
    for (const [id, call] of this.pending) {
      clearTimeout(call.timer);
      call.reject(new RosbridgeError(`Connection lost before ${id} completed`));
    }
    this.pending.clear();
    for (const handlers of this.actionGoals.values()) handlers.onError?.("Connection lost");
    this.actionGoals.clear();
    this.topicHandlers.clear();
    this.advertised.clear();
    if (notify) for (const l of this.closeListeners) l(reason);
  }

  /** Exposed for tests. */
  handleMessage(raw: unknown): void {
    if (typeof raw !== "string") return; // binary (CBOR/PNG) encodings are not requested by this client
    let msg: Json;
    try {
      msg = JSON.parse(raw) as Json;
    } catch {
      return;
    }
    switch (msg.op) {
      case "publish": {
        const handlers = this.topicHandlers.get(msg.topic as string);
        if (handlers) for (const h of handlers.values()) h(msg.msg);
        break;
      }
      case "service_response": {
        const call = this.pending.get(msg.id as string);
        if (!call) break;
        this.pending.delete(msg.id as string);
        clearTimeout(call.timer);
        if (msg.result === false) {
          call.reject(new RosbridgeError(typeof msg.values === "string" ? msg.values : `Service ${String(msg.service)} failed`));
        } else {
          call.resolve(msg.values ?? {});
        }
        break;
      }
      case "action_feedback": {
        this.actionGoals.get(msg.id as string)?.onFeedback?.(msg.values);
        break;
      }
      case "action_result": {
        const handlers = this.actionGoals.get(msg.id as string);
        if (!handlers) break;
        this.actionGoals.delete(msg.id as string);
        const status = typeof msg.status === "number" ? msg.status : null;
        handlers.onResult?.((msg.values as Json) ?? null, status, msg.result !== false);
        break;
      }
      case "status": {
        const status: RosbridgeStatus = {
          level: String(msg.level ?? "info"),
          msg: String(msg.msg ?? ""),
          id: msg.id as string | undefined,
        };
        if (status.id && status.level === "error") {
          const goal = this.actionGoals.get(status.id);
          if (goal) {
            this.actionGoals.delete(status.id);
            goal.onError?.(status.msg);
          }
          const call = this.pending.get(status.id);
          if (call) {
            this.pending.delete(status.id);
            clearTimeout(call.timer);
            call.reject(new RosbridgeError(status.msg));
          }
        }
        for (const l of this.statusListeners) l(status);
        break;
      }
      default:
        break;
    }
  }
}
