import { useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BuildingIcon,
  HashtagIcon,
  LibraryIcon,
  QuoteIcon,
  SearchIcon,
  UsersIcon,
  ArrowRightIcon,
} from '@/components/icons';
import { discoveryApi, type AuthorProfile } from '@/lib/api/discovery';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { AuthorAvatar, TopicChip } from '@/components/author/AuthorBits';

export default function AuthorSearch() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const nameParam = params.get('name') || '';

  const searchQuery = useQuery({
    queryKey: ['author-search', nameParam],
    queryFn: () => discoveryApi.searchAuthors(nameParam, 10),
    enabled: nameParam.length > 0,
  });

  const results = searchQuery.data?.results ?? [];

  const runSearch = (q: string) => {
    const trimmed = q.trim();
    if (trimmed) navigate(`/author?name=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="mx-auto max-w-main px-6 py-8">
      <header className="mb-6 space-y-1">
        <h1 className="flex items-center gap-2">
          Author Search
        </h1>
        <p className="text-body text-(--muted-foreground)">
          Find researchers and explore their publications and impact.
        </p>
      </header>

      {/* Search box — keyed by the URL param so it resets on navigation */}
      <SearchBox key={nameParam} initial={nameParam} onSubmit={runSearch} />

      {nameParam && (
        <p className="mb-4 text-caption text-(--muted-foreground)">
          {searchQuery.isLoading
            ? 'Searching…'
            : `${results.length} result${results.length === 1 ? '' : 's'} for `}
          {!searchQuery.isLoading && <span className="font-medium text-(--foreground)">{nameParam}</span>}
        </p>
      )}

      {searchQuery.isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-card" />
          ))}
        </div>
      )}

      {!searchQuery.isLoading && nameParam && results.length === 0 && (
        <EmptyState
          size="page"
          icon={SearchIcon}
          title={`No authors found matching “${nameParam}”`}
        />
      )}

      {!nameParam && (
        <EmptyState
          size="page"
          icon={UsersIcon}
          title="Enter a name above to search for authors"
        />
      )}

      {!searchQuery.isLoading && results.length > 0 && (
        <div className="space-y-3">
          {results.map((author) => (
            <AuthorCard key={author.openalex_id} author={author} />
          ))}
        </div>
      )}
    </div>
  );
}

function SearchBox({ initial, onSubmit }: { initial: string; onSubmit: (q: string) => void }) {
  const [input, setInput] = useState(initial);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(input);
      }}
      className="mb-8"
    >
      <div className="flex items-center gap-2 rounded-card border border-(--border) bg-(--card) px-3 py-2 transition-colors hover:border-(--foreground)/20 focus-within:border-(--foreground)/30">
        <SearchIcon size="md" className="shrink-0 text-(--muted-foreground)" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search by author name…"
          autoFocus
          className="w-full bg-transparent text-body text-(--foreground) outline-none placeholder:text-(--muted-foreground)"
        />
        {input.trim() && (
          <button
            type="submit"
            className="shrink-0 rounded-pill bg-(--foreground) px-3 py-1 text-caption font-medium text-(--card) transition-opacity hover:opacity-90"
          >
            Search
          </button>
        )}
      </div>
    </form>
  );
}

function AuthorCard({ author }: { author: AuthorProfile }) {
  return (
    <Link
      to={`/author/${author.openalex_id}`}
      className="paper-card-hover group block rounded-card border border-(--border) bg-(--card) p-4 no-underline"
    >
      <div className="flex items-start gap-3">
        <AuthorAvatar name={author.display_name} size="md" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-body-lg font-semibold text-(--foreground)">{author.display_name}</h3>
            <ArrowRightIcon
              size="md"
              className="mt-1 shrink-0 text-(--muted-foreground) opacity-0 transition-opacity group-hover:opacity-100"
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption text-(--muted-foreground)">
            {author.institutions?.[0]?.name && (
              <span className="flex items-center gap-1">
                <BuildingIcon size="xs" />
                {author.institutions[0].name}
                {author.institutions[0].country && ` · ${author.institutions[0].country}`}
              </span>
            )}
            {author.h_index != null && (
              <span className="flex items-center gap-1">
                <HashtagIcon size="xs" />
                h-index {author.h_index}
              </span>
            )}
            {author.works_count != null && (
              <span className="flex items-center gap-1">
                <LibraryIcon size="xs" />
                {author.works_count.toLocaleString()} works
              </span>
            )}
            {author.cited_by_count != null && (
              <span className="flex items-center gap-1">
                <QuoteIcon size="xs" />
                {author.cited_by_count.toLocaleString()} citations
              </span>
            )}
          </div>

          {author.topics && author.topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {author.topics.slice(0, 5).map((t, i) => (
                <TopicChip key={i} label={t.name ?? ''} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
