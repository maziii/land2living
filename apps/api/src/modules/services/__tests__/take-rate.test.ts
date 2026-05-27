import { describe, expect, it } from "vitest";
import { getTakeRateBasisPoints, calculateTakeAmount } from "../take-rate-config.js";

describe("take-rate-config", () => {
  describe("getTakeRateBasisPoints", () => {
    it("returns 1100 bp for small recurring categories", () => {
      expect(getTakeRateBasisPoints("gardening")).toBe(1100);
      expect(getTakeRateBasisPoints("cleaning")).toBe(1100);
      expect(getTakeRateBasisPoints("security")).toBe(1100);
    });

    it("returns 700 bp for mid-job categories", () => {
      expect(getTakeRateBasisPoints("plumbing")).toBe(700);
      expect(getTakeRateBasisPoints("electrical")).toBe(700);
      expect(getTakeRateBasisPoints("repairs")).toBe(700);
    });

    it("returns 400 bp for large job categories", () => {
      expect(getTakeRateBasisPoints("bricklaying")).toBe(400);
      expect(getTakeRateBasisPoints("fencing")).toBe(400);
      expect(getTakeRateBasisPoints("borehole")).toBe(400);
      expect(getTakeRateBasisPoints("building")).toBe(400);
    });

    it("returns 600 bp for architecture", () => {
      expect(getTakeRateBasisPoints("architecture")).toBe(600);
    });

    it("falls back to 700 bp for unknown category", () => {
      expect(getTakeRateBasisPoints("unknown_category")).toBe(700);
    });
  });

  describe("calculateTakeAmount", () => {
    it("calculates 11% of R1000 correctly", () => {
      expect(calculateTakeAmount(1000, 1100)).toBe(110);
    });

    it("calculates 7% of R5000 correctly", () => {
      expect(calculateTakeAmount(5000, 700)).toBe(350);
    });

    it("calculates 4% of R50000 correctly", () => {
      expect(calculateTakeAmount(50000, 400)).toBe(2000);
    });

    it("rounds fractional cents", () => {
      expect(calculateTakeAmount(333, 700)).toBe(23); // 333 * 0.07 = 23.31 → 23
    });
  });
});
