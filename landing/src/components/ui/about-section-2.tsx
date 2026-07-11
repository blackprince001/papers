import { useRef, useState } from 'react';
import { AnimatePresence, motion, type Variants } from 'motion/react';
import { TimelineContent } from '@/components/ui/timeline-animation';
import { Placeholder } from '@/components/Placeholder';
import { Carousel } from '@/components/Carousel';
import { IMG_TALL, IMG_WIDE } from '@/lib/img';

interface ContentType {
  label: string;
  hint: string;
  /** Drop a screenshot here, e.g. '/screens/papers.png'. Falls back to a placeholder. */
  img?: string;
  /** A stack of screenshots shown as a click-to-cycle deck. */
  images?: string[];
  /** Tall, narrow tab panels — height-capped so they stay small and crisp. */
  tall?: boolean;
}

const CONTENT_TYPES: ContentType[] = [
  {
    label: 'Papers & PDFs',
    hint: 'The library list with reading status, groups, and tags.',
    images: ['/screens/paperlist-light.png', '/screens/paperlist-dark.png'],
  },
  {
    label: 'Highlights & notes',
    hint: 'Highlighted passages and inline notes attached in the reader.',
    images: ['/screens/reader-annotations.png', '/screens/highlights-notes-dark.png'],
  },
  {
    label: 'AI summaries',
    hint: 'Auto-generated summary and key findings panel.',
    img: '/screens/summary.png',
    tall: true,
  },
  {
    label: 'Citations',
    hint: 'Extracted references and the citation map.',
    img: '/screens/citations.png',
    tall: true,
  },
  {
    label: 'Reading guides',
    hint: 'AI questions that guide your read of the paper.',
    img: '/screens/reading-guide.png',
    tall: true,
  },
];

export default function AboutSection2() {
  const heroRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const revealVariants: Variants = {
    visible: (i: number) => ({
      y: 0,
      opacity: 1,
      filter: 'blur(0px)',
      transition: { delay: i * 0.08, duration: 0.5, ease: 'easeOut' },
    }),
    hidden: { filter: 'blur(8px)', y: 20, opacity: 0 },
  };

  const textVariants: Variants = {
    visible: (i: number) => ({
      filter: 'blur(0px)',
      opacity: 1,
      transition: { delay: i * 0.06, duration: 0.45, ease: 'easeOut' },
    }),
    hidden: { filter: 'blur(8px)', opacity: 0 },
  };

  const current = CONTENT_TYPES[active];

  return (
    <section className="bg-off-white px-6 py-24 md:px-10 md:py-32">
      <div className="mx-auto max-w-[1180px]" ref={heroRef}>
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left — copy + clickable content types */}
          <div>
            <TimelineContent
              as="h2"
              animationNum={0}
              timelineRef={heroRef}
              customVariants={revealVariants}
              className="text-3xl font-semibold leading-[1.1] tracking-tight text-forest sm:text-4xl md:text-[44px]"
            >
              Your library is{' '}
              <TimelineContent
                as="span"
                animationNum={1}
                timelineRef={heroRef}
                customVariants={textVariants}
                className="inline-block rounded-lg border-2 border-dotted border-mint-deep px-2 text-mint-deep"
              >
                read, understood,
              </TimelineContent>{' '}
              and connected, not just stored. Lumen turns a folder of PDFs into
              a workspace you can actually{' '}
              <TimelineContent
                as="span"
                animationNum={2}
                timelineRef={heroRef}
                customVariants={textVariants}
                className="inline-block rounded-lg border-2 border-dotted border-coral px-2 text-coral"
              >
                think in.
              </TimelineContent>
            </TimelineContent>

            <TimelineContent
              as="p"
              animationNum={3}
              timelineRef={heroRef}
              customVariants={textVariants}
              className="mt-8 max-w-xl text-lg leading-relaxed text-mid-gray"
            >
              Ingest from arXiv, ACM, IEEE, OpenReview and more, then let Lumen
              summarize, extract key findings, and surface the passages that
              matter all in one place, fully self-hosted.
            </TimelineContent>

            <div className="mt-12 grid grid-cols-2 gap-x-8">
              {CONTENT_TYPES.map((item, i) => {
                const isActive = i === active;
                return (
                  <TimelineContent
                    key={item.label}
                    as="button"
                    animationNum={4 + i}
                    timelineRef={heroRef}
                    customVariants={textVariants}
                    onClick={() => setActive(i)}
                    className={`flex items-center gap-3 border-t py-4 text-left text-lg font-semibold transition-colors ${
                      isActive
                        ? 'border-forest text-forest'
                        : 'border-border-gray text-mid-gray hover:text-forest'
                    }`}
                  >
                    <span
                      className={`size-2.5 rounded-full transition-colors ${
                        isActive ? 'bg-mint-deep' : 'bg-cool-gray'
                      }`}
                    />
                    {item.label}
                  </TimelineContent>
                );
              })}
            </div>
          </div>

          {/* Right — screenshot swapped by the active content type, at natural size */}
          <div>
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                {current.images ? (
                  <Carousel
                    images={current.images}
                    alt={current.label}
                    className={current.tall ? IMG_TALL : IMG_WIDE}
                  />
                ) : current.img ? (
                  <img
                    src={current.img}
                    alt={current.label}
                    className={current.tall ? IMG_TALL : IMG_WIDE}
                  />
                ) : (
                  <Placeholder
                    label={current.label}
                    hint={current.hint}
                    className="min-h-[360px]"
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
