import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Button } from '../../../components/ui/button';

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
      <Label htmlFor={inputId}>{label}</Label>
      <div className={`input-wrap${error ? ' has-error' : ''}`}>
        <Input
          id={inputId}
          className="auth-input"
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
        <Button
          className="visibility-toggle"
          variant="ghost"
          size="icon"
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        >
          {visible ? <EyeOff /> : <Eye />}
        </Button>
      }
    />
  );
}
