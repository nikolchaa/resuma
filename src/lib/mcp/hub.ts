/**
 * Sessions of the MCP server that lets other AI apps work with Resuma.
 *
 * The app's HTTP endpoint (src-tauri/src/mcp.rs) handles the network side:
 * the token, header checks, sizes and session ids. Every JSON-RPC message it
 * receives is handed to `McpHub.receive` with its session id, and every reply
 * to a request goes back through `reply`. One SDK server runs per session, so
 * two clients connected at once never share state.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

type Id = string | number;

/** What happened to a message the endpoint passed on. */
export type Delivery = "delivered" | "unknownSession";

/** Transport for one session: messages come in through `deliver`, go out through `reply`. */
class SessionTransport implements Transport {
  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  constructor(
    readonly sessionId: string,
    private readonly reply: (id: Id, message: JSONRPCMessage) => void
  ) {}

  async start() {}

  async send(message: JSONRPCMessage) {
    // Only replies to requests can go back: the endpoint answers each POST
    // with its response and offers no stream for messages the server starts.
    if ("id" in message && message.id !== null && message.id !== undefined && !("method" in message)) {
      this.reply(message.id, message);
    }
  }

  async close() {
    this.onclose?.();
  }

  deliver(message: JSONRPCMessage) {
    this.onmessage?.(message);
  }
}

export class McpHub {
  private sessions = new Map<string, { server: McpServer; transport: SessionTransport }>();

  /**
   * @param createServer makes a fresh server (with its tools) for a new session
   * @param reply sends the reply to request `id` of `session` back to the endpoint
   */
  constructor(
    private readonly createServer: () => McpServer,
    private readonly reply: (session: string, id: Id, message: JSONRPCMessage) => void
  ) {}

  async receive(session: string, message: JSONRPCMessage): Promise<Delivery> {
    let entry = this.sessions.get(session);
    if (!entry) {
      // Sessions start with `initialize`; anything else belongs to a session
      // this window doesn't know (e.g. from before a reload), and the client
      // has to start over.
      if (!("method" in message) || message.method !== "initialize") return "unknownSession";
      const transport = new SessionTransport(session, (id, m) => this.reply(session, id, m));
      const server = this.createServer();
      await server.connect(transport);
      entry = { server, transport };
      this.sessions.set(session, entry);
    }
    entry.transport.deliver(message);
    return "delivered";
  }

  async end(session: string) {
    const entry = this.sessions.get(session);
    this.sessions.delete(session);
    await entry?.server.close();
  }

  async endAll() {
    await Promise.all([...this.sessions.keys()].map((s) => this.end(s)));
  }

  get sessionCount() {
    return this.sessions.size;
  }
}
