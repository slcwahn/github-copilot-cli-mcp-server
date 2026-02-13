/**
 * Permission Handler
 *
 * Copilot CLI의 권한 요청을 처리하는 두 가지 모드를 제공합니다:
 * - Autonomous: --allow-all-tools --no-ask-user로 모든 권한 자동 승인
 * - Interactive: PTY를 통해 Copilot의 질문을 MCP 클라이언트에 전달
 */

export type PermissionMode = "autonomous" | "interactive";

/**
 * 환경 변수에서 권한 모드를 가져옵니다.
 */
export function getPermissionMode(): PermissionMode {
  const mode = process.env.COPILOT_PERMISSION_MODE?.toLowerCase();
  if (mode === "interactive") return "interactive";
  return "autonomous";
}

/**
 * 대기 중인 입력 요청
 */
export interface PendingInput {
  /** 세션 ID */
  sessionId: string;
  /** Copilot이 물어본 질문 */
  question: string;
  /** 질문 감지 시간 */
  detectedAt: string;
  /** 입력 제공을 위한 resolve 함수 */
  resolve: (response: string) => void;
  /** 타임아웃 또는 에러를 위한 reject 함수 */
  reject: (error: Error) => void;
}

/**
 * 대기 중인 입력을 관리합니다.
 * Interactive 모드에서 Copilot이 질문할 때 사용됩니다.
 */
export class PendingInputManager {
  private pending: Map<string, PendingInput> = new Map();

  /**
   * 새 대기 입력을 등록합니다.
   * @returns 사용자 응답을 기다리는 Promise
   */
  waitForInput(
    sessionId: string,
    question: string,
    timeoutMs: number = 300_000
  ): Promise<string> {
    // 이전 대기 입력이 있으면 거부
    const existing = this.pending.get(sessionId);
    if (existing) {
      existing.reject(new Error("Superseded by new input request"));
    }

    return new Promise<string>((resolve, reject) => {
      const input: PendingInput = {
        sessionId,
        question,
        detectedAt: new Date().toISOString(),
        resolve,
        reject,
      };
      this.pending.set(sessionId, input);

      // 타임아웃
      setTimeout(() => {
        if (this.pending.get(sessionId) === input) {
          this.pending.delete(sessionId);
          reject(
            new Error(
              `Input timeout after ${timeoutMs}ms for session ${sessionId}`
            )
          );
        }
      }, timeoutMs);
    });
  }

  /**
   * 대기 중인 입력에 응답합니다.
   */
  provideInput(sessionId: string, response: string): boolean {
    const input = this.pending.get(sessionId);
    if (!input) return false;

    this.pending.delete(sessionId);
    input.resolve(response);
    return true;
  }

  /**
   * 대기 중인 입력 정보를 가져옵니다.
   */
  getPending(sessionId: string): PendingInput | undefined {
    return this.pending.get(sessionId);
  }

  /**
   * 대기 중인 모든 입력 목록을 반환합니다.
   */
  listPending(): Array<{
    sessionId: string;
    question: string;
    detectedAt: string;
  }> {
    return Array.from(this.pending.values()).map((p) => ({
      sessionId: p.sessionId,
      question: p.question,
      detectedAt: p.detectedAt,
    }));
  }

  /**
   * 대기 중인 입력을 취소합니다.
   */
  cancel(sessionId: string): boolean {
    const input = this.pending.get(sessionId);
    if (!input) return false;

    this.pending.delete(sessionId);
    input.reject(new Error("Input cancelled"));
    return true;
  }
}

// 싱글톤 인스턴스
export const pendingInputManager = new PendingInputManager();
