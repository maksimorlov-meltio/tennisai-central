// ============================================================================
// AttendanceRegister — the two things that must never blur.
//
//  1. "Nobody has taken this register" vs "this player was marked absent".
//     They are different facts about the world. If the UI renders them alike,
//     a coach who simply has not opened the session yet is shown as having
//     reported an empty court, and any billing or no-show history built on
//     that record is wrong.
//  2. Who is allowed to touch it. The server refuses a player outright; the
//     UI must not offer them a control it knows will be refused, least of all
//     for their own row.
//
// The component is presentational, so these specs render it directly — no
// QueryClient, no network. What is asserted is what a coach or a player would
// actually SEE and be able to tap.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { AttendanceRegister } from "@/components/training/AttendanceRegister";
import type { TrainingSession, TrainingAttendance } from "@/types";

const COACH = "coach-1";
const ALICE = "player-alice";
const BOB = "player-bob";

const PLAYERS = [
  { id: ALICE, firstName: "Alice", lastName: "Adams" },
  { id: BOB, firstName: "Bob", lastName: "Brown" },
];

function session(attendance?: TrainingAttendance[]): TrainingSession {
  return {
    id: "tr-1",
    title: "Serve block",
    trainingType: "individual",
    coachId: COACH,
    playerIds: [ALICE, BOB],
    startDate: "2026-06-01T09:00:00.000Z",
    endDate: "2026-06-01T10:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...(attendance ? { attendance } : {}),
  };
}

/** The row a player's name sits in, so assertions stay scoped to one person. */
function rowFor(name: string): HTMLElement {
  const listItem = screen.getByText(name).closest("li");
  if (!listItem) throw new Error(`no register row for ${name}`);
  return listItem as HTMLElement;
}

beforeEach(() => cleanup());

// ── Not taken is not absent ─────────────────────────────────────────────────
describe("a register nobody has taken", () => {
  it("says so, and never claims anybody was absent", () => {
    render(<AttendanceRegister training={session()} players={PLAYERS} canMark onMark={() => {}} />);

    expect(screen.getByText(/register not taken/i)).toBeInTheDocument();

    // Every player reads "Not marked" — a distinct, visible fourth state.
    expect(within(rowFor("Alice Adams")).getByText("Not marked")).toBeInTheDocument();
    expect(within(rowFor("Bob Brown")).getByText("Not marked")).toBeInTheDocument();

    // "Absent" appears only as an offered BUTTON, never as anyone's state.
    // A pill saying Absent would be the app inventing a fact.
    const absentPills = screen
      .getAllByText("Absent")
      .filter((el) => el.closest("button") === null);
    expect(absentPills).toHaveLength(0);
  });

  it("is a different rendering from a register where everyone IS absent", () => {
    const { unmount } = render(
      <AttendanceRegister training={session()} players={PLAYERS} canMark onMark={() => {}} />,
    );
    const untaken = rowFor("Alice Adams").textContent;
    unmount();

    render(
      <AttendanceRegister
        training={session([
          { playerId: ALICE, status: "absent" },
          { playerId: BOB, status: "absent" },
        ])}
        players={PLAYERS}
        canMark
        onMark={() => {}}
      />,
    );

    expect(screen.queryByText(/register not taken/i)).not.toBeInTheDocument();
    expect(rowFor("Alice Adams").textContent).not.toBe(untaken);
    expect(within(rowFor("Alice Adams")).getByText("Absent", { selector: ":not(button *)" }));
  });
});

// ── A taken register with an unmarked player ────────────────────────────────
describe("a taken register with one player still unmarked", () => {
  const taken = session([
    { playerId: ALICE, status: "absent", markedBy: COACH },
    { playerId: BOB },
  ]);

  it("drops the 'not taken' badge but still shows Bob as not marked", () => {
    render(<AttendanceRegister training={taken} players={PLAYERS} canMark onMark={() => {}} />);

    expect(screen.queryByText(/register not taken/i)).not.toBeInTheDocument();
    expect(within(rowFor("Bob Brown")).getByText("Not marked")).toBeInTheDocument();
    // Alice's real state, and Bob's absence of one, are told apart.
    expect(within(rowFor("Alice Adams")).queryByText("Not marked")).not.toBeInTheDocument();
  });

  it("marks only the chosen state as pressed", () => {
    render(<AttendanceRegister training={taken} players={PLAYERS} canMark onMark={() => {}} />);

    const alice = within(rowFor("Alice Adams"));
    expect(alice.getByRole("button", { name: /absent/i })).toHaveAttribute("aria-pressed", "true");
    expect(alice.getByRole("button", { name: /present/i })).toHaveAttribute("aria-pressed", "false");

    // Bob has no mark at all, so nothing of his is pressed.
    const bob = within(rowFor("Bob Brown"));
    for (const label of ["present", "absent", "late", "excused"]) {
      expect(bob.getByRole("button", { name: new RegExp(label, "i") })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
  });
});

// ── Marking ─────────────────────────────────────────────────────────────────
describe("taking the register", () => {
  it("offers all four states and reports the tapped one for the right player", () => {
    const onMark = vi.fn();
    render(<AttendanceRegister training={session()} players={PLAYERS} canMark onMark={onMark} />);

    const bob = within(rowFor("Bob Brown"));
    for (const label of ["Present", "Late", "Excused", "Absent"]) {
      expect(bob.getByRole("button", { name: new RegExp(label, "i") })).toBeInTheDocument();
    }

    fireEvent.click(bob.getByRole("button", { name: /late/i }));
    expect(onMark).toHaveBeenCalledExactlyOnceWith(BOB, "late");
  });

  it("shows a pending row as saving and locks its buttons, leaving other rows usable", () => {
    const onMark = vi.fn();
    render(
      <AttendanceRegister
        training={session()}
        players={PLAYERS}
        canMark
        onMark={onMark}
        pendingPlayerId={ALICE}
      />,
    );

    // The row in flight says so rather than silently pretending it is done.
    expect(within(rowFor("Alice Adams")).getByText(/saving/i)).toBeInTheDocument();
    expect(within(rowFor("Alice Adams")).getByRole("button", { name: /present/i })).toBeDisabled();

    // Bob is unaffected — one slow save must not freeze the whole register.
    expect(within(rowFor("Bob Brown")).queryByText(/saving/i)).not.toBeInTheDocument();
    fireEvent.click(within(rowFor("Bob Brown")).getByRole("button", { name: /present/i }));
    expect(onMark).toHaveBeenCalledExactlyOnceWith(BOB, "present");
  });
});

// ── A player gets no controls ───────────────────────────────────────────────
describe("what a player sees", () => {
  it("renders NO buttons at all", () => {
    render(
      <AttendanceRegister
        training={session([{ playerId: ALICE, status: "present", markedBy: COACH }])}
        players={PLAYERS}
        canMark={false}
        viewerId={ALICE}
      />,
    );

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("shows their own row and not their team-mates'", () => {
    render(
      <AttendanceRegister
        training={session([
          { playerId: ALICE, status: "present" },
          { playerId: BOB, status: "absent" },
        ])}
        players={PLAYERS}
        canMark={false}
        viewerId={ALICE}
      />,
    );

    // One row, and it is hers — labelled "You", since a player is never in
    // their own connections list.
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    // Whether Bob turned up is not Alice's business.
    expect(screen.queryByText("Bob Brown")).not.toBeInTheDocument();
    expect(screen.queryByText("Absent")).not.toBeInTheDocument();
  });

  it("names their own row 'You' rather than a raw id when the lookup is empty", () => {
    // A player's `connectedPlayers` is the people connected TO them and never
    // contains the player themself, so this is the REAL case, not an edge one.
    render(
      <AttendanceRegister
        training={session([{ playerId: ALICE, status: "present" }])}
        players={[]}
        canMark={false}
        viewerId={ALICE}
      />,
    );

    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.queryByText(ALICE)).not.toBeInTheDocument();
  });

  it("still tells 'not taken' apart from 'absent' with no controls to explain it", () => {
    render(
      <AttendanceRegister training={session()} players={PLAYERS} canMark={false} viewerId={ALICE} />,
    );

    expect(screen.getByText(/register not taken/i)).toBeInTheDocument();
    expect(screen.getByText(/coach has not taken the register/i)).toBeInTheDocument();
    expect(screen.queryByText("Absent")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("gives a coach who does not own the session no controls either", () => {
    // `canMark` mirrors the server's owner check, so a coach merely taking
    // part in someone else's session lands here.
    render(
      <AttendanceRegister
        training={session([{ playerId: ALICE, status: "present" }])}
        players={PLAYERS}
        canMark={false}
        viewerId="some-other-coach"
      />,
    );

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
