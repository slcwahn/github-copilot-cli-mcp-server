# github-copilot-cli-mcp-server

GitHub Copilot CLI를 Model Context Protocol (MCP) 서버로 래핑하는 Node.js/TypeScript 프로젝트입니다.

MCP를 지원하는 모든 클라이언트(VSCode, OpenClaw, Claude Desktop 등)에서 Copilot CLI를 도구로 사용할 수 있습니다.

## Features

- **단일 MCP 호출로 Copilot 대화 완료**: 프롬프트 전송 → 결과 수신을 하나의 도구 호출로
- **세션 재개**: 이전 세션 ID로 대화 이어가기
- **권한 모드 선택**: Interactive(사용자 확인) / Autonomous(자동 승인)
- **모델 선택**: Copilot이 지원하는 모든 모델 사용 가능
- **작업 디렉토리 지정**: 파일 접근이 필요한 작업에 cwd 지정 가능

## Prerequisites

- **Node.js** 20.0.0 이상
- **GitHub Copilot CLI** 설치 및 인증 완료
  ```bash
  # gh를 통한 설치
  gh copilot

  # 또는 직접 설치
  # https://github.com/github/copilot-cli
  ```
- **GitHub Copilot 구독** (Individual, Business, or Enterprise)

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

프롬프트로 Copilot CLI 대화를 실행합니다.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `prompt` | string | ✅ | Copilot에 보낼 프롬프트 |
| `model` | string | | AI 모델 (e.g., `claude-sonnet-4`, `gpt-4.1`) |
| `cwd` | string | | 작업 디렉토리 |
| `allow_tools` | string[] | | 허용할 도구 목록 |
| `add_dirs` | string[] | | 추가 접근 허용 디렉토리 |
| `timeout_ms` | number | | 타임아웃 (기본: 300000ms = 5분) |
| `permission_mode` | string | | 권한 모드: `"autonomous"` (기본) 또는 `"interactive"` |

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

이전 세션을 재개하여 대화를 이어갑니다.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `session_id` | string | ✅ | 세션 ID (UUID) |
| `prompt` | string | ✅ | 후속 프롬프트 |
| `model` | string | | AI 모델 |
| `cwd` | string | | 작업 디렉토리 |
| `timeout_ms` | number | | 타임아웃 |

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

재개 가능한 Copilot CLI 세션 목록을 보여줍니다.

### `respond_to_copilot`

Interactive 모드에서 Copilot의 권한 질문에 응답합니다.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `session_id` | string | ✅ | 대기 중인 세션 ID |
| `response` | string | ✅ | 응답 (`"yes"`, `"no"`, 또는 자유 텍스트) |

## Configuration

### VSCode

`.vscode/mcp.json` 파일에 다음을 추가합니다:

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

또는 Command Palette에서 **MCP: Add Server** → **stdio** → 위 설정을 입력합니다.

> **Tip**: `${workspaceFolder}`를 사용하면 워크스페이스 기준 상대 경로를 지정할 수 있습니다.

전역 설정은 Command Palette에서 **MCP: Open User Configuration**으로 사용자 프로필에 추가합니다.

### OpenClaw (mcporter)

[OpenClaw](https://openclaw.ai)는 `mcporter` 스킬을 통해 MCP 서버를 지원합니다.

#### mcporter CLI로 등록

```bash
# 서버 등록
mcporter config add github-copilot-cli \
  --command node \
  --arg /path/to/github-copilot-cli-mcp-server/dist/index.js \
  --env COPILOT_PERMISSION_MODE=autonomous

# 등록 확인
mcporter list

# 도구 스키마 확인
mcporter list github-copilot-cli --schema

# 도구 직접 호출
mcporter call github-copilot-cli.run_copilot_conversation prompt="Fix the bug in main.ts"
```

#### mcporter 설정 파일 직접 편집

`~/.mcporter/mcporter.json` 또는 프로젝트의 `config/mcporter.json`:

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

`claude_desktop_config.json`에 추가:

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
| `COPILOT_CLI_PATH` | (auto-detect) | Copilot CLI 바이너리 경로 |
| `COPILOT_PERMISSION_MODE` | `autonomous` | 권한 모드: `autonomous` 또는 `interactive` |

## Permission Handling

Copilot CLI는 파일 수정, 셸 명령 실행 등에 대해 사용자 승인을 요청할 수 있습니다. 이 MCP 서버는 두 가지 권한 모드를 지원합니다:

### Autonomous 모드 (기본)

```
COPILOT_PERMISSION_MODE=autonomous
```

- `--allow-all-tools --no-ask-user` 플래그로 Copilot CLI 실행
- 모든 권한을 자동 승인하고 사용자 질문 없이 완료
- **적합한 경우**: 신뢰할 수 있는 작업, 자동화 파이프라인, CI/CD

### Interactive 모드

```
COPILOT_PERMISSION_MODE=interactive
```

- Copilot CLI를 PTY로 실행하여 대화형 입출력 유지
- 권한 요청 시 MCP 응답에 `needsInput: true`를 포함하여 반환
- MCP 클라이언트(사용자 또는 에이전트)가 `respond_to_copilot` 도구로 응답

**Interactive 모드 흐름:**

```
MCP Client                    MCP Server                   Copilot CLI
    │                              │                            │
    │ run_copilot_conversation     │                            │
    ├─────────────────────────────►│  spawn (PTY)               │
    │                              ├───────────────────────────►│
    │                              │                            │
    │                              │  "파일을 수정하시겠습니까?" │
    │                              │◄───────────────────────────┤
    │  { needsInput: true,         │                            │
    │    question: "파일을 수정..." }│                            │
    │◄─────────────────────────────┤                            │
    │                              │                            │
    │  respond_to_copilot("yes")   │                            │
    ├─────────────────────────────►│  write "yes\n"             │
    │                              ├───────────────────────────►│
    │                              │                            │
    │                              │  (완료)                     │
    │                              │◄───────────────────────────┤
    │  { output: "..." }           │                            │
    │◄─────────────────────────────┤                            │
```

> **Note**: Interactive 모드는 `node-pty` (optional dependency)가 필요합니다. 설치되지 않은 경우 자동으로 autonomous 모드로 폴백합니다.

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
# 개발 모드
npm run dev

# 빌드
npm run build

# 타입 체크
npm run typecheck

# 테스트
npm test
```

## How It Works

1. MCP 클라이언트가 `run_copilot_conversation` 도구를 호출
2. 권한 모드에 따라:
   - **Autonomous**: `copilot -p "<prompt>" -s --allow-all-tools --no-ask-user` 실행
   - **Interactive**: PTY로 실행, 권한 질문 감지 시 MCP 클라이언트에 전달
3. Copilot CLI가 작업 수행 (코드 생성, 수정, 분석 등)
4. 완료 후 출력을 MCP 응답으로 반환
5. 세션 ID가 있으면 `resume_copilot_session`으로 재개 가능

## Copilot CLI Options Used

| Flag | Purpose |
|------|---------|
| `-p <prompt>` | 비대화형 모드로 프롬프트 실행 |
| `-s` | Silent 모드 (통계 없이 응답만) |
| `--allow-all-tools` | 모든 도구 자동 승인 (autonomous 모드) |
| `--no-ask-user` | 질문 없이 자율 동작 (autonomous 모드) |
| `--no-custom-instructions` | AGENTS.md 등 무시 |
| `--no-color` | ANSI 색상 비활성화 |
| `--no-alt-screen` | 터미널 대체 화면 비활성화 |
| `--resume <id>` | 세션 재개 |
| `--model <model>` | 모델 선택 |
| `--add-dir <dir>` | 추가 디렉토리 접근 |

## License

MIT

## References

- [GitHub Copilot CLI](https://github.com/github/copilot-cli)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [VSCode MCP Server Setup](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
- [Similar project (Python)](https://github.com/wminson/copilot-mcp-server)
