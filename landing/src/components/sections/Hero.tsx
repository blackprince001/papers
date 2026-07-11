import { ArrowRight } from 'iconsax-reactjs';
import { APP_URL } from '@/lib/site';

export function Hero() {
  return (
    <section id="top" className="px-4 pt-16 md:px-6 md:pt-24">
      <div className="mx-auto w-full max-w-[1180px]">
        <h1 className="max-w-[15ch] text-[44px] font-extrabold leading-[0.95] tracking-[-0.03em] text-forest sm:text-6xl md:text-7xl lg:text-[88px]">
          The home your papers and references{' '}
          <span className="inline-block -rotate-1 rounded-2xl bg-mint px-4 leading-tight text-forest">
            deserve
          </span>
          .
        </h1>

        <p className="mt-8 max-w-2xl text-xl leading-relaxed text-mid-gray md:text-2xl">
          Lumen organizes your whole research library, chats with your papers,
          and maps the citations between them, so you can read, understand, and
          write faster.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <a
            href={APP_URL}
            className="inline-flex items-center gap-2 rounded-xl bg-forest px-6 py-3.5 text-base font-semibold text-off-white transition-[background-color,transform] duration-150 ease-out hover:bg-true-black active:scale-[0.97]"
          >
            Open Lumen <ArrowRight size={18} />
          </a>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2 rounded-xl border border-border-gray bg-off-white px-6 py-3.5 text-base font-semibold text-forest transition-[background-color,transform] duration-150 ease-out hover:bg-card-surface active:scale-[0.97]"
          >
            See how it works
          </a>
        </div>

        <div
          className="relative z-0 mt-16 md:mt-20"
          style={{ perspective: '2200px' }}
        >
          <img
            src="/screens/dashboard-light.png"
            alt="Lumen library"
            fetchPriority="high"
            className="block w-full rounded-2xl shadow-[0_50px_90px_-40px_rgba(35,41,39,0.55)]"
            style={{
              transform: 'rotateX(9deg) scale(1.01)',
              transformOrigin: 'center top',
            }}
          />
        </div>
      </div>
    </section>
  );
}
