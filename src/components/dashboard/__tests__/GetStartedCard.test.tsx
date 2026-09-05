// ============================================================================
// GetStartedCard — the rule under test is "ticks come from data, not storage".
//
// A derived item stays un-done even when localStorage claims otherwise; only a
// `manual` item honours a stored self-confirmation. Progress is n of m, the
// card hides when everything is done, and a dismissal expires after 7 days.
// ============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  DISMISS_DAYS,
  GetStartedCard,
  getStartedStorageId,
  type GetStartedItem,
} from "@/components/dashboard/GetStartedCard";

const SCOPE = "player:test-1";

function item(over: Partial<GetStartedItem> & { id: string }): GetStartedItem {
  return {
    label: `Label ${over.id}`,
    to: `/${over.id}`,
    actionLabel: `Go ${over.id}`,
    done: false,
    ...over,
  };
}

function renderCard(items: GetStartedItem[]) {
  return render(
    <MemoryRouter>
      <GetStartedCard storageKey={SCOPE} items={items} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("GetStartedCard", () => {
  it("shows progress as n of m and links every open step to where it is completed", () => {
    renderCard([item({ id: "a", done: true }), item({ id: "b" }), item({ id: "c" })]);
    expect(screen.getByText(/^1 of 3 done/)).toBeInTheDocument();
    expect(screen.getByTestId("get-started-item-a")).toHaveAttribute("data-done", "true");
    expect(screen.getByRole("link", { name: /Go b/ })).toHaveAttribute("href", "/b");
    expect(screen.getByRole("link", { name: /Go c/ })).toHaveAttribute("href", "/c");
    // A done step has no action button.
    expect(screen.queryByRole("link", { name: /Go a/ })).not.toBeInTheDocument();
  });

  it("a derived item is NEVER ticked from localStorage, and cannot be ticked by hand", () => {
    localStorage.setItem(getStartedStorageId(SCOPE), JSON.stringify({ dismissedAt: null, confirmed: ["a", "b"] }));
    renderCard([item({ id: "a" }), item({ id: "b" })]);
    expect(screen.getByText(/^0 of 2 done/)).toBeInTheDocument();
    expect(screen.getByTestId("get-started-item-a")).toHaveAttribute("data-done", "false");
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("only a `manual` item honours a stored self-confirmation, and it is labelled as such", () => {
    localStorage.setItem(getStartedStorageId(SCOPE), JSON.stringify({ dismissedAt: null, confirmed: ["consent"] }));
    renderCard([item({ id: "link" }), item({ id: "consent", manual: { reason: "not sent to the client" } })]);
    expect(screen.getByText(/^1 of 2 done/)).toBeInTheDocument();
    expect(screen.getByTestId("get-started-item-consent")).toHaveAttribute("data-done", "true");
    expect(screen.getByText(/Self-confirmed/)).toBeInTheDocument();
    // Un-confirming by hand flips it back and persists.
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByText(/^0 of 2 done/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(getStartedStorageId(SCOPE))!).confirmed).toEqual([]);
  });

  it("re-renders a tick the moment the data says so (no reload, no storage)", () => {
    const { rerender } = renderCard([item({ id: "a" }), item({ id: "b" })]);
    expect(screen.getByText(/^0 of 2 done/)).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <GetStartedCard storageKey={SCOPE} items={[item({ id: "a", done: true }), item({ id: "b" })]} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/^1 of 2 done/)).toBeInTheDocument();
    expect(localStorage.getItem(getStartedStorageId(SCOPE))).toBeNull();
  });

  it("hides itself when every item is done, and when there are no items", () => {
    const { container } = renderCard([item({ id: "a", done: true }), item({ id: "b", done: true })]);
    expect(container).toBeEmptyDOMElement();
    cleanup();
    const empty = renderCard([]);
    expect(empty.container).toBeEmptyDOMElement();
  });

  it("dismissal is device-local and comes back after 7 days if the account is still incomplete", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-01T10:00:00Z"));

    const { unmount } = renderCard([item({ id: "a" })]);
    fireEvent.click(screen.getByRole("button", { name: /Dismiss/ }));
    expect(screen.queryByText(/of 1 done/)).not.toBeInTheDocument();
    unmount();

    // Six days later: still dismissed.
    vi.setSystemTime(new Date("2026-09-07T10:00:00Z"));
    const six = renderCard([item({ id: "a" })]);
    expect(six.container).toBeEmptyDOMElement();
    six.unmount();

    // Past the window: back, because the step is still open.
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 1 + DISMISS_DAYS, 10, 0, 1)));
    renderCard([item({ id: "a" })]);
    expect(screen.getByText(/^0 of 1 done/)).toBeInTheDocument();
  });

  it("a legacy `{ dismissed: true }` record (no timestamp) is treated as expired", () => {
    localStorage.setItem(getStartedStorageId(SCOPE), JSON.stringify({ dismissed: true, checked: ["a"] }));
    renderCard([item({ id: "a" })]);
    expect(screen.getByText(/^0 of 1 done/)).toBeInTheDocument();
  });
});
