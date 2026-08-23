import React from 'react';
import { cn } from '@/lib/utils';

export function Icon({ name, className = 'w-4 h-4', ...props }) {
  const iconId = name.startsWith('icon-') ? name : `icon-${name}`;
  return (
    <svg
      className={cn('icon inline-block shrink-0', className)}
      aria-hidden="true"
      {...props}
    >
      <use href={`/assets/icons.svg#${iconId}`} />
    </svg>
  );
}
