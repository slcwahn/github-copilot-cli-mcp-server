import { describe, it, expect } from "vitest";
import { checkCopilotAvailable } from "./copilot-runner.js";

describe("copilot-runner", () => {
  describe("checkCopilotAvailable", () => {
    it("detects Copilot CLI availability", async () => {
      const result = await checkCopilotAvailable();
      // 이 테스트는 환경에 따라 다를 수 있음
      expect(result).toHaveProperty("available");
      if (result.available) {
        expect(result.version).toBeDefined();
        expect(result.path).toBeDefined();
      }
    });
  });
});
