import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BuildingIcon,
  LibraryIcon,
  QuoteIcon,
  HashtagIcon,
  AwardIcon,
  ExternalLinkIcon,
  GlobeIcon,
  CalendarIcon,
  ArrowRightIcon,
} from '@/components/icons';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchIllustration } from '@/components/illustrations';
import { discoveryApi, type AuthorProfile, type AuthorWork } from '@/lib/api/discovery';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import { AuthorAvatar, StatCard, TopicChip } from '@/components/author/AuthorBits';

type WorkSort = 'cited' | 'recent';

export default function AuthorDetail() {
  const { id } = useParams<{ id: string }>();
  const [sort, setSort] = useState<WorkSort>('cited');

  const worksQuery = useQuery({
    queryKey: ['author-works', id],
    queryFn: () => discoveryApi.getAuthorWorks(id!, 50),
    enabled: !!id,
  });

  const authorName = worksQuery.data?.display_name;
  const profileQuery = useQuery({
    queryKey: ['author-profile', authorName],
    queryFn: () => discoveryApi.searchAuthors(authorName!, 10),
    enabled: !!authorName,
  });

  const profile: AuthorProfile | undefined =
    profileQuery.data?.results?.find((a) => a.openalex_id === id) ??
    profileQuery.data?.results?.[0];

  const worksData = worksQuery.data?.results;
  const works = useMemo(() => worksData ?? [], [worksData]);
  const displayName = profile?.display_name ?? authorName ?? '';
  const isLoading = worksQuery.isLoading;

  const sortedWorks = useMemo(() => {
    const copy = [...works];
    if (sort === 'recent') {
      copy.sort((a, b) => (b.publication_year ?? 0) - (a.publication_year ?? 0));
    } else {
      copy.sort((a, b) => (b.cited_by_count ?? 0) - (a.cited_by_count ?? 0));
    }
    return copy;
  }, [works, sort]);

  return (
    <div className="mx-auto max-w-main px-6 py-8">
      {isLoading && <AuthorDetailSkeleton />}

      {!isLoading && !works.length && !displayName && (
        <EmptyState
          size="page"
          illustration={SearchIllustration}
          title={`No author found for ID ${id}`}
        />
      )}

      {!isLoading && (works.length > 0 || displayName) && (
        <div className="space-y-10">
          {/* ── Header ───────────────────────────────────────────────── */}
          <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <AuthorAvatar name={displayName} size="lg" />
            <div className="min-w-0 flex-1 space-y-3">
              <h1 className="break-words">{displayName}</h1>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-caption text-(--muted-foreground)">
                {profile?.institutions?.[0]?.name && (
                  <span className="flex items-center gap-1.5">
                    <BuildingIcon size="sm" />
                    {profile.institutions[0].name}
                    {profile.institutions[0].country && (
                      <span className="text-(--muted-foreground)/70">· {profile.institutions[0].country}</span>
                    )}
                  </span>
                )}
                {profile?.orcid && (
                  <a
                    href={profile.orcid}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 transition-colors hover:text-(--foreground)"
                  >
                    <ExternalLinkIcon size="sm" />
                    ORCID
                  </a>
                )}
                {id && (
                  <a
                    href={`https://openalex.org/${id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 transition-colors hover:text-(--foreground)"
                  >
                    <GlobeIcon size="sm" />
                    OpenAlex
                  </a>
                )}
                {profileQuery.isLoading && <Skeleton className="h-4 w-24" />}
              </div>

              {/* Secondary affiliations */}
              {profile?.institutions && profile.institutions.length > 1 && (
                <p className="text-caption text-(--muted-foreground)/80">
                  Also affiliated with{' '}
                  {profile.institutions
                    .slice(1, 4)
                    .map((inst) => inst.name)
                    .filter(Boolean)
                    .join(', ')}
                  {profile.institutions.length > 4 && ` +${profile.institutions.length - 4} more`}
                </p>
              )}
            </div>
          </header>

          {/* ── Stats ────────────────────────────────────────────────── */}
          {profile && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard icon={LibraryIcon} label="Publications" value={profile.works_count} />
              <StatCard icon={QuoteIcon} label="Citations" value={profile.cited_by_count} />
              {profile.h_index != null && <StatCard icon={HashtagIcon} label="h-index" value={profile.h_index} />}
              {profile.i10_index != null && (
                <StatCard icon={AwardIcon} label="i10-index" value={profile.i10_index} />
              )}
            </div>
          )}

          {/* ── Topics ───────────────────────────────────────────────── */}
          {profile?.topics && profile.topics.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-micro font-semibold uppercase tracking-wider text-(--muted-foreground)">
                Research Topics
              </h2>
              <div className="flex flex-wrap gap-2">
                {profile.topics.slice(0, 12).map((t, i) => (
                  <TopicChip key={i} label={t.name ?? ''} />
                ))}
              </div>
            </section>
          )}

          {/* ── Works ────────────────────────────────────────────────── */}
          {works.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <h2 className="flex items-center gap-2 text-subheading">
                  <LibraryIcon size="md" />
                  Selected Works
                  <span className="text-caption font-normal text-(--muted-foreground)">
                    ({works.length})
                  </span>
                </h2>
                <div className="flex items-center gap-0.5 rounded-pill border border-(--border) bg-(--card) p-0.5">
                  <SortButton active={sort === 'cited'} onClick={() => setSort('cited')}>
                    Most cited
                  </SortButton>
                  <SortButton active={sort === 'recent'} onClick={() => setSort('recent')}>
                    Newest
                  </SortButton>
                </div>
              </div>

              <div className="space-y-2">
                {sortedWorks.map((work, i) => (
                  <WorkRow key={work.openalex_id || i} work={work} rank={sort === 'cited' ? i + 1 : undefined} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function SortButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-pill px-3 py-1 text-caption font-medium transition-colors',
        active
          ? 'bg-(--foreground) text-(--card)'
          : 'text-(--muted-foreground) hover:text-(--foreground)',
      )}
    >
      {children}
    </button>
  );
}

function WorkRow({ work, rank }: { work: AuthorWork; rank?: number }) {
  const href = work.doi
    ? `https://doi.org/${work.doi.replace(/^https?:\/\/doi\.org\//, '')}`
    : work.openalex_id
      ? `https://openalex.org/${work.openalex_id}`
      : undefined;

  return (
    <div className="paper-card-hover group flex items-start gap-3 rounded-card border border-(--border) bg-(--card) p-4">
      {rank != null && (
        <span className="mt-0.5 w-5 shrink-0 text-right text-caption tabular-nums text-(--muted-foreground)/60">
          {rank}
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-1.5">
        <h3 className="text-body leading-snug text-(--foreground)">
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {work.title}
            </a>
          ) : (
            work.title
          )}
        </h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-(--muted-foreground)">
          {work.publication_year && (
            <span className="flex items-center gap-1">
              <CalendarIcon size="xs" />
              {work.publication_year}
            </span>
          )}
          {work.cited_by_count != null && (
            <span className="flex items-center gap-1">
              <QuoteIcon size="xs" />
              {work.cited_by_count.toLocaleString()} citations
            </span>
          )}
          {work.doi && (
            <span className="truncate font-mono text-(--muted-foreground)/60">{work.doi}</span>
          )}
        </div>
        {work.authors && work.authors.length > 0 && (
          <p className="truncate text-caption text-(--muted-foreground)/70">
            {work.authors.slice(0, 8).join(', ')}
            {work.authors.length > 8 && ` +${work.authors.length - 8}`}
          </p>
        )}
      </div>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open work"
          className="mt-0.5 shrink-0 text-(--muted-foreground) opacity-0 transition-opacity group-hover:opacity-100 hover:text-(--foreground)"
        >
          <ArrowRightIcon size="md" />
        </a>
      )}
    </div>
  );
}

function AuthorDetailSkeleton() {
  return (
    <div className="space-y-10">
      <div className="flex gap-5">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-8 w-72 rounded-lg" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 rounded-card" />
        ))}
      </div>
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-20 rounded-card" />
        ))}
      </div>
    </div>
  );
}
