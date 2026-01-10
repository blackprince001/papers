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
    primary: 'border border-green-38 bg-green-22 text-grayscale-8 hover:bg-green-21',
    secondary: 'border border-green-6 bg-green-4 text-green-38 hover:bg-green-5',
    outline: 'border border-green-6 bg-grayscale-8 hover:bg-green-4 text-green-38',
    ghost: 'border border-green-6 hover:bg-green-5 hover:text-green-38 text-green-34',
    destructive: 'border border-red-17 bg-red-13 text-grayscale-8 hover:bg-red-16',
  };

  const sizes = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 py-2 text-sm',
    lg: 'h-12 px-8 text-lg',
    icon: 'h-10 w-10',
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-38 disabled:pointer-events-none disabled:opacity-50",
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
