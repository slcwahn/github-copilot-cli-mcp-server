import { describe, it, expect } from "vitest";
import { stripAnsi, isUUID } from "./utils.js";

describe("utils", () => {
  describe("stripAnsi", () => {
    it("removes ANSI escape sequences", () => {
      const input = "\x1b[31mhello\x1b[0m world";
      expect(stripAnsi(input)).toBe("hello world");
    });

    it("handles plain text without ANSI", () => {
      const input = "hello world";
      expect(stripAnsi(input)).toBe("hello world");
    });

    it("handles empty string", () => {
      expect(stripAnsi("")).toBe("");
    });

    it("removes complex ANSI sequences", () => {
      const input = "\x1b[1;32mgreen bold\x1b[0m normal \x1b[4munderline\x1b[0m";
      const result = stripAnsi(input);
      expect(result).toContain("green bold");
      expect(result).toContain("normal");
      expect(result).toContain("underline");
      expect(result).not.toContain("\x1b");
    });
  });

  describe("isUUID", () => {
    it("matches valid UUID v4", () => {
      expect(isUUID("e8c95711-6158-44bb-b861-14ceb2523b4f")).toBe(true);
    });

    it("matches uppercase UUID", () => {
      expect(isUUID("E8C95711-6158-44BB-B861-14CEB2523B4F")).toBe(true);
    });

    it("rejects non-UUID strings", () => {
      expect(isUUID("not-a-uuid")).toBe(false);
      expect(isUUID("")).toBe(false);
      expect(isUUID("12345")).toBe(false);
    });

    it("rejects partial UUID", () => {
      expect(isUUID("e8c95711-6158-44bb-b861")).toBe(false);
    });
  });
});
