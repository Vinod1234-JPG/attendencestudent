import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'destructive' | 'icon';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isLoading?: boolean;
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none rounded-md';

  const variantStyles = {
    primary: 'bg-[#142D4E] hover:bg-[#0B1B30] text-white focus:ring-[#2864B4] shadow-sm',
    secondary: 'bg-[#EAF2FC] hover:bg-[#d8e7fa] text-[#142D4E] focus:ring-[#2864B4]',
    outline: 'border border-[#E4E9F0] bg-white hover:bg-[#F7F9FC] text-[#182230] focus:ring-[#2864B4] shadow-sm',
    destructive: 'bg-[#C0393A] hover:bg-[#a62f30] text-white focus:ring-[#C0393A] shadow-sm',
    icon: 'p-2 text-[#667085] hover:text-[#182230] hover:bg-[#EEF1F5] rounded-full focus:ring-[#2864B4]',
  };

  const sizeStyles = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5',
    md: 'text-sm px-4 py-2 gap-2',
    lg: 'text-base px-6 py-3 gap-2.5',
    xl: 'text-lg px-8 py-4 gap-3 font-semibold',
  };

  return (
    <button
      className={twMerge(
        clsx(
          baseStyles,
          variantStyles[variant],
          variant !== 'icon' && sizeStyles[size],
          className
        )
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span>Loading...</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
