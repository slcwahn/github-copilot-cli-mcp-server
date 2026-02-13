import { describe, it, expect } from "vitest";
import {
  PendingInputManager,
  getPermissionMode,
} from "./permission-handler.js";

describe("permission-handler", () => {
  describe("getPermissionMode", () => {
    it("returns autonomous by default", () => {
      const originalEnv = process.env.COPILOT_PERMISSION_MODE;
      delete process.env.COPILOT_PERMISSION_MODE;
      expect(getPermissionMode()).toBe("autonomous");
      process.env.COPILOT_PERMISSION_MODE = originalEnv;
    });

    it("returns interactive when set", () => {
      const originalEnv = process.env.COPILOT_PERMISSION_MODE;
      process.env.COPILOT_PERMISSION_MODE = "interactive";
      expect(getPermissionMode()).toBe("interactive");
      process.env.COPILOT_PERMISSION_MODE = originalEnv;
    });

    it("is case-insensitive", () => {
      const originalEnv = process.env.COPILOT_PERMISSION_MODE;
      process.env.COPILOT_PERMISSION_MODE = "INTERACTIVE";
      expect(getPermissionMode()).toBe("interactive");
      process.env.COPILOT_PERMISSION_MODE = originalEnv;
    });
  });

  describe("PendingInputManager", () => {
    it("registers and provides input", async () => {
      const manager = new PendingInputManager();

      const inputPromise = manager.waitForInput(
        "session-1",
        "Allow file modification?"
      );

      // 대기 중인 입력 확인
      const pending = manager.getPending("session-1");
      expect(pending).toBeDefined();
      expect(pending?.question).toBe("Allow file modification?");

      // 입력 제공
      const success = manager.provideInput("session-1", "yes");
      expect(success).toBe(true);

      // Promise가 resolve됨
      const result = await inputPromise;
      expect(result).toBe("yes");
    });

    it("lists pending inputs", () => {
      const manager = new PendingInputManager();

      manager.waitForInput("session-1", "Question 1?");
      manager.waitForInput("session-2", "Question 2?");

      const list = manager.listPending();
      expect(list).toHaveLength(2);
      expect(list[0].sessionId).toBe("session-1");
      expect(list[1].sessionId).toBe("session-2");
    });

    it("returns false for non-existent session", () => {
      const manager = new PendingInputManager();
      const success = manager.provideInput("nonexistent", "yes");
      expect(success).toBe(false);
    });

    it("cancels pending input", async () => {
      const manager = new PendingInputManager();

      const inputPromise = manager.waitForInput(
        "session-1",
        "Allow?"
      );

      const cancelled = manager.cancel("session-1");
      expect(cancelled).toBe(true);

      await expect(inputPromise).rejects.toThrow("Input cancelled");
    });

    it("supersedes previous input on same session", async () => {
      const manager = new PendingInputManager();

      const firstPromise = manager.waitForInput(
        "session-1",
        "First question?"
      );
      const secondPromise = manager.waitForInput(
        "session-1",
        "Second question?"
      );

      // 첫 번째는 거부됨
      await expect(firstPromise).rejects.toThrow("Superseded");

      // 두 번째에 응답
      manager.provideInput("session-1", "yes");
      const result = await secondPromise;
      expect(result).toBe("yes");
    });
  });
});
