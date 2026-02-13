import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkCopilotAvailable, resolveCopilotCommand } from "./copilot-runner.js";
import { writeFileSync, unlinkSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

  describe("resolveCopilotCommand", () => {
    let tempFile: string;

    afterEach(() => {
      try {
        unlinkSync(tempFile);
      } catch {
        // ignore
      }
    });

    it("returns process.execPath for Node.js shebang scripts", () => {
      tempFile = join(tmpdir(), `test-copilot-${Date.now()}.js`);
      writeFileSync(tempFile, "#!/usr/bin/env node\nconsole.log('hello');\n");

      const [command, argPrefix] = resolveCopilotCommand(tempFile);

      expect(command).toBe(process.execPath);
      expect(argPrefix).toEqual([tempFile]);
    });

    it("returns process.execPath for direct node path shebang", () => {
      tempFile = join(tmpdir(), `test-copilot-direct-${Date.now()}.js`);
      writeFileSync(tempFile, "#!/usr/local/bin/node\nconsole.log('hello');\n");

      const [command, argPrefix] = resolveCopilotCommand(tempFile);

      expect(command).toBe(process.execPath);
      expect(argPrefix).toEqual([tempFile]);
    });

    it("returns the path directly for non-Node scripts", () => {
      tempFile = join(tmpdir(), `test-copilot-bash-${Date.now()}.sh`);
      writeFileSync(tempFile, "#!/bin/bash\necho hello\n");

      const [command, argPrefix] = resolveCopilotCommand(tempFile);

      expect(command).toBe(tempFile);
      expect(argPrefix).toEqual([]);
    });

    it("returns the path directly for binary files (unreadable as text)", () => {
      tempFile = join(tmpdir(), `test-copilot-bin-${Date.now()}`);
      writeFileSync(tempFile, Buffer.from([0x7f, 0x45, 0x4c, 0x46])); // ELF header

      const [command, argPrefix] = resolveCopilotCommand(tempFile);

      expect(command).toBe(tempFile);
      expect(argPrefix).toEqual([]);
    });

    it("returns the path directly for non-existent files", () => {
      const nonExistent = "/tmp/non-existent-copilot-binary-12345";

      const [command, argPrefix] = resolveCopilotCommand(nonExistent);

      expect(command).toBe(nonExistent);
      expect(argPrefix).toEqual([]);
    });
  });
});
