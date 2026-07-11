import { TickCircle } from 'iconsax-reactjs';
import { APP_URL } from '@/lib/site';

const POINTS = [
  'Bring your own keys for OpenAI, Claude, Gemini, and OpenRouter',
  'Switch the model per session — pick the right tool for each task',
  'Automatic fallback chain keeps you working when a provider errors',
];

export function Providers() {
  return (
    <section id="providers" className="bg-off-white px-6 py-24 md:px-10 md:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <div className="flex flex-col items-center">
          <span className="text-sm font-semibold uppercase tracking-[0.12em] text-mint-deep">
            Bring your own AI
          </span>
          <h2 className="mt-3 text-4xl font-bold leading-[1.05] tracking-tight text-forest md:text-5xl">
            An AI tool you can actually trust
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-mid-gray">
            Use the best models from OpenAI, Claude, and Gemini throughout your
            research, with your own keys, on your own infrastructure. Nothing
            leaves your self-hosted instance.
          </p>

          <ul className="mt-8 space-y-4 text-left">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3 text-base text-forest">
                <TickCircle
                  size={22}
                  variant="Bold"
                  className="mt-0.5 shrink-0 text-mint-deep"
                />
                {p}
              </li>
            ))}
          </ul>

          <a
            href={APP_URL}
            className="mt-10 inline-flex items-center gap-2 rounded-xl bg-forest px-6 py-3.5 text-base font-semibold text-off-white transition-[background-color,transform] duration-150 ease-out hover:bg-true-black active:scale-[0.97]"
          >
            Create a free account
          </a>
        </div>
      </div>
    </section>
  );
}
