import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess } from "node:child_process";

/**
 * MCP 서버 통합 테스트
 *
 * 실제 MCP 서버를 stdio로 실행하고 JSON-RPC 메시지를 보내 테스트합니다.
 */
describe("MCP Server Integration", () => {
  let serverProcess: ChildProcess;
  let responses: string[] = [];

  function sendMessage(msg: object): void {
    const json = JSON.stringify(msg);
    serverProcess.stdin?.write(json + "\n");
  }

  function waitForResponse(timeoutMs = 5000): Promise<object> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timeout waiting for response")),
        timeoutMs
      );

      const check = () => {
        if (responses.length > 0) {
          clearTimeout(timeout);
          const raw = responses.shift()!;
          try {
            resolve(JSON.parse(raw));
          } catch {
            resolve({ raw });
          }
          return;
        }
        setTimeout(check, 50);
      };
      check();
    });
  }

  beforeAll(() => {
    serverProcess = spawn("node", ["dist/index.js"], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let buffer = "";
    serverProcess.stdout?.on("data", (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.trim()) {
          responses.push(line.trim());
        }
      }
    });
  });

  afterAll(() => {
    serverProcess?.kill();
  });

  it("initializes successfully", async () => {
    sendMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
      },
    });

    const response = (await waitForResponse()) as {
      result?: { serverInfo?: { name?: string } };
    };
    expect(response.result?.serverInfo?.name).toBe(
      "github-copilot-cli-mcp-server"
    );
  });

  it("lists tools", async () => {
    sendMessage({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });

    sendMessage({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });

    const response = (await waitForResponse()) as {
      result?: { tools?: Array<{ name: string }> };
    };
    const toolNames =
      response.result?.tools?.map((t) => t.name) || [];
    expect(toolNames).toContain("run_copilot_conversation");
    expect(toolNames).toContain("resume_copilot_session");
    expect(toolNames).toContain("list_copilot_sessions");
    expect(toolNames).toContain("respond_to_copilot");
  });

  it("lists sessions without error", async () => {
    sendMessage({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "list_copilot_sessions",
        arguments: {},
      },
    });

    const response = (await waitForResponse()) as {
      result?: { content?: Array<{ type: string; text: string }> };
    };
    expect(response.result?.content).toBeDefined();
    expect(response.result?.content?.[0]?.type).toBe("text");
  });
});
