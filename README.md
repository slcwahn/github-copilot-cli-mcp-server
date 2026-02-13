# copilot-cli-mcp-server

GitHub Copilot CLI를 Model Context Protocol (MCP) 서버로 래핑하는 Node.js/TypeScript 프로젝트입니다.

OpenClaw 에이전트가 Copilot CLI를 MCP 도구로 사용할 수 있게 합니다.

## Features

- **단일 MCP 호출로 Copilot 대화 완료**: 프롬프트 전송 → 결과 수신을 하나의 도구 호출로
- **세션 재개**: 이전 세션 ID로 대화 이어가기
- **자율 모드**: `--no-ask-user`로 중간 질문 없이 자동 완료
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
git clone https://github.com/slcwahn/copilot-cli-mcp-server.git
cd copilot-cli-mcp-server
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
| `no_ask_user` | boolean | | 자율 모드 (기본: true) |

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

## Configuration

### MCP Client (OpenClaw / Claude Desktop)

`mcp-config.json`에 추가:

```json
{
  "mcpServers": {
    "copilot-cli": {
      "command": "node",
      "args": ["/path/to/copilot-cli-mcp-server/dist/index.js"]
    }
  }
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COPILOT_CLI_PATH` | (auto-detect) | Copilot CLI 바이너리 경로 |

## Architecture

```
MCP Client (OpenClaw/Claude)
    │
    │ stdio (JSON-RPC)
    ▼
┌───────────────────────────────┐
│   copilot-cli-mcp-server      │
│                               │
│  ┌─────────────────────────┐  │
│  │  MCP Server (stdio)     │  │
│  │  - run_copilot_conversation │
│  │  - resume_copilot_session   │
│  │  - list_copilot_sessions    │
│  └───────────┬─────────────┘  │
│              │                │
│  ┌───────────▼─────────────┐  │
│  │  Copilot Runner         │  │
│  │  (child_process.spawn)  │  │
│  └───────────┬─────────────┘  │
│              │                │
│  ┌───────────▼─────────────┐  │
│  │  Session Manager        │  │
│  │  (session metadata)     │  │
│  └─────────────────────────┘  │
└───────────────────────────────┘
    │
    │ spawn
    ▼
  copilot -p "prompt" -s --allow-all-tools
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
2. MCP 서버가 `copilot -p "<prompt>" -s --allow-all-tools --no-ask-user` 실행
3. Copilot CLI가 작업 수행 (코드 생성, 수정, 분석 등)
4. 완료 후 출력을 MCP 응답으로 반환
5. 세션 ID가 있으면 `resume_copilot_session`으로 재개 가능

## Copilot CLI Options Used

| Flag | Purpose |
|------|---------|
| `-p <prompt>` | 비대화형 모드로 프롬프트 실행 |
| `-s` | Silent 모드 (통계 없이 응답만) |
| `--allow-all-tools` | 모든 도구 자동 승인 |
| `--no-ask-user` | 질문 없이 자율 동작 |
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
- [Similar project (Python)](https://github.com/wminson/copilot-mcp-server)
