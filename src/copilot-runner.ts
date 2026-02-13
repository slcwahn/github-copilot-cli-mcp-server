/**
 * Copilot CLI Runner
 *
 * GitHub Copilot CLI를 실행하고 출력을 캡처합니다.
 * child_process.spawn을 기본으로 사용하고, PTY가 필요한 경우 선택적으로 사용합니다.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { stripAnsi } from "./utils.js";

export interface CopilotRunOptions {
  /** 프롬프트 텍스트 */
  prompt: string;
  /** 사용할 AI 모델 */
  model?: string;
  /** 추가 허용 도구 목록 */
  allowTools?: string[];
  /** 모든 도구 자동 승인 */
  allowAllTools?: boolean;
  /** 추가 디렉토리 접근 허용 */
  addDirs?: string[];
  /** 작업 디렉토리 */
  cwd?: string;
  /** 타임아웃 (밀리초) */
  timeoutMs?: number;
  /** 세션 재개 ID */
  resumeSessionId?: string;
  /** 사용자 질문 비활성화 (자율 모드) */
  noAskUser?: boolean;
}

export interface CopilotRunResult {
  /** Copilot CLI 출력 텍스트 */
  output: string;
  /** 세션 ID (재개용) */
  sessionId?: string;
  /** 종료 코드 */
  exitCode: number;
  /** 실행 시간 (밀리초) */
  durationMs: number;
}

/** 캐시된 Copilot CLI 경로 */
let _cachedCopilotPath: string | undefined;

/**
 * Copilot CLI 실행 경로를 찾습니다.
 */
function findCopilotPath(): string {
  if (_cachedCopilotPath) return _cachedCopilotPath;

  // 환경 변수로 직접 지정 가능
  if (
    process.env.COPILOT_CLI_PATH &&
    existsSync(process.env.COPILOT_CLI_PATH)
  ) {
    _cachedCopilotPath = process.env.COPILOT_CLI_PATH;
    return _cachedCopilotPath;
  }

  // 일반적인 설치 경로들을 시도
  const knownPaths = [
    "/opt/homebrew/bin/copilot",
    "/usr/local/bin/copilot",
    "/usr/bin/copilot",
  ];

  for (const p of knownPaths) {
    if (existsSync(p)) {
      _cachedCopilotPath = p;
      return _cachedCopilotPath;
    }
  }

  // which 명령으로 찾기
  try {
    const result = execSync("which copilot", { encoding: "utf-8" }).trim();
    if (result && existsSync(result)) {
      _cachedCopilotPath = result;
      return _cachedCopilotPath;
    }
  } catch {
    // which 실패
  }

  // gh copilot 방식도 시도
  try {
    const homedir = process.env.HOME || process.env.USERPROFILE || "";
    const ghCopilotPath = `${homedir}/.local/share/gh/copilot`;
    if (existsSync(ghCopilotPath)) {
      _cachedCopilotPath = ghCopilotPath;
      return _cachedCopilotPath;
    }
  } catch {
    // 무시
  }

  // 최후의 시도
  _cachedCopilotPath = "copilot";
  return _cachedCopilotPath;
}

/**
 * Copilot 출력에서 세션 ID를 추출합니다.
 * Copilot CLI는 세션 ID를 로그에 출력할 수 있습니다.
 */
function extractSessionId(output: string): string | undefined {
  const patterns = [
    /Session (?:ID|id)[:\s]+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    /session[_-]state\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

/**
 * Copilot CLI 명령어 인수를 구성합니다.
 */
function buildArgs(options: CopilotRunOptions): string[] {
  const {
    prompt,
    model,
    allowTools = [],
    allowAllTools = true,
    addDirs = [],
    resumeSessionId,
    noAskUser = true,
  } = options;

  const args: string[] = [];

  // 세션 재개 또는 새 프롬프트
  if (resumeSessionId) {
    args.push("--resume", resumeSessionId);
    args.push("-p", prompt);
  } else {
    args.push("-p", prompt);
  }

  // silent 모드 (통계 없이 응답만)
  args.push("-s");

  // 모델 선택
  if (model) {
    args.push("--model", model);
  }

  // 도구 자동 승인
  if (allowAllTools) {
    args.push("--allow-all-tools");
  }

  // 개별 도구 허용
  for (const tool of allowTools) {
    args.push("--allow-tool", tool);
  }

  // 추가 디렉토리
  for (const dir of addDirs) {
    args.push("--add-dir", dir);
  }

  // 사용자 질문 비활성화
  if (noAskUser) {
    args.push("--no-ask-user");
  }

  // 커스텀 지시 비활성화 (MCP 서버 자체의 AGENTS.md 방지)
  args.push("--no-custom-instructions");

  // 색상 비활성화
  args.push("--no-color");

  // alt-screen 비활성화
  args.push("--no-alt-screen");

  return args;
}

/**
 * child_process.spawn을 통해 Copilot CLI를 실행합니다.
 */
export async function runCopilot(
  options: CopilotRunOptions
): Promise<CopilotRunResult> {
  const { cwd, timeoutMs = 300_000 } = options;

  const copilotPath = findCopilotPath();
  const args = buildArgs(options);

  return new Promise<CopilotRunResult>((resolve, reject) => {
    const startTime = Date.now();
    let stdout = "";
    let stderr = "";
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    let proc: ChildProcess;

    try {
      proc = spawn(copilotPath, args, {
        cwd: cwd || process.cwd(),
        env: {
          ...process.env,
          NO_COLOR: "1",
          TERM: "dumb",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      reject(
        new Error(
          `Failed to spawn Copilot CLI at '${copilotPath}': ${error instanceof Error ? error.message : String(error)}`
        )
      );
      return;
    }

    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("error", (error) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(
        new Error(
          `Copilot CLI process error: ${error.message}`
        )
      );
    });

    proc.on("close", (code) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);

      const durationMs = Date.now() - startTime;
      const exitCode = code ?? -1;

      // stdout + stderr 결합 (stderr에 유용한 정보가 있을 수 있음)
      const rawOutput = stdout || stderr;
      const cleanOutput = stripAnsi(rawOutput).trim();

      // 세션 ID 추출 시도 (stderr에도 있을 수 있음)
      const sessionId =
        extractSessionId(stderr) || extractSessionId(stdout);

      resolve({
        output: cleanOutput || "(no output)",
        sessionId,
        exitCode,
        durationMs,
      });
    });

    // 타임아웃 설정
    timeoutHandle = setTimeout(() => {
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (!proc.killed) proc.kill("SIGKILL");
      }, 5000);

      const durationMs = Date.now() - startTime;
      resolve({
        output:
          stripAnsi(stdout + stderr).trim() +
          `\n\n[TIMEOUT: Process killed after ${timeoutMs}ms]`,
        exitCode: -1,
        durationMs,
      });
    }, timeoutMs);
  });
}

/**
 * Copilot CLI 사용 가능 여부를 확인합니다.
 */
export async function checkCopilotAvailable(): Promise<{
  available: boolean;
  version?: string;
  path?: string;
  error?: string;
}> {
  const copilotPath = findCopilotPath();

  return new Promise((resolve) => {
    try {
      const proc = spawn(copilotPath, ["--version"], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let output = "";
      proc.stdout?.on("data", (d: Buffer) => {
        output += d.toString();
      });
      proc.stderr?.on("data", (d: Buffer) => {
        output += d.toString();
      });

      proc.on("error", (error) => {
        resolve({
          available: false,
          error: `Copilot CLI not found at '${copilotPath}': ${error.message}`,
        });
      });

      proc.on("close", (code) => {
        if (code === 0) {
          const version = stripAnsi(output).trim().split("\n")[0];
          resolve({ available: true, version, path: copilotPath });
        } else {
          resolve({
            available: false,
            error: `Copilot CLI exited with code ${code}: ${output.trim()}`,
          });
        }
      });

      setTimeout(() => {
        proc.kill();
        resolve({
          available: false,
          error: "Timeout checking Copilot CLI",
        });
      }, 10_000);
    } catch (error) {
      resolve({
        available: false,
        error: `Failed to check Copilot CLI: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  });
}
