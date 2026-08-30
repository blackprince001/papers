import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import {
  ActivityIllustration,
  AnnotationIllustration,
  CitationIllustration,
  LibraryIllustration,
  SearchIllustration,
  SetupIllustration,
  type IllustrationComponent,
} from '../../components/illustrations';

interface Concept {
  name: string;
  illustration: IllustrationComponent;
  title: string;
  description: string;
  action?: ReactNode;
}

const concepts: Concept[] = [
  {
    name: 'Library',
    illustration: LibraryIllustration,
    title: 'Your library is empty',
    description: 'Add a paper to start building your research collection.',
    action: <Button size="sm">Add a paper</Button>,
  },
  {
    name: 'Search',
    illustration: SearchIllustration,
    title: 'No results found',
    description: 'Try a broader search or remove one of the filters.',
  },
  {
    name: 'Annotations',
    illustration: AnnotationIllustration,
    title: 'No annotations yet',
    description: 'Select text in a paper to save a highlight or note.',
  },
  {
    name: 'Citations',
    illustration: CitationIllustration,
    title: 'No citing works found yet',
    description: 'Citation relationships will appear here when they are available.',
  },
  {
    name: 'Activity',
    illustration: ActivityIllustration,
    title: 'Nothing to chart yet',
    description: 'Read and save papers to see your research activity grow.',
  },
  {
    name: 'Setup',
    illustration: SetupIllustration,
    title: 'Nothing is set up yet',
    description: 'Complete the setup above to make this space useful.',
    action: <Button size="sm" variant="outlined">Open settings</Button>,
  },
];

export default function EmptyStateSheet() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const forced = new URLSearchParams(window.location.search).get('theme');
    if (forced !== 'dark' && forced !== 'light') return;
    const isDark = forced === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.dataset.theme = forced;
  }, []);

  const toggleDark = () => {
    const isDark = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    setDark(isDark);
  };

  return (
    <main className="min-h-dvh bg-(--background) px-6 py-10 text-(--foreground) sm:px-10">
      <div className="mx-auto max-w-(--width-content-max) space-y-10">
        <header className="flex flex-wrap items-start gap-4">
          <div>
            <p className="text-caption font-semibold uppercase tracking-wide text-(--muted-foreground)">Phase 7 / EMPTY-01</p>
            <h1 className="mt-1">Empty-state illustrations</h1>
            <p className="mt-2 max-w-2xl text-code text-(--muted-foreground)">
              Six project-owned, theme-aware concepts for empty library, search, annotation, citation, activity, and setup states.
              The artwork is static and decorative beside the visible message.
            </p>
          </div>
          <Button variant="outlined" size="sm" className="ml-auto" onClick={toggleDark}>
            {dark ? 'Dark' : 'Light'}
          </Button>
        </header>

        <section aria-labelledby="concepts-heading" className="space-y-4">
          <div>
            <h2 id="concepts-heading" className="text-subheading font-semibold">Concept library</h2>
            <p className="mt-1 text-code text-(--muted-foreground)">The same contract rendered in a panel context.</p>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {concepts.map(({ name, illustration, title, description, action }) => (
              <article key={name} className="rounded-2xl border border-(--border) bg-(--card)">
                <div className="border-b border-(--border) px-5 py-3">
                  <h3 className="text-body font-semibold">{name}</h3>
                </div>
                <EmptyState
                  size="panel"
                  illustration={illustration}
                  title={title}
                  description={description}
                  actions={action}
                />
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="scale-heading" className="space-y-4">
          <div>
            <h2 id="scale-heading" className="text-subheading font-semibold">Scale contract</h2>
            <p className="mt-1 text-code text-(--muted-foreground)">Page and panel states carry artwork; row states remain text-only for dense lists.</p>
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
            <article className="rounded-2xl border border-(--border) bg-(--card)">
              <EmptyState
                size="page"
                illustration={LibraryIllustration}
                title="Page state"
                description="Large artwork establishes a calm page-level reset point."
              />
            </article>
            <div className="space-y-5">
              <article className="rounded-2xl border border-(--border) bg-(--card)">
                <EmptyState
                  size="panel"
                  illustration={AnnotationIllustration}
                  title="Panel state"
                  description="Medium artwork keeps a side panel useful without taking over the surface."
                />
              </article>
              <article className="rounded-2xl border border-(--border) bg-(--card)">
                <EmptyState size="row" title="Row state — no artwork" />
              </article>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
