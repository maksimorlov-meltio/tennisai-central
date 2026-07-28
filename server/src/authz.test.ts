import { describe, it, expect } from "vitest";
import { PUBLIC_SIGNUP_ROLES } from "./authz";

// Regression guard for the privilege-self-assignment fix: the public signup
// endpoint must never let a caller register as "admin" (academy administrator).
describe("PUBLIC_SIGNUP_ROLES", () => {
  it("excludes admin — admins are provisioned by invite/seed only", () => {
    expect(PUBLIC_SIGNUP_ROLES).not.toContain("admin");
  });

  it("allows exactly player, coach, observer (parent)", () => {
    expect([...PUBLIC_SIGNUP_ROLES].sort()).toEqual(["coach", "observer", "player"]);
  });
});
