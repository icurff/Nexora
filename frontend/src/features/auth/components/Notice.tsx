import type { ReactNode } from 'react';
import { AlertCircle, CircleCheck } from 'lucide-react';
import { Alert } from '../../../components/ui/alert';

export function Notice({
  children,
  tone = 'error',
}: {
  children: ReactNode;
  tone?: 'error' | 'success';
}) {
  return (
    <Alert
      className={`notice notice-${tone}`}
      variant={tone === 'error' ? 'destructive' : 'default'}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {tone === 'error' ? <AlertCircle /> : <CircleCheck />}
      {children}
    </Alert>
  );
}
