/**
 * Copilot CLI Runner
 *
 * GitHub Copilot CLI를 실행하고 출력을 캡처합니다.
 * - Autonomous 모드: child_process.spawn으로 실행, --allow-all-tools 사용
 * - Interactive 모드: PTY(node-pty)로 실행, 권한 질문을 감지하여 MCP 클라이언트에 전달
 */

import { spawn, type ChildProcess } from "node:child_process";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { stripAnsi } from "./utils.js";
import {
  type PermissionMode,
  getPermissionMode,
  pendingInputManager,
} from "./permission-handler.js";

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
  /** 권한 모드 (도구 호출 시 명시적 지정) */
  permissionMode?: PermissionMode;
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
  /** Interactive 모드에서 입력 대기 중인 경우 */
  needsInput?: boolean;
  /** 대기 중인 질문 */
  pendingQuestion?: string;
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
 * Copilot CLI 스크립트가 Node.js shebang 스크립트인지 확인합니다.
 * shebang이 `#!/usr/bin/env node` 또는 `#!/path/to/node`인 경우 true를 반환합니다.
 */
function isNodeScript(filePath: string): boolean {
  try {
    const fd = readFileSync(filePath, { encoding: "utf-8", flag: "r" });
    const firstLine = fd.split("\n")[0] || "";
    return /^#!.*\bnode\b/.test(firstLine);
  } catch {
    return false;
  }
}

/**
 * spawn에 전달할 실행 커맨드와 인수 prefix를 결정합니다.
 *
 * MCP 환경에서는 PATH가 제한되어 `#!/usr/bin/env node` shebang이
 * node를 찾지 못해 ENOENT 오류가 발생할 수 있습니다.
 * 이를 방지하기 위해 Node.js 스크립트인 경우 `process.execPath`(현재 node)로
 * 직접 실행합니다.
 *
 * @returns [command, argPrefix] — spawn(command, [...argPrefix, ...args])
 */
export function resolveCopilotCommand(copilotPath: string): [string, string[]] {
  if (isNodeScript(copilotPath)) {
    // Node.js 스크립트: process.execPath로 직접 실행
    return [process.execPath, [copilotPath]];
  }
  // 네이티브 바이너리 또는 기타: 직접 실행
  return [copilotPath, []];
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
 * Copilot 출력에서 권한 질문을 감지합니다.
 * Copilot CLI는 파일 수정, 셸 명령 등에 대해 Y/N 질문을 합니다.
 */
function detectPermissionQuestion(output: string): string | undefined {
  const cleanOutput = stripAnsi(output);

  // 일반적인 Copilot 권한 질문 패턴들
  const patterns = [
    // Y/N 질문 패턴
    /([^\n]*\?\s*(?:\[Y\/n\]|\[y\/N\]|\(y\/n\)|\(Y\/N\)))\s*$/i,
    // "Allow" / "Permit" / "Do you want" 패턴
    /([^\n]*(?:Allow|Permit|Do you want|Would you like|Shall I|Can I|May I)[^\n]*\?)\s*$/i,
    // "modify" / "edit" / "write" / "delete" / "execute" / "run" 패턴
    /([^\n]*(?:modify|edit|write|delete|remove|execute|run|create)[^\n]*\?)\s*$/i,
  ];

  for (const pattern of patterns) {
    const match = cleanOutput.match(pattern);
    if (match) {
      return match[1].trim();
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
    permissionMode,
  } = options;

  const effectiveMode = permissionMode || getPermissionMode();
  const isAutonomous = effectiveMode === "autonomous";

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

  // 권한 모드에 따른 도구 승인 설정
  if (isAutonomous) {
    // Autonomous: 모든 도구 자동 승인
    if (allowAllTools) {
      args.push("--allow-all-tools");
    }
    // 개별 도구 허용
    for (const tool of allowTools) {
      args.push("--allow-tool", tool);
    }
    // 사용자 질문 비활성화
    if (noAskUser) {
      args.push("--no-ask-user");
    }
  } else {
    // Interactive: 개별 도구만 허용 (전체 자동 승인 안 함)
    for (const tool of allowTools) {
      args.push("--allow-tool", tool);
    }
    // ask_user는 유지 (Copilot이 질문할 수 있도록)
  }

  // 작업 디렉토리를 --add-dir로 추가 (Copilot CLI에 --cwd 옵션이 없으므로)
  // cwd가 지정된 경우, Copilot이 해당 디렉토리의 파일에 접근할 수 있도록 함
  if (options.cwd && !addDirs.includes(options.cwd)) {
    args.push("--add-dir", options.cwd);
  }

  // 추가 디렉토리
  for (const dir of addDirs) {
    args.push("--add-dir", dir);
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
 * node-pty를 동적으로 로드합니다 (optional dependency).
 */
async function loadNodePty(): Promise<typeof import("node-pty") | null> {
  try {
    return await import("node-pty");
  } catch {
    return null;
  }
}

/**
 * Interactive 모드: PTY를 통해 Copilot CLI를 실행합니다.
 * 권한 질문을 감지하면 MCP 클라이언트에 전달하고 응답을 기다립니다.
 */
async function runCopilotInteractive(
  options: CopilotRunOptions
): Promise<CopilotRunResult> {
  const { cwd, timeoutMs = 300_000 } = options;

  const nodePty = await loadNodePty();
  if (!nodePty) {
    // node-pty가 없으면 autonomous 폴백
    console.error(
      "node-pty not available. Falling back to autonomous mode."
    );
    return runCopilotAutonomous({
      ...options,
      permissionMode: "autonomous",
    });
  }

  const copilotPath = findCopilotPath();
  const [command, argPrefix] = resolveCopilotCommand(copilotPath);
  const args = buildArgs(options);

  return new Promise<CopilotRunResult>((resolve) => {
    const startTime = Date.now();
    let output = "";
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    // 질문 감지 상태
    let questionCheckInterval: ReturnType<typeof setInterval> | undefined;
    let lastOutputLength = 0;
    let stableCount = 0;

    const sessionId =
      options.resumeSessionId ||
      `pty-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const ptyProcess = nodePty.spawn(command, [...argPrefix, ...args], {
      name: "xterm",
      cols: 120,
      rows: 40,
      cwd: cwd || process.cwd(),
      env: {
        ...process.env,
        NO_COLOR: "1",
        TERM: "dumb",
      } as Record<string, string>,
    });

    ptyProcess.onData((data: string) => {
      output += data;
    });

    // 출력이 안정화되면 질문인지 확인
    questionCheckInterval = setInterval(async () => {
      if (output.length === lastOutputLength) {
        stableCount++;
        // 출력이 1초 이상 안정화되면 질문 감지 시도
        if (stableCount >= 4) {
          const question = detectPermissionQuestion(output);
          if (question) {
            // 질문 감지됨 — 입력 대기
            try {
              const response = await pendingInputManager.waitForInput(
                sessionId,
                question,
                timeoutMs
              );
              // 사용자 응답을 PTY에 전달
              ptyProcess.write(response + "\n");
              stableCount = 0;
              lastOutputLength = output.length;
            } catch {
              // 타임아웃 또는 취소 — 프로세스 종료
              ptyProcess.kill();
            }
          }
        }
      } else {
        stableCount = 0;
        lastOutputLength = output.length;
      }
    }, 250);

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (questionCheckInterval) clearInterval(questionCheckInterval);

      const durationMs = Date.now() - startTime;
      const cleanOutput = stripAnsi(output).trim();
      const detectedSessionId = extractSessionId(output);

      // 대기 중인 입력이 있으면 취소
      pendingInputManager.cancel(sessionId);

      resolve({
        output: cleanOutput || "(no output)",
        sessionId: detectedSessionId || options.resumeSessionId,
        exitCode: exitCode ?? -1,
        durationMs,
      });
    });

    // 타임아웃 설정
    timeoutHandle = setTimeout(() => {
      if (questionCheckInterval) clearInterval(questionCheckInterval);
      ptyProcess.kill();

      const durationMs = Date.now() - startTime;
      resolve({
        output:
          stripAnsi(output).trim() +
          `\n\n[TIMEOUT: Process killed after ${timeoutMs}ms]`,
        exitCode: -1,
        durationMs,
      });
    }, timeoutMs);

    // 초기 질문 감지를 위한 1회성 체크 (프로세스 시작 직후)
    setTimeout(() => {
      const pending = pendingInputManager.getPending(sessionId);
      if (pending) {
        // 이미 대기 중이면 needsInput을 포함한 부분 결과 반환
        // (실제로는 MCP 프로토콜에서 progress notification을 보내야 함)
      }
    }, 3000);
  });
}

/**
 * Autonomous 모드: child_process.spawn으로 Copilot CLI를 실행합니다.
 */
async function runCopilotAutonomous(
  options: CopilotRunOptions
): Promise<CopilotRunResult> {
  const { cwd, timeoutMs = 300_000 } = options;

  const copilotPath = findCopilotPath();
  const [command, argPrefix] = resolveCopilotCommand(copilotPath);
  const args = buildArgs(options);

  return new Promise<CopilotRunResult>((resolve, reject) => {
    const startTime = Date.now();
    let stdout = "";
    let stderr = "";
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    let proc: ChildProcess;

    try {
      proc = spawn(command, [...argPrefix, ...args], {
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
        new Error(`Copilot CLI process error: ${error.message}`)
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
 * Copilot CLI를 실행합니다.
 * 권한 모드에 따라 autonomous 또는 interactive 모드로 실행합니다.
 */
export async function runCopilot(
  options: CopilotRunOptions
): Promise<CopilotRunResult> {
  const effectiveMode =
    options.permissionMode || getPermissionMode();

  if (effectiveMode === "interactive") {
    return runCopilotInteractive(options);
  }
  return runCopilotAutonomous(options);
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
  const [command, argPrefix] = resolveCopilotCommand(copilotPath);

  return new Promise((resolve) => {
    try {
      const proc = spawn(command, [...argPrefix, "--version"], {
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
