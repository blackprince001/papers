import React from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost' | 'secondary' | 'destructive';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}) => {
  const variants = {
    primary: 'border border-blue-35 bg-blue-31 text-white hover:bg-blue-35',
    secondary: 'border border-blue-21 bg-blue-14 text-blue-38 hover:bg-blue-17',
    outline: 'border border-blue-21 bg-grayscale-8 hover:bg-blue-14 text-blue-38',
    ghost: 'border border-blue-31 bg-transparent hover:bg-blue-14 hover:text-blue-38 text-blue-31',
    destructive: 'border border-red-17 bg-red-13 text-grayscale-8 hover:bg-red-16',
  };

  const sizes = {
    sm: 'h-11 px-4 text-sm',        // 44px height - min touch target
    md: 'h-11 px-4 py-2 text-base', // 44px height
    lg: 'h-12 px-8 text-lg',        // 48px height
    icon: 'size-11',                // 44x44px
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-31 disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};
