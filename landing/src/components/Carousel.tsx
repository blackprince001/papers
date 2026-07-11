import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface CarouselProps {
  images: string[];
  alt: string;
  /** Sizing class for the outer frame (e.g. IMG_WIDE). */
  className?: string;
  /** Extra classes for the front image itself (e.g. IMG_CROP height caps). */
  imgClassName?: string;
  /** Deck-card styling behind the front image. */
  tone?: 'light' | 'dark';
}

/**
 * A stacked deck of screenshots. Clicking anywhere advances to the next image,
 * cycling through like a deck of cards. No prev/next buttons by design.
 */
export function Carousel({
  images,
  alt,
  className,
  imgClassName,
  tone = 'light',
}: CarouselProps) {
  const [i, setI] = useState(0);
  const n = images.length;
  const next = () => setI((prev) => (prev + 1) % n);

  const deck =
    tone === 'dark'
      ? 'border-white/10 bg-white/[0.06]'
      : 'border-forest/10 bg-card-surface';

  return (
    <button
      type="button"
      aria-label={`${alt} — click to cycle through ${n} screenshots`}
      onClick={next}
      className={cn(
        'group relative block cursor-pointer select-none rounded-2xl text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring',
        className
      )}
    >
      {/* Deck cards peeking out behind the front image */}
      <div
        aria-hidden
        className={cn(
          'absolute inset-0 translate-x-3 translate-y-3 rotate-[1.5deg] rounded-2xl border shadow-lg transition-transform duration-300 group-hover:translate-x-4 group-hover:translate-y-4',
          deck
        )}
      />
      <div
        aria-hidden
        className={cn(
          'absolute inset-0 translate-x-1.5 translate-y-1.5 rotate-[0.6deg] rounded-2xl border',
          deck
        )}
      />

      <AnimatePresence mode="wait">
        <motion.img
          key={i}
          src={images[i]}
          alt={`${alt} (${i + 1} of ${n})`}
          loading="lazy"
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.985 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className={cn(
            'relative block h-auto w-full rounded-2xl shadow-[0_30px_90px_-20px_rgba(35,41,39,0.55)] ring-1 ring-forest/5',
            imgClassName
          )}
        />
      </AnimatePresence>

      {/* Progress dots */}
      <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 rounded-full bg-forest/35 px-2.5 py-1.5 backdrop-blur-sm">
        {images.map((_, idx) => (
          <span
            key={idx}
            className={cn(
              'size-1.5 rounded-full transition-colors',
              idx === i ? 'bg-white' : 'bg-white/40'
            )}
          />
        ))}
      </div>
    </button>
  );
}
