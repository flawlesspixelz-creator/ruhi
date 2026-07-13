import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface FormFieldProps {
  label: string;
  required?: boolean;
  /** i18n key of the validation error, if any. */
  errorKey?: string;
  hint?: string;
  /** Render prop receives generated ids and aria attributes for the control. */
  children: (control: {
    id: string;
    "aria-invalid": boolean | undefined;
    "aria-describedby": string | undefined;
  }) => ReactNode;
}

/**
 * Shared label + hint + error wrapper so every form control gets consistent
 * markup and accessible wiring (label association, aria-invalid,
 * aria-describedby) without repeating it per field.
 */
export function FormField({ label, required, errorKey, hint, children }: FormFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy =
    [hint ? hintId : null, errorKey ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className={errorKey ? "form-field form-field--invalid" : "form-field"}>
      <label htmlFor={id} className="form-field__label">
        {label}
        {required ? (
          <span className="form-field__required" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children({
        id,
        "aria-invalid": errorKey ? true : undefined,
        "aria-describedby": describedBy,
      })}
      {hint ? (
        <p id={hintId} className="form-field__hint">
          {hint}
        </p>
      ) : null}
      {errorKey ? (
        <p id={errorId} className="form-field__error">
          {t(errorKey)}
        </p>
      ) : null}
    </div>
  );
}
