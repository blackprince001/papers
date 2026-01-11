import type { Variants } from 'motion/react';

/**
 * Animation utilities for iOS-grade micro-interactions
 * Only animates compositor properties (opacity, transform) per design constraints
 */

// Staggered container for list/grid animations
export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

// Fade up animation for list items
export const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: 'easeOut' },
  },
};

// Fade in animation for simple reveals
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.15, ease: 'easeOut' },
  },
};

// Scale fade for modals/dialogs
export const scaleFade: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.15, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.1 },
  },
};

// Slide in from left (for sidebar content, chat messages)
export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.2, ease: 'easeOut' },
  },
};

// Slide in from right
export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.2, ease: 'easeOut' },
  },
};

// Card hover animation props (use with whileHover)
export const cardHover = {
  scale: 1.02,
  y: -4,
  transition: { duration: 0.15, ease: 'easeOut' },
};

// Button tap animation (use with whileTap)
export const buttonTap = {
  scale: 0.98,
  transition: { duration: 0.1 },
};

// Sidebar expand/collapse transition
export const sidebarTransition = {
  duration: 0.2,
  ease: 'easeOut',
};

// Default spring for smooth interactions
export const smoothSpring = {
  type: 'spring',
  stiffness: 400,
  damping: 30,
};
