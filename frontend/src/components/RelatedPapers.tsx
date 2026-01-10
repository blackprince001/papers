import { type RelatedPaperExternal, type Paper } from '@/lib/api/papers';
import { ExternalLinkIcon, BookOpenIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

export function CitationsList({ related, isLoading, error }: { related?: any, isLoading: boolean, error: any }) {
  if (isLoading) return <div className="p-4 text-sm text-anara-light-text-muted">Loading citations...</div>;
  
  // If there's an error but we have data, show the data anyway
  if (error && (!related || (!related.cited_by?.length && !related.cited_here?.length))) {
    return <div className="p-4 text-sm text-gray-500">Unable to load citations at this time.</div>;
  }

  const renderExternalPaper = (paper: RelatedPaperExternal, index: number) => (
    <div key={index} className="py-3 border-b border-anara-light-border last:border-b-0 group">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium text-anara-light-text line-clamp-2">
          {paper.title || 'Untitled Paper'}
        </h4>
        {paper.url && (
          <a
            href={paper.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-anara-light-text-muted hover:text-gray-900 transition-colors pt-0.5 shrink-0"
          >
            <ExternalLinkIcon size={14} />
          </a>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-anara-light-text-muted">
        {paper.authors && paper.authors.length > 0 && (
          <span className="truncate max-w-[200px]">{paper.authors.join(', ')}</span>
        )}
        {paper.year && <span>({paper.year})</span>}
        {paper.doi && <span className="text-anara-light-text-muted/70">DOI: {paper.doi}</span>}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-anara-light-text-muted mb-3 flex items-center justify-between">
          Cited by
          <span className="bg-gray-100 px-1.5 py-0.5 rounded-sm text-xs">{related?.cited_by?.length || 0}</span>
        </h3>
        <div className="space-y-1">
          {related?.cited_by && related.cited_by.length > 0 ? (
            related.cited_by.map((item: any, idx: number) => renderExternalPaper(item, idx))
          ) : (
            <p className="py-4 text-center text-xs text-anara-light-text-muted/50 italic">No citations found</p>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-anara-light-text-muted mb-3 flex items-center justify-between">
          Cited here
          <span className="bg-gray-100 px-1.5 py-0.5 rounded-sm text-xs">{related?.cited_here?.length || 0}</span>
        </h3>
        <div className="space-y-1">
          {related?.cited_here && related.cited_here.length > 0 ? (
            related.cited_here.map((item: any, idx: number) => renderExternalPaper(item, idx))
          ) : (
            <p className="py-4 text-center text-xs text-anara-light-text-muted/50 italic">No references found</p>
          )}
        </div>
      </section>
    </div>
  );
}

export function SimilarList({ related, isLoading, error }: { related?: any, isLoading: boolean, error: any }) {
  if (isLoading) return <div className="p-4 text-sm text-anara-light-text-muted">Loading recommendations...</div>;
  
  // If there's an error but we have data, show the data anyway
  if (error && (!related || (!related.related_library?.length && !related.related_internet?.length))) {
    return <div className="p-4 text-sm text-gray-500">Unable to load recommendations at this time.</div>;
  }

  const renderLibraryPaper = (paper: Paper) => (
    <div key={paper.id} className="py-3 border-b border-anara-light-border last:border-b-0 group">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/papers/${paper.id}`}
          className="text-sm font-medium text-anara-light-text hover:text-gray-900 transition-colors line-clamp-2"
        >
          {paper.title}
        </Link>
        <Link to={`/papers/${paper.id}`} className="text-anara-light-text-muted hover:text-gray-900 transition-colors pt-0.5 shrink-0">
          <BookOpenIcon size={14} />
        </Link>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-anara-light-text-muted">
        <span>Added {new Date(paper.created_at).getFullYear()}</span>
        {paper.doi && <span className="text-anara-light-text-muted/70">DOI: {paper.doi}</span>}
      </div>
    </div>
  );

  const renderExternalPaper = (paper: RelatedPaperExternal, index: number) => (
    <div key={index} className="py-3 border-b border-anara-light-border last:border-b-0 group">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium text-anara-light-text line-clamp-2">
          {paper.title || 'Untitled Paper'}
        </h4>
        {paper.url && (
          <a
            href={paper.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-anara-light-text-muted hover:text-gray-900 transition-colors pt-0.5 shrink-0"
          >
            <ExternalLinkIcon size={14} />
          </a>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-anara-light-text-muted">
        {paper.authors && paper.authors.length > 0 && (
          <span className="truncate max-w-[200px]">{paper.authors.join(', ')}</span>
        )}
        {paper.year && <span>({paper.year})</span>}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-anara-light-text-muted mb-3 flex items-center justify-between">
          In Library
          <span className="bg-gray-100 px-1.5 py-0.5 rounded-sm text-xs">{related?.related_library?.length || 0}</span>
        </h3>
        <div className="space-y-1">
          {related?.related_library && related.related_library.length > 0 ? (
            related.related_library.map((item: any) => renderLibraryPaper(item))
          ) : (
            <p className="py-4 text-center text-xs text-anara-light-text-muted/50 italic">No similar papers in library</p>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-anara-light-text-muted mb-3 flex items-center justify-between">
          From Web
          <span className="bg-gray-100 px-1.5 py-0.5 rounded-sm text-xs">{related?.related_internet?.length || 0}</span>
        </h3>
        <div className="space-y-1">
          {related?.related_internet && related.related_internet.length > 0 ? (
            related.related_internet.map((item: any, idx: number) => renderExternalPaper(item, idx))
          ) : (
            <p className="py-4 text-center text-xs text-anara-light-text-muted/50 italic">No similar papers on web</p>
          )}
        </div>
      </section>
    </div>
  );
}
