import { motion } from 'motion/react';
import { ArrowRight } from 'iconsax-reactjs';
import { BounceCard, CardTitle } from '@/components/ui/bounce-card-features';
import { APP_URL } from '@/lib/site';

interface Panel {
  title: string;
  caption: string;
  gradient: string;
  text: string;
  span: string;
  src?: string;
}

const PANELS: Panel[] = [
  {
    title: 'Chat with papers',
    caption: 'Context-aware Q&A',
    gradient: 'from-mint to-mint-deep',
    text: 'text-deep-forest',
    span: 'col-span-12 md:col-span-8',
    src: '/screens/chat-alongside.png',
  },
  {
    title: 'Auto summaries & key findings',
    caption: 'Generated on ingestion',
    gradient: 'from-sky to-[#2b6fbf]',
    text: 'text-white',
    span: 'col-span-12 md:col-span-4',
    src: '/screens/summary.png',
  },
  {
    title: 'Discover new papers',
    caption: 'Search across sources',
    gradient: 'from-violet-ink to-[#3b2870]',
    text: 'text-white',
    span: 'col-span-12 md:col-span-8',
    src: '/screens/discovery-1.png',
  },
  {
    title: 'Reading guides',
    caption: 'Questions to guide your read',
    gradient: 'from-coral to-[#b8442a]',
    text: 'text-white',
    span: 'col-span-12 md:col-span-4',
    src: '/screens/reading-guide.png',
  },
];

export function AiReading() {
  return (
    <section className="mx-auto max-w-[1180px] px-6 py-24 md:px-10 md:py-28">
      <div className="mb-10 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <h2 className="max-w-2xl text-4xl font-bold tracking-tight text-forest md:text-5xl">
          AI that helps you read,
          <span className="text-mid-gray"> not read for you.</span>
        </h2>
        <motion.a
          href={APP_URL}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-forest px-5 py-3 text-sm font-semibold text-off-white"
        >
          Try it free <ArrowRight size={16} />
        </motion.a>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {PANELS.map((p) => (
          <BounceCard key={p.title} className={p.span}>
            <CardTitle>{p.title}</CardTitle>
            <div
              className={`absolute inset-x-4 bottom-0 top-24 flex translate-y-8 flex-col gap-4 rounded-t-2xl bg-gradient-to-br ${p.gradient} p-5 transition-transform duration-[250ms] group-hover:translate-y-4 group-hover:rotate-[2deg]`}
            >
              <span className={`block text-center text-sm font-semibold ${p.text}`}>
                {p.caption}
              </span>
              {p.src ? (
                <div className="flex-1 overflow-hidden rounded-t-xl bg-white/10">
                  <img
                    src={p.src}
                    alt={p.title}
                    loading="lazy"
                    className="size-full object-cover object-top"
                  />
                </div>
              ) : (
                <div
                  className={`flex flex-1 items-center justify-center rounded-xl border border-dashed ${p.text === 'text-white' ? 'border-white/30 text-white/80' : 'border-deep-forest/30 text-deep-forest/80'} p-4 text-center text-xs`}
                >
                  Screenshot: {p.title.toLowerCase()}
                </div>
              )}
            </div>
          </BounceCard>
        ))}
      </div>
    </section>
  );
}
