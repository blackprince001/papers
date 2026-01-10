import { type Citation } from '@/lib/api/papers';
import { ExternalLinkIcon, BookOpenIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

interface PaperCitationsListProps {
  citations: Citation[];
  isLoading: boolean;
  error: any;
}

export function PaperCitationsList({ citations, isLoading, error }: PaperCitationsListProps) {
  if (isLoading) {
    return (
      <div className="p-4 text-sm text-anara-light-text-muted">Loading citations...</div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-600">
        Unable to load citations at this time. {error instanceof Error ? error.message : ''}
      </div>
    );
  }

  if (!citations || citations.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-anara-light-text-muted/50 italic">
        No citations found for this paper.
      </div>
    );
  }

  const renderInternalCitation = (citation: Citation) => {
    if (!citation.cited_paper) return null;

    return (
      <div key={citation.id} className="py-3 border-b border-anara-light-border last:border-b-0 group">
        <div className="flex items-start justify-between gap-2">
          <Link
            to={`/papers/${citation.cited_paper.id}`}
            className="text-sm font-medium text-anara-light-text hover:text-gray-900 transition-colors line-clamp-2 flex-1"
          >
            {citation.cited_paper.title}
          </Link>
          <Link
            to={`/papers/${citation.cited_paper.id}`}
            className="text-anara-light-text-muted hover:text-gray-900 transition-colors pt-0.5 shrink-0"
          >
            <BookOpenIcon size={14} />
          </Link>
        </div>
        {citation.cited_paper.metadata_json?.authors_list && Array.isArray(citation.cited_paper.metadata_json.authors_list) && citation.cited_paper.metadata_json.authors_list.length > 0 && (
          <div className="mt-1 text-xs text-anara-light-text-muted">
            {citation.cited_paper.metadata_json.authors_list.slice(0, 3).join(', ')}
            {citation.cited_paper.metadata_json.authors_list.length > 3 && ' et al.'}
          </div>
        )}
        {citation.citation_context && (
          <div className="mt-2 text-xs text-anara-light-text-muted/70 line-clamp-2 italic">
            {citation.citation_context}
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-anara-light-text-muted/70">
          {citation.cited_paper.doi && (
            <span>DOI: {citation.cited_paper.doi}</span>
          )}
          {citation.cited_paper.created_at && (
            <span>Added {new Date(citation.cited_paper.created_at).getFullYear()}</span>
          )}
        </div>
      </div>
    );
  };

  const renderExternalCitation = (citation: Citation) => {
    return (
      <div key={citation.id} className="py-3 border-b border-anara-light-border last:border-b-0 group">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-medium text-anara-light-text line-clamp-2 flex-1">
            {citation.external_paper_title || 'Untitled Paper'}
          </h4>
          {citation.external_paper_doi && (
            <a
              href={`https://doi.org/${citation.external_paper_doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-anara-light-text-muted hover:text-gray-900 transition-colors pt-0.5 shrink-0"
            >
              <ExternalLinkIcon size={14} />
            </a>
          )}
        </div>
        {citation.citation_context && (
          <div className="mt-2 text-xs text-anara-light-text-muted/70 line-clamp-2 italic">
            {citation.citation_context}
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-anara-light-text-muted/70">
          {citation.external_paper_doi && (
            <span>DOI: {citation.external_paper_doi}</span>
          )}
        </div>
      </div>
    );
  };

  // Separate internal and external citations
  const internalCitations = citations.filter(c => c.cited_paper_id !== null && c.cited_paper);
  const externalCitations = citations.filter(c => c.cited_paper_id === null);

  return (
    <div className="space-y-6">
      {internalCitations.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-anara-light-text-muted mb-3 flex items-center justify-between">
            Internal Citations
            <span className="bg-gray-100 px-1.5 py-0.5 rounded-sm text-xs">{internalCitations.length}</span>
          </h3>
          <div className="space-y-1">
            {internalCitations.map((citation) => renderInternalCitation(citation))}
          </div>
        </section>
      )}

      {externalCitations.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-anara-light-text-muted mb-3 flex items-center justify-between">
            External Citations
            <span className="bg-gray-100 px-1.5 py-0.5 rounded-sm text-xs">{externalCitations.length}</span>
          </h3>
          <div className="space-y-1">
            {externalCitations.map((citation) => renderExternalCitation(citation))}
          </div>
        </section>
      )}

      {internalCitations.length === 0 && externalCitations.length === 0 && (
        <div className="p-4 text-center text-sm text-anara-light-text-muted/50 italic">
          No citations found for this paper.
        </div>
      )}
    </div>
  );
}

