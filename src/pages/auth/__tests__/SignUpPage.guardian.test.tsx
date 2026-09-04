// ============================================================================
// Component tests — the sign-up form's age gate and password feedback.
//
// The two things this pins:
//   1. the guardian fields appear ONLY below the age of digital consent, and
//      that age is the SERVER's (GET /auth/signup-policy), not a constant here;
//   2. the password requirement is visible before any submit, and updates as
//      the user types.
//
// The policy fetch is mocked rather than left to hit the network — otherwise
// every case would race the fallback against the response.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SignUpPage from "@/pages/auth/SignUpPage";
import { toIsoDate, todayUtc } from "@/lib/age";

// jsdom has no ResizeObserver and the Radix checkbox measures itself on mount.
// Stubbed here rather than in the shared setup file, which belongs to another
// workstream in this change.
if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// The parameter is declared so the payload assertions below can read
// `signUp.mock.calls[0][0]` with a type rather than an empty tuple.
const signUp = vi.fn(async (_data: Record<string, unknown>) => "Account created.");
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({ signUp }),
}));

let policy = { minorAgeThreshold: 16, passwordMinLength: 8 };
vi.mock("@/api/client", () => ({
  apiClient: {
    get: vi.fn(async () => ({ data: policy })),
    post: vi.fn(),
  },
}));

async function renderPage() {
  const result = render(
    <MemoryRouter>
      <SignUpPage />
    </MemoryRouter>,
  );
  // Flush the signup-policy fetch INSIDE act, so the state update it triggers
  // is not reported as an unwrapped React update on every single case.
  await act(async () => {});
  return result;
}

/**
 * A date of birth making the applicant exactly `years` old today.
 *
 * UTC, matching the form (and the server). Using the local day here would make
 * these cases flaky for a few hours a night on a machine east of UTC.
 */
function dobForAge(years: number): string {
  const t = todayUtc();
  return toIsoDate({ year: t.year - years, month: t.month, day: t.day });
}

function setDateOfBirth(value: string) {
  fireEvent.change(screen.getByLabelText(/date of birth/i), { target: { value } });
}

const guardianNameField = () => screen.queryByLabelText(/parent or guardian's name/i);
const guardianEmailField = () => screen.queryByLabelText(/parent or guardian's email/i);

beforeEach(() => {
  policy = { minorAgeThreshold: 16, passwordMinLength: 8 };
  signUp.mockClear();
});

afterEach(() => cleanup());

describe("the old 16+ checkbox is gone", () => {
  it("asks for a date of birth instead of a self-declaration", async () => {
    await renderPage();
    expect(screen.getByLabelText(/date of birth/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/16 years of age or older/i)).toBeNull();
  });
});

describe("guardian fields appear only below the threshold", () => {
  it("are hidden before any date of birth is entered", async () => {
    await renderPage();
    expect(guardianNameField()).toBeNull();
    expect(guardianEmailField()).toBeNull();
  });

  it("stay hidden for someone comfortably over the threshold", async () => {
    await renderPage();
    setDateOfBirth(dobForAge(30));
    await waitFor(() => expect(guardianNameField()).toBeNull());
  });

  it("appear for a 14-year-old — the ITF junior this product is for", async () => {
    await renderPage();
    setDateOfBirth(dobForAge(14));
    await waitFor(() => expect(guardianNameField()).toBeInTheDocument());
    expect(guardianEmailField()).toBeInTheDocument();
    expect(screen.getByText(/because you're under 16/i)).toBeInTheDocument();
  });

  it("does NOT ask on the threshold birthday itself (>=, not >)", async () => {
    await renderPage();
    setDateOfBirth(dobForAge(16));
    await waitFor(() => expect(guardianNameField()).toBeNull());
  });

  it("asks the day BEFORE that birthday", async () => {
    await renderPage();
    // Born 16 years ago minus one day of age: still 15 today.
    const t = todayUtc();
    const dayBefore = new Date(Date.UTC(t.year - 16, t.month - 1, t.day + 1))
      .toISOString()
      .slice(0, 10);
    setDateOfBirth(dayBefore);
    await waitFor(() => expect(guardianNameField()).toBeInTheDocument());
  });

  it("disappear again if the date of birth is corrected upwards", async () => {
    await renderPage();
    setDateOfBirth(dobForAge(14));
    await waitFor(() => expect(guardianNameField()).toBeInTheDocument());
    setDateOfBirth(dobForAge(25));
    await waitFor(() => expect(guardianNameField()).toBeNull());
  });

  it("flags a date it cannot derive an age from, rather than guessing one", async () => {
    // A future date, which is the reachable case: `<input type="date">` refuses
    // to hold a non-existent day like 2025-02-29 at all (jsdom and real
    // browsers both blank it), but it will happily hold a date years ahead.
    await renderPage();
    setDateOfBirth("2999-01-01");
    await waitFor(() => expect(screen.getByText(/doesn't look right/i)).toBeInTheDocument());
    // And it must NOT be read as "under age" — an unusable date is a validation
    // failure, never a permission.
    expect(guardianNameField()).toBeNull();
  });
});

describe("the threshold comes from the server, not from this file", () => {
  it("leaves a 15-year-old unaided where the age of consent is 14", async () => {
    policy = { minorAgeThreshold: 14, passwordMinLength: 8 };
    await renderPage();
    // Wait for the policy to land before judging the absence of the fields.
    await waitFor(() => expect(screen.getByText(/under 14\?/i)).toBeInTheDocument());
    setDateOfBirth(dobForAge(15));
    await waitFor(() => expect(guardianNameField()).toBeNull());
  });

  it("asks a 17-year-old for a guardian where the threshold is 18", async () => {
    policy = { minorAgeThreshold: 18, passwordMinLength: 8 };
    await renderPage();
    await waitFor(() => expect(screen.getByText(/under 18\?/i)).toBeInTheDocument());
    setDateOfBirth(dobForAge(17));
    await waitFor(() => expect(screen.getByText(/because you're under 18/i)).toBeInTheDocument());
  });
});

describe("the password rule is visible before any submit", () => {
  it("states the minimum on first render, unmet", async () => {
    await renderPage();
    const rule = screen.getByText(/at least 8 characters/i).closest("li");
    expect(rule).toHaveAttribute("data-met", "false");
  });

  it("ticks over as the user types past the minimum", async () => {
    await renderPage();
    const password = screen.getByLabelText("Password");

    fireEvent.change(password, { target: { value: "short" } });
    await waitFor(() =>
      expect(screen.getByText(/at least 8 characters/i).closest("li")).toHaveAttribute("data-met", "false"),
    );

    fireEvent.change(password, { target: { value: "long-enough-now" } });
    await waitFor(() =>
      expect(screen.getByText(/at least 8 characters/i).closest("li")).toHaveAttribute("data-met", "true"),
    );
  });

  it("reports whether the two password boxes match, live", async () => {
    await renderPage();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "long-enough-now" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "long-enough-n" } });
    await waitFor(() =>
      expect(screen.getByText(/both passwords match/i).closest("li")).toHaveAttribute("data-met", "false"),
    );

    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "long-enough-now" } });
    await waitFor(() =>
      expect(screen.getByText(/both passwords match/i).closest("li")).toHaveAttribute("data-met", "true"),
    );
  });

  it("shows the SERVER's minimum when it differs", async () => {
    policy = { minorAgeThreshold: 16, passwordMinLength: 12 };
    await renderPage();
    await waitFor(() => expect(screen.getByText(/at least 12 characters/i)).toBeInTheDocument());
  });
});

describe("what gets submitted", () => {
  function fillCommon() {
    fireEvent.click(screen.getByText("Player"));
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Juana" } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: "Ramirez" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "juana@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-horse-battery" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "correct-horse-battery" },
    });
    fireEvent.click(screen.getByLabelText(/i accept the/i));
  }

  it("sends the date of birth and the guardian for a minor", async () => {
    await renderPage();
    fillCommon();
    const dateOfBirth = dobForAge(14);
    setDateOfBirth(dateOfBirth);
    await waitFor(() => expect(guardianNameField()).toBeInTheDocument());
    fireEvent.change(guardianNameField()!, { target: { value: "Marta Ramirez" } });
    fireEvent.change(guardianEmailField()!, { target: { value: "marta@example.com" } });

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    expect(signUp.mock.calls[0][0]).toMatchObject({
      dateOfBirth,
      guardianName: "Marta Ramirez",
      guardianEmail: "marta@example.com",
      // Derived, not self-declared: a 14-year-old is not confirming they are 16.
      ageConfirmed: false,
    });
  });

  it("sends no guardian fields for an adult", async () => {
    await renderPage();
    fillCommon();
    setDateOfBirth(dobForAge(30));

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    const payload = signUp.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.guardianName).toBeUndefined();
    expect(payload.guardianEmail).toBeUndefined();
    expect(payload.ageConfirmed).toBe(true);
  });

  it("refuses a guardian address equal to the applicant's own, without calling the API", async () => {
    await renderPage();
    fillCommon();
    setDateOfBirth(dobForAge(14));
    await waitFor(() => expect(guardianNameField()).toBeInTheDocument());
    fireEvent.change(guardianNameField()!, { target: { value: "Myself" } });
    fireEvent.change(guardianEmailField()!, { target: { value: "JUANA@example.com" } });

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/a parent or guardian's email has to be different from your own/i),
      ).toBeInTheDocument(),
    );
    expect(signUp).not.toHaveBeenCalled();
  });

  it("tells a minor they are waiting on a guardian, not to check their own inbox", async () => {
    await renderPage();
    fillCommon();
    setDateOfBirth(dobForAge(14));
    await waitFor(() => expect(guardianNameField()).toBeInTheDocument());
    fireEvent.change(guardianNameField()!, { target: { value: "Marta Ramirez" } });
    fireEvent.change(guardianEmailField()!, { target: { value: "marta@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(screen.getByText(/waiting for your parent or guardian/i)).toBeInTheDocument(),
    );
    // The resend link is for email VERIFICATION and would send them chasing the
    // wrong email entirely.
    expect(screen.queryByText(/didn't get the email/i)).toBeNull();
  });
});
