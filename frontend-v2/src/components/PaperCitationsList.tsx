import { Link } from 'react-router-dom';
import { BookOpenIcon, ExternalLinkIcon } from '@/components/icons';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { cn } from '@/lib/utils';
import type { Citation } from '@/lib/api/papers';

interface PaperCitationsListProps {
  citations: Citation[];
  isLoading: boolean;
  error: any;
  className?: string;
}

export function PaperCitationsList({ citations, isLoading, error, className }: PaperCitationsListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return <ErrorState size="row" title="Unable to load citations" />;
  }

  if (!citations || citations.length === 0) {
    return <EmptyState size="row" title="No citations found for this paper" />;
  }

  const internalCitations = citations.filter(c => c.cited_paper_id !== null && c.cited_paper);
  const externalCitations = citations.filter(c => c.cited_paper_id === null);

  const renderCitation = (citation: Citation) => {
    const isInternal = !!citation.cited_paper_id;
    const title = isInternal ? citation.cited_paper?.title : citation.external_paper_title;
    const authors = isInternal ? citation.cited_paper?.authors : null;
    const doi = isInternal ? citation.cited_paper?.doi : citation.external_paper_doi;
    const url = isInternal ? `/papers/${citation.cited_paper?.id}` : (doi ? `https://doi.org/${doi}` : null);

    return (
      <div key={citation.id} className="group p-4 rounded-xl border border-(--border) bg-(--card) hover:border-(--muted-foreground)/30 transition-all">
        <div className="flex items-start justify-between gap-2">
          {url ? (
            isInternal ? (
              <Link 
                to={url}
                className="text-code font-medium text-(--foreground) hover:text-(--sky-blue) transition-colors flex-1 break-words"
              >
                {title || 'Untitled Paper'}
              </Link>
            ) : (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-code font-medium text-(--foreground) hover:text-(--sky-blue) transition-colors flex-1 break-words"
              >
                {title || 'Untitled Paper'}
              </a>
            )
          ) : (
            <span className="text-code font-medium text-(--foreground) flex-1 break-words">
              {title || 'Untitled Paper'}
            </span>
          )}
          
          {url && (
            isInternal ? (
              <Link to={url} className="text-(--muted-foreground) hover:text-(--foreground) transition-colors p-1">
                <BookOpenIcon size="sm" />
              </Link>
            ) : (
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-(--muted-foreground) hover:text-(--foreground) transition-colors p-1">
                <ExternalLinkIcon size="sm" />
              </a>
            )
          )}
        </div>

        {authors && (
          <p className="mt-1 text-caption text-(--muted-foreground) break-words">
            {authors}
          </p>
        )}

        {citation.citation_context && (
          <p className="mt-2 text-caption text-(--muted-foreground) opacity-80 break-words whitespace-pre-wrap bg-(--muted)/20 p-1.5 rounded">
            "{citation.citation_context}"
          </p>
        )}

        {doi && (
          <div className="mt-1.5 text-micro text-(--muted-foreground) opacity-50 tabular-nums">
            DOI: {doi}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={cn("space-y-6", className)}>
      {internalCitations.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-caption font-bold uppercase tracking-wider text-(--muted-foreground)">
              Library Papers
            </h4>
            <span className="text-micro bg-(--muted) px-1.5 py-0.5 rounded-full tabular-nums">
              {internalCitations.length}
            </span>
          </div>
          <div className="space-y-3">
            {internalCitations.map(renderCitation)}
          </div>
        </section>
      )}

      {externalCitations.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-caption font-bold uppercase tracking-wider text-(--muted-foreground)">
              External References
            </h4>
            <span className="text-micro bg-(--muted) px-1.5 py-0.5 rounded-full tabular-nums">
              {externalCitations.length}
            </span>
          </div>
          <div className="space-y-3">
            {externalCitations.map(renderCitation)}
          </div>
        </section>
      )}
    </div>
  );
}
