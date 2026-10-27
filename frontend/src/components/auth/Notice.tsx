import type { ReactNode } from 'react';
import { AlertIcon, CheckIcon } from './AuthIcons';

export function Notice({
  children,
  tone = 'error',
}: {
  children: ReactNode;
  tone?: 'error' | 'success';
}) {
  return (
    <div
      className={`notice notice-${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {tone === 'error' ? <AlertIcon /> : <CheckIcon />}
      {children}
    </div>
  );
}
