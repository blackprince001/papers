import SectionWithMockup from '@/components/ui/section-with-mockup';
import { Carousel } from '@/components/Carousel';
import { IMG_CROP, IMG_CROP_RIGHT, IMG_WIDE, IMG_WIDE_LEFT } from '@/lib/img';

interface Step {
  eyebrow: string;
  accent: string;
  title: string;
  description: string;
  alt: string;
  /** Single screenshot, or a stack of screenshots shown as a click-to-cycle deck. */
  src?: string;
  images?: string[];
  reverse: boolean;
}

const STEPS: Step[] = [
  {
    eyebrow: 'Step 1 — Discover',
    accent: 'text-mint',
    title: 'Nail your literature discovery',
    description:
      'Search arXiv, Semantic Scholar, OpenAlex and more in one place. Lumen clusters results by topic and writes an AI synthesis so you build a rock-solid foundation fast.',
    alt: 'Research discovery',
    images: ['/screens/discovery-3.png', '/screens/discovery-3a.png'],
    reverse: false,
  },
  {
    eyebrow: 'Step 2 — Read & annotate',
    accent: 'text-sky',
    title: 'Read, highlight, and ask',
    description:
      'Open papers in the built-in reader, highlight passages, attach notes, and chat with the paper to clarify anything. Auto-generated summaries and key findings get you oriented in seconds.',
    alt: 'Reader with annotations',
    images: [
      '/screens/reader-annotations.png',
      '/screens/chat-with-pdf-light.png',
      '/screens/chat-with-group.png',
    ],
    reverse: true,
  },
  {
    eyebrow: 'Step 3 — Connect & export',
    accent: 'text-coral',
    title: 'See how it all connects',
    description:
      'Lumen extracts citations and renders an interactive map of how your papers relate, so you can navigate the literature by its overlapping references — not just a flat list.',
    alt: 'Citation map',
    src: '/screens/citation-map.png',
    reverse: false,
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative bg-forest py-24 md:py-32">
      <div className="mx-auto mb-16 max-w-2xl px-6 text-center md:mb-24">
        <span className="text-sm font-semibold uppercase tracking-[0.12em] text-mint">
          The workflow
        </span>
        <h2 className="mt-3 text-4xl font-bold tracking-tight text-white md:text-5xl">
          From first paper to final draft
        </h2>
      </div>

      <div className="flex flex-col gap-24 md:gap-36">
        {STEPS.map((s) => {
          const sizing = s.reverse ? IMG_WIDE_LEFT : IMG_WIDE;
          // Reversed steps sit left of the copy, so keep their right edge; normal steps keep their left.
          const crop = s.reverse ? IMG_CROP_RIGHT : IMG_CROP;
          return (
            <SectionWithMockup
              key={s.eyebrow}
              eyebrow={s.eyebrow}
              accentClassName={s.accent}
              title={s.title}
              description={s.description}
              reverseLayout={s.reverse}
              mockup={
                s.images ? (
                  <Carousel
                    images={s.images}
                    alt={s.alt}
                    tone="dark"
                    className={sizing}
                    imgClassName={crop}
                  />
                ) : (
                  <img
                    src={s.src}
                    alt={s.alt}
                    loading="lazy"
                    className={`${sizing} ${crop}`}
                  />
                )
              }
            />
          );
        })}
      </div>

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
        style={{
          background:
            'radial-gradient(50% 50% at 50% 50%, rgba(76,255,169,0.4) 0%, rgba(76,255,169,0) 100%)',
        }}
      />
    </section>
  );
}
