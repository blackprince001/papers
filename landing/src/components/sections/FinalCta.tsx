import { ArrowRight, Cloud } from 'iconsax-reactjs';
import { Placeholder } from '@/components/Placeholder';
import { APP_URL } from '@/lib/site';

export function FinalCta() {
  return (
    <section id="self-hosting" className="px-4 pb-20 md:px-6">
      <div className="mx-auto max-w-[1180px] overflow-hidden rounded-[32px] bg-forest px-6 py-16 md:px-16 md:py-24">
        <div className="flex flex-col items-center gap-3 text-center">
          <h2 className="max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight text-white md:text-6xl">
            Your library. Your keys. Your infrastructure.
          </h2>
          <p className="mt-2 max-w-xl text-lg text-white/70">
            Lumen keeps your whole research library — and the AI that reads it
            with you — on infrastructure you control. Nothing leaves your
            instance.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <a
              href={APP_URL}
              className="inline-flex items-center gap-2 rounded-xl bg-mint px-6 py-3.5 text-base font-semibold text-deep-forest transition-[background-color,transform] duration-150 ease-out hover:bg-mint/90 active:scale-[0.97]"
            >
              Get started free <ArrowRight size={18} />
            </a>
            <a
              href="https://github.com"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-6 py-3.5 text-base font-semibold text-white transition-[background-color,transform] duration-150 ease-out hover:bg-white/5 active:scale-[0.97]"
            >
              <Cloud size={18} /> Self-host it
            </a>
          </div>
        </div>

        <div className="mt-14">
          <Placeholder
            label="Lumen library"
            src="/screens/dashboard-dark.png"
            tone="dark"
            className="rounded-2xl border border-white/10"
          />
        </div>
      </div>
    </section>
  );
}
