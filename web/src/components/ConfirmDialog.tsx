import { useEffect, useRef, type ReactNode } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: ReactNode;
  /** Extra content, e.g. a rejection-reason field. */
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  /** Styles the confirm button as destructive. */
  danger?: boolean;
  /** Disables buttons while the action is in flight. */
  busy?: boolean;
  /** Inline error shown when the action failed; the dialog stays open. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation dialog on top of the native <dialog> element, which provides
 * focus trapping, Escape handling, and top-layer rendering for free.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  children,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // Escape must not defeat the in-flight guard: cancelling while a request
  // is pending resets the mutation, hides its outcome, and re-enables the
  // action button for a second (conflicting) submission.
  const busyRef = useRef(busy);
  busyRef.current = busy;

  // Capture the element that opened the dialog during render — before the
  // showModal effect below moves focus into the dialog. Reading
  // document.activeElement in an effect would capture something already
  // inside the dialog, so restoration must snapshot the opener here, once.
  const openerRef = useRef<HTMLElement | null>(null);
  if (openerRef.current === null && typeof document !== "undefined") {
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // <dialog> moves focus into itself but does nothing on unmount (callers
  // unmount the component to close it), so restore focus to the element
  // that opened the dialog — keyboard and screen-reader users otherwise
  // land back at the top of the document.
  useEffect(() => {
    return () => {
      const opener = openerRef.current;
      if (opener && opener.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      if (busyRef.current) return;
      onCancel();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onCancel]);

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="dialog-title">
      <h2 id="dialog-title" className="dialog__title">
        {title}
      </h2>
      {body ? <p className="dialog__body">{body}</p> : null}
      {children}
      {error ? (
        <p className="dialog__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="dialog__actions">
        <button type="button" className="button" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={danger ? "button button--danger" : "button button--primary"}
          onClick={onConfirm}
          disabled={busy}
          aria-busy={busy}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
