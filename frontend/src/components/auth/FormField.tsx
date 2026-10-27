import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { EyeIcon, EyeOffIcon } from './AuthIcons';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
  trailing?: ReactNode;
};

export function FormField({
  label,
  error,
  hint,
  trailing,
  id,
  ...props
}: FieldProps) {
  const inputId = id ?? props.name;
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <div className={`input-wrap${error ? ' has-error' : ''}`}>
        <input
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
          }
          {...props}
        />
        {trailing}
      </div>
      {error ? (
        <span className="field-error" id={`${inputId}-error`}>
          {error}
        </span>
      ) : null}
      {!error && hint ? (
        <span className="field-hint" id={`${inputId}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function PasswordField(props: Omit<FieldProps, 'type' | 'trailing'>) {
  const [visible, setVisible] = useState(false);
  return (
    <FormField
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          className="visibility-toggle"
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      }
    />
  );
}
