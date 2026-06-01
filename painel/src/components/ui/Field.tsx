// src/components/ui/Field.tsx
// Inputs de formulário com rótulo, dica e estado de erro consistentes.

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

interface FieldShellProps {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
}

export function FieldShell({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: FieldShellProps) {
  return (
    <div className={`field ${error ? "field--error" : ""}`}>
      <label className="field__label" htmlFor={htmlFor}>
        {label}
        {required && <span className="field__req" aria-hidden> *</span>}
      </label>
      {children}
      {error ? (
        <p className="field__error">{error}</p>
      ) : hint ? (
        <p className="field__hint">{hint}</p>
      ) : null}
    </div>
  );
}

interface TextFieldProps
  extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

export function TextField({ label, hint, error, id, required, ...rest }: TextFieldProps) {
  return (
    <FieldShell label={label} htmlFor={id} hint={hint} error={error} required={required}>
      <input id={id} className="input" required={required} {...rest} />
    </FieldShell>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}

export function SelectField({
  label,
  hint,
  error,
  id,
  children,
  ...rest
}: SelectFieldProps) {
  return (
    <FieldShell label={label} htmlFor={id} hint={hint} error={error}>
      <div className="select-wrap">
        <select id={id} className="input select" {...rest}>
          {children}
        </select>
      </div>
    </FieldShell>
  );
}

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

export function TextAreaField({
  label,
  hint,
  error,
  id,
  required,
  ...rest
}: TextAreaFieldProps) {
  return (
    <FieldShell label={label} htmlFor={id} hint={hint} error={error} required={required}>
      <textarea id={id} className="input textarea" required={required} {...rest} />
    </FieldShell>
  );
}
