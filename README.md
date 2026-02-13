# github-copilot-cli-mcp-server

> ⚠️ **ALPHA VERSION** — This project is experimental and in early development. Testing across different environments is limited. Use at your own risk and expect breaking changes.

A Node.js/TypeScript project that wraps GitHub Copilot CLI as a Model Context Protocol (MCP) server.

Use Copilot CLI as a tool from any MCP-compatible client (VSCode, OpenClaw, Claude Desktop, etc.).

## Features

- **Complete Copilot conversations in a single MCP call**: Send a prompt → receive results in one tool call
- **Session resumption**: Continue previous conversations using session IDs
- **Permission mode selection**: Interactive (user confirmation) / Autonomous (auto-approve)
- **Model selection**: Use any model supported by Copilot
- **Working directory specification**: Set cwd for tasks that require file access

## Prerequisites

- **Node.js** 20.0.0 or higher
- **GitHub Copilot CLI** installed and authenticated
  ```bash
  npm install -g @github/copilot-cli
  ```
- **GitHub Copilot subscription** (Individual, Business, or Enterprise)

## Installation

### From source

```bash
git clone https://github.com/slcwahn/github-copilot-cli-mcp-server.git
cd github-copilot-cli-mcp-server
npm install
npm run build
```

### Quick start

```bash
npm run dev
```

## MCP Tools

### `run_copilot_conversation`

Runs a Copilot CLI conversation with a prompt.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `prompt` | string | ✅ | Prompt to send to Copilot |
| `model` | string | | AI model (e.g., `claude-sonnet-4`, `gpt-4.1`) |
| `cwd` | string | | Working directory |
| `allow_tools` | string[] | | List of tools to allow |
| `add_dirs` | string[] | | Additional directories to grant access |
| `timeout_ms` | number | | Timeout (default: 300000ms = 5 minutes) |
| `permission_mode` | string | | Permission mode: `"autonomous"` (default) or `"interactive"` |

**Example:**

```json
{
  "name": "run_copilot_conversation",
  "arguments": {
    "prompt": "Fix the bug in src/main.ts",
    "cwd": "/path/to/project",
    "model": "claude-sonnet-4"
  }
}
```

### `resume_copilot_session`

Resumes a previous session to continue the conversation.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `session_id` | string | ✅ | Session ID (UUID) |
| `prompt` | string | ✅ | Follow-up prompt |
| `model` | string | | AI model |
| `cwd` | string | | Working directory |
| `timeout_ms` | number | | Timeout |

**Example:**

```json
{
  "name": "resume_copilot_session",
  "arguments": {
    "session_id": "abc12345-1234-5678-9abc-def012345678",
    "prompt": "Now add tests for those changes"
  }
}
```

### `list_copilot_sessions`

Lists resumable Copilot CLI sessions.

### `respond_to_copilot`

Responds to Copilot's permission prompts in Interactive mode.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `session_id` | string | ✅ | Pending session ID |
| `response` | string | ✅ | Response (`"yes"`, `"no"`, or free text) |

## Configuration

### VSCode

Add the following to your `.vscode/mcp.json` file:

```json
{
  "servers": {
    "github-copilot-cli": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/github-copilot-cli-mcp-server/dist/index.js"],
      "env": {
        "COPILOT_PERMISSION_MODE": "interactive"
      }
    }
  }
}
```

Or use the Command Palette: **MCP: Add Server** → **stdio** → enter the configuration above.

> **Tip**: Use `${workspaceFolder}` to specify relative paths based on your workspace.

For global configuration, use the Command Palette: **MCP: Open User Configuration** to add it to your user profile.

### OpenClaw (mcporter)

[OpenClaw](https://openclaw.ai) supports MCP servers through the `mcporter` skill.

#### Register via mcporter CLI

```bash
# Register the server
mcporter config add github-copilot-cli \
  --command node \
  --arg /path/to/github-copilot-cli-mcp-server/dist/index.js \
  --env COPILOT_PERMISSION_MODE=autonomous

# Verify registration
mcporter list

# Check tool schema
mcporter list github-copilot-cli --schema

# Call a tool directly
mcporter call github-copilot-cli.run_copilot_conversation prompt="Fix the bug in main.ts"
```

#### Edit mcporter config file directly

`~/.mcporter/mcporter.json` or project-level `config/mcporter.json`:

```json
{
  "servers": {
    "github-copilot-cli": {
      "transport": "stdio",
      "command": "node",
      "args": ["/path/to/github-copilot-cli-mcp-server/dist/index.js"],
      "env": {
        "COPILOT_PERMISSION_MODE": "autonomous"
      }
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "github-copilot-cli": {
      "command": "node",
      "args": ["/path/to/github-copilot-cli-mcp-server/dist/index.js"]
    }
  }
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COPILOT_CLI_PATH` | (auto-detect) | Path to Copilot CLI binary |
| `COPILOT_PERMISSION_MODE` | `autonomous` | Permission mode: `autonomous` or `interactive` |

## Permission Handling

Copilot CLI may request user approval for file modifications, shell command execution, and other actions. This MCP server supports two permission modes:

### Autonomous Mode (default)

```
COPILOT_PERMISSION_MODE=autonomous
```

- Runs Copilot CLI with `--allow-all-tools --no-ask-user` flags
- Auto-approves all permissions and completes without user prompts
- **Best for**: Trusted tasks, automation pipelines, CI/CD

### Interactive Mode

```
COPILOT_PERMISSION_MODE=interactive
```

- Runs Copilot CLI with PTY for interactive I/O
- Returns `needsInput: true` in the MCP response when a permission prompt is detected
- The MCP client (user or agent) responds via the `respond_to_copilot` tool

**Interactive Mode Flow:**

```
MCP Client                    MCP Server                   Copilot CLI
    │                              │                            │
    │ run_copilot_conversation     │                            │
    ├─────────────────────────────►│  spawn (PTY)               │
    │                              ├───────────────────────────►│
    │                              │                            │
    │                              │  "Modify this file?"       │
    │                              │◄───────────────────────────┤
    │  { needsInput: true,         │                            │
    │    question: "Modify..." }   │                            │
    │◄─────────────────────────────┤                            │
    │                              │                            │
    │  respond_to_copilot("yes")   │                            │
    ├─────────────────────────────►│  write "yes\n"             │
    │                              ├───────────────────────────►│
    │                              │                            │
    │                              │  (complete)                │
    │                              │◄───────────────────────────┤
    │  { output: "..." }           │                            │
    │◄─────────────────────────────┤                            │
```

> **Note**: Interactive mode requires `node-pty` (optional dependency). If not installed, it automatically falls back to autonomous mode.

## Architecture

```
MCP Client (VSCode / OpenClaw / Claude Desktop)
    │
    │ stdio (JSON-RPC)
    ▼
┌──────────────────────────────────────────────┐
│   github-copilot-cli-mcp-server              │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  MCP Server (stdio)                    │  │
│  │  - run_copilot_conversation            │  │
│  │  - resume_copilot_session              │  │
│  │  - list_copilot_sessions               │  │
│  │  - respond_to_copilot                  │  │
│  └──────────────┬─────────────────────────┘  │
│                 │                             │
│  ┌──────────────▼─────────────────────────┐  │
│  │  Permission Handler                    │  │
│  │  (autonomous / interactive)            │  │
│  └──────────────┬─────────────────────────┘  │
│                 │                             │
│  ┌──────────────▼─────────────────────────┐  │
│  │  Copilot Runner                        │  │
│  │  (spawn / PTY)                         │  │
│  └──────────────┬─────────────────────────┘  │
│                 │                             │
│  ┌──────────────▼─────────────────────────┐  │
│  │  Session Manager                       │  │
│  │  (session metadata + pending input)    │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
    │
    │ spawn / PTY
    ▼
  copilot -p "prompt" -s [--allow-all-tools | interactive]
```

## Development

```bash
# Development mode
npm run dev

# Build
npm run build

# Type check
npm run typecheck

# Test
npm test
```

## How It Works

1. The MCP client calls the `run_copilot_conversation` tool
2. Depending on the permission mode:
   - **Autonomous**: Runs `copilot -p "<prompt>" -s --allow-all-tools --no-ask-user`
   - **Interactive**: Runs with PTY, forwarding permission prompts to the MCP client
3. Copilot CLI performs the task (code generation, modification, analysis, etc.)
4. Returns the output as an MCP response upon completion
5. If a session ID is available, the session can be resumed via `resume_copilot_session`

## Copilot CLI Options Used

| Flag | Purpose |
|------|---------|
| `-p <prompt>` | Run prompt in non-interactive mode |
| `-s` | Silent mode (response only, no stats) |
| `--allow-all-tools` | Auto-approve all tools (autonomous mode) |
| `--no-ask-user` | Autonomous operation without prompts (autonomous mode) |
| `--no-custom-instructions` | Ignore AGENTS.md and similar files |
| `--no-color` | Disable ANSI colors |
| `--no-alt-screen` | Disable terminal alternate screen |
| `--resume <id>` | Resume a session |
| `--model <model>` | Select a model |
| `--add-dir <dir>` | Grant access to additional directories |

## License

MIT

## References

- [GitHub Copilot CLI](https://github.com/github/copilot-cli)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [VSCode MCP Server Setup](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
- [Similar project (Python)](https://github.com/wminson/copilot-mcp-server)
