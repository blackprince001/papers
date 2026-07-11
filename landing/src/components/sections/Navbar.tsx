import { useState } from 'react';
import { HamburgerMenu, CloseCircle, ArrowRight } from 'iconsax-reactjs';
import { Logo } from '@/components/Logo';
import { APP_URL, NAV_LINKS } from '@/lib/site';

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 px-4 pt-4 md:px-6">
      <nav className="mx-auto flex h-16 w-full max-w-[1180px] items-center justify-between rounded-2xl border border-border-gray bg-off-white/85 px-4 shadow-[0_4px_24px_rgba(35,41,39,0.06)] backdrop-blur-md md:px-6">
        <a href="#top" className="flex items-center gap-2.5 text-forest">
          <Logo size={30} />
          <span className="text-lg font-bold tracking-tight">Lumen</span>
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="text-sm font-medium text-mid-gray transition-colors hover:text-forest"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <a
            href={APP_URL}
            className="text-sm font-medium text-mid-gray transition-colors hover:text-forest"
          >
            Sign in
          </a>
          <a
            href={APP_URL}
            className="inline-flex items-center gap-1.5 rounded-xl bg-forest px-4 py-2 text-sm font-semibold text-off-white transition-[background-color,transform] duration-150 ease-out hover:bg-true-black active:scale-[0.97]"
          >
            Open Lumen <ArrowRight size={15} />
          </a>
        </div>

        <button
          className="text-forest md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={open}
        >
          {open ? <CloseCircle size={26} /> : <HamburgerMenu size={26} />}
        </button>
      </nav>

      {open && (
        <div className="mx-auto mt-2 flex w-full max-w-[1180px] flex-col gap-1 rounded-2xl border border-border-gray bg-off-white p-4 shadow-lg md:hidden">
          {NAV_LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              onClick={() => setOpen(false)}
              className="border-b border-border-gray py-3 text-sm font-medium text-mid-gray last:border-0 hover:text-forest"
            >
              {l.label}
            </a>
          ))}
          <a
            href={APP_URL}
            className="border-b border-border-gray py-3 text-sm font-medium text-mid-gray hover:text-forest"
          >
            Sign in
          </a>
          <a
            href={APP_URL}
            className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-xl bg-forest px-4 py-3 text-sm font-semibold text-off-white active:scale-[0.98]"
          >
            Open Lumen <ArrowRight size={15} />
          </a>
        </div>
      )}
    </header>
  );
}
