import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";

// jsdom implements <dialog> but not always showModal/close; provide no-ops
// so the component's open/close effect doesn't throw during the test.
beforeEach(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
  }
});

function setup(busy: boolean) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(
    <ConfirmDialog
      open
      title="Confirm"
      confirmLabel="Approve"
      cancelLabel="Cancel"
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onCancel, onConfirm };
}

describe("ConfirmDialog Escape handling", () => {
  it("ignores Escape while an action is in flight (no double-submit)", async () => {
    const { onCancel } = setup(true);
    const dialog = screen.getByRole("dialog");
    // The native <dialog> fires 'cancel' on Escape.
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("allows Escape to cancel when idle", () => {
    const { onCancel } = setup(false);
    const dialog = screen.getByRole("dialog");
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons while busy", () => {
    setup(true);
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
