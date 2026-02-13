/**
 * 세션 매니저
 *
 * Copilot CLI 세션을 관리합니다.
 * Copilot CLI 자체적으로 ~/.copilot/session-state/에 세션을 저장하므로
 * 이 모듈은 세션 ID 매핑과 메타데이터만 관리합니다.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface SessionMetadata {
  /** 세션 ID (Copilot CLI UUID) */
  sessionId: string;
  /** 세션 생성 시간 */
  createdAt: string;
  /** 마지막 사용 시간 */
  lastUsedAt: string;
  /** 초기 프롬프트 */
  initialPrompt: string;
  /** 사용된 모델 */
  model?: string;
  /** 작업 디렉토리 */
  cwd?: string;
}

export class SessionManager {
  private sessionsDir: string;
  private sessions: Map<string, SessionMetadata> = new Map();

  constructor(sessionsDir?: string) {
    this.sessionsDir =
      sessionsDir || path.join(os.tmpdir(), "openclaw", "copilot_sessions");
    this.ensureDir();
    this.loadSessions();
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  private loadSessions(): void {
    try {
      const metaFile = path.join(this.sessionsDir, "sessions.json");
      if (fs.existsSync(metaFile)) {
        const data = JSON.parse(fs.readFileSync(metaFile, "utf-8"));
        if (Array.isArray(data)) {
          for (const session of data) {
            this.sessions.set(session.sessionId, session);
          }
        }
      }
    } catch {
      // 파일 없으면 무시
    }
  }

  private saveSessions(): void {
    try {
      const metaFile = path.join(this.sessionsDir, "sessions.json");
      const data = Array.from(this.sessions.values());
      fs.writeFileSync(metaFile, JSON.stringify(data, null, 2), "utf-8");
    } catch {
      // 저장 실패 무시
    }
  }

  /**
   * 새 세션을 등록합니다.
   */
  registerSession(
    sessionId: string,
    prompt: string,
    model?: string,
    cwd?: string
  ): SessionMetadata {
    const now = new Date().toISOString();
    const metadata: SessionMetadata = {
      sessionId,
      createdAt: now,
      lastUsedAt: now,
      initialPrompt: prompt,
      model,
      cwd,
    };
    this.sessions.set(sessionId, metadata);
    this.saveSessions();
    return metadata;
  }

  /**
   * 세션 사용 시간을 업데이트합니다.
   */
  touchSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastUsedAt = new Date().toISOString();
      this.saveSessions();
    }
  }

  /**
   * 세션 정보를 가져옵니다.
   */
  getSession(sessionId: string): SessionMetadata | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 모든 세션 목록을 반환합니다.
   */
  listSessions(): SessionMetadata[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) =>
        new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()
    );
  }

  /**
   * Copilot CLI의 실제 세션 목록을 확인합니다.
   */
  listCopilotSessions(): string[] {
    const copilotSessionDir = path.join(
      os.homedir(),
      ".copilot",
      "session-state"
    );
    try {
      if (fs.existsSync(copilotSessionDir)) {
        return fs.readdirSync(copilotSessionDir).filter((name) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            name
          )
        );
      }
    } catch {
      // 무시
    }
    return [];
  }
}
