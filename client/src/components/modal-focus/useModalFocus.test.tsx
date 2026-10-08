import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import React from "react";
import { useModalFocus } from "./useModalFocus";

afterEach(cleanup);

function Harness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = React.useState(false);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  useModalFocus(open, () => {
    onClose();
    setOpen(false);
  }, bodyRef);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        trigger
      </button>
      {open && (
        <div role="dialog" aria-modal="true">
          <div ref={bodyRef}>
            <button type="button">first</button>
            <button type="button">last</button>
          </div>
        </div>
      )}
    </>
  );
}

describe("useModalFocus (NFR-9)", () => {
  it("moves focus inside, wraps Tab, closes on Escape and returns focus to the trigger", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const trigger = screen.getByRole("button", { name: "trigger" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog");
    const first = screen.getByRole("button", { name: "first" });
    const last = screen.getByRole("button", { name: "last" });
    expect(first).toHaveFocus();

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
