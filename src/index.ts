#!/usr/bin/env node

/**
 * Copilot CLI MCP Server
 *
 * GitHub Copilot CLI를 MCP (Model Context Protocol) 서버로 래핑합니다.
 * OpenClaw 에이전트가 Copilot CLI를 MCP 도구로 사용할 수 있게 합니다.
 *
 * Transport: stdio (OpenClaw 통합용)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runCopilot } from "./copilot-runner.js";
import { SessionManager } from "./session-manager.js";

const sessionManager = new SessionManager();

// MCP 서버 생성
const server = new McpServer(
  {
    name: "copilot-cli-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      logging: {},
    },
  }
);

// ─────────────────────────────────────────────
// Tool 1: run_copilot_conversation
// ─────────────────────────────────────────────
server.tool(
  "run_copilot_conversation",
  "Execute a prompt with GitHub Copilot CLI. Runs Copilot in non-interactive mode (-p) with auto-approval. Returns the complete response. Use this for one-shot tasks like code generation, explanation, debugging, etc.",
  {
    prompt: z.string().describe("The prompt to send to Copilot CLI"),
    model: z
      .string()
      .optional()
      .describe(
        "AI model to use (e.g., claude-sonnet-4, gpt-4.1, claude-opus-4.5)"
      ),
    cwd: z
      .string()
      .optional()
      .describe(
        "Working directory for Copilot to operate in (for file access)"
      ),
    allow_tools: z
      .array(z.string())
      .optional()
      .describe(
        "Specific tools to allow (e.g., 'shell(git:*)', 'write'). If not set, all tools are allowed."
      ),
    add_dirs: z
      .array(z.string())
      .optional()
      .describe("Additional directories to allow Copilot to access"),
    timeout_ms: z
      .number()
      .optional()
      .describe("Timeout in milliseconds (default: 300000 = 5 minutes)"),
    no_ask_user: z
      .boolean()
      .optional()
      .describe(
        "Disable ask_user tool so Copilot works autonomously (default: true)"
      ),
  },
  async (args) => {
    try {
      const result = await runCopilot({
        prompt: args.prompt,
        model: args.model,
        cwd: args.cwd,
        allowTools: args.allow_tools,
        allowAllTools: !args.allow_tools || args.allow_tools.length === 0,
        addDirs: args.add_dirs,
        timeoutMs: args.timeout_ms,
        noAskUser: args.no_ask_user ?? true,
      });

      // 세션 ID가 있으면 등록
      if (result.sessionId) {
        sessionManager.registerSession(
          result.sessionId,
          args.prompt,
          args.model,
          args.cwd
        );
      }

      const metadata: string[] = [];
      if (result.sessionId) {
        metadata.push(`Session ID: ${result.sessionId}`);
      }
      metadata.push(`Duration: ${result.durationMs}ms`);
      metadata.push(`Exit code: ${result.exitCode}`);

      return {
        content: [
          {
            type: "text" as const,
            text: result.output,
          },
          {
            type: "text" as const,
            text: `\n---\n${metadata.join(" | ")}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error running Copilot CLI: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ─────────────────────────────────────────────
// Tool 2: resume_copilot_session
// ─────────────────────────────────────────────
server.tool(
  "resume_copilot_session",
  "Resume a previous Copilot CLI session by session ID. This continues an existing conversation with additional context or follow-up questions.",
  {
    session_id: z
      .string()
      .describe("The session ID (UUID) to resume"),
    prompt: z
      .string()
      .describe("Follow-up prompt or additional instructions"),
    model: z
      .string()
      .optional()
      .describe("AI model to use (overrides previous session model)"),
    cwd: z
      .string()
      .optional()
      .describe("Working directory (overrides previous session cwd)"),
    timeout_ms: z
      .number()
      .optional()
      .describe("Timeout in milliseconds (default: 300000 = 5 minutes)"),
  },
  async (args) => {
    try {
      // 세션 메타데이터 확인
      const sessionMeta = sessionManager.getSession(args.session_id);

      const result = await runCopilot({
        prompt: args.prompt,
        resumeSessionId: args.session_id,
        model: args.model || sessionMeta?.model,
        cwd: args.cwd || sessionMeta?.cwd,
        timeoutMs: args.timeout_ms,
        allowAllTools: true,
        noAskUser: true,
      });

      // 세션 사용 시간 업데이트
      sessionManager.touchSession(args.session_id);

      const metadata: string[] = [];
      metadata.push(`Session ID: ${args.session_id}`);
      metadata.push(`Duration: ${result.durationMs}ms`);
      metadata.push(`Exit code: ${result.exitCode}`);

      return {
        content: [
          {
            type: "text" as const,
            text: result.output,
          },
          {
            type: "text" as const,
            text: `\n---\n${metadata.join(" | ")}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error resuming Copilot session: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ─────────────────────────────────────────────
// Tool 3: list_copilot_sessions
// ─────────────────────────────────────────────
server.tool(
  "list_copilot_sessions",
  "List available Copilot CLI sessions that can be resumed.",
  {},
  async () => {
    try {
      const managedSessions = sessionManager.listSessions();
      const copilotSessions = sessionManager.listCopilotSessions();

      const lines: string[] = [];

      if (managedSessions.length > 0) {
        lines.push("## Managed Sessions (with metadata)");
        lines.push("");
        for (const session of managedSessions.slice(0, 20)) {
          lines.push(
            `- **${session.sessionId}**`
          );
          lines.push(`  - Prompt: ${session.initialPrompt.substring(0, 100)}${session.initialPrompt.length > 100 ? "..." : ""}`);
          lines.push(`  - Model: ${session.model || "default"}`);
          lines.push(`  - Created: ${session.createdAt}`);
          lines.push(`  - Last used: ${session.lastUsedAt}`);
          lines.push("");
        }
      }

      lines.push(`## All Copilot Sessions (${copilotSessions.length} total)`);
      lines.push("");
      // 최근 10개만 표시
      for (const sessionId of copilotSessions.slice(-10)) {
        const managed = managedSessions.find(
          (s) => s.sessionId === sessionId
        );
        lines.push(
          `- ${sessionId}${managed ? " ✓ (managed)" : ""}`
        );
      }

      return {
        content: [
          {
            type: "text" as const,
            text: lines.join("\n") || "No sessions found.",
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing sessions: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ─────────────────────────────────────────────
// 서버 시작
// ─────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Copilot CLI MCP Server started (stdio transport)");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
