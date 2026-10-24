import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'neutral' | 'success' | 'warning' | 'error' | 'blue';
}

export function Badge({
  className,
  variant = 'neutral',
  children,
  ...props
}: BadgeProps) {
  const variantStyles = {
    neutral: 'bg-[#EEF1F5] text-[#182230] border-[#E4E9F0]',
    success: 'bg-[#16835D]/10 text-[#16835D] border-[#16835D]/20',
    warning: 'bg-[#B7791F]/10 text-[#B7791F] border-[#B7791F]/20',
    error: 'bg-[#C0393A]/10 text-[#C0393A] border-[#C0393A]/20',
    blue: 'bg-[#EAF2FC] text-[#2864B4] border-[#2864B4]/20',
  };

  return (
    <span
      className={twMerge(
        clsx(
          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
          variantStyles[variant],
          className
        )
      )}
      {...props}
    >
      {children}
    </span>
  );
}
