import { format } from 'date-fns';
import { RefreshCw, FileSearch } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { type Paper, papersApi } from '@/lib/api/papers';
import { type UseMutationResult } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { TagInput } from '@/components/TagInput';
import { TagList } from '@/components/TagList';
import { PaperCitationsList } from '@/components/PaperCitationsList';

interface PaperDetailsPanelProps {
  paper: Paper;
  paperId: number;
  updatePaperTagsMutation: UseMutationResult<any, Error, number[], unknown>;
  regenerateMetadataMutation: UseMutationResult<any, Error, void, unknown>;
  extractCitationsMutation: UseMutationResult<any, Error, void, unknown>;
}

export function PaperDetailsPanel({
  paper,
  paperId,
  updatePaperTagsMutation,
  regenerateMetadataMutation,
  extractCitationsMutation,
}: PaperDetailsPanelProps) {
  // Fetch citations for this paper
  const {
    data: citationsData,
    isLoading: citationsLoading,
    error: citationsError,
  } = useQuery({
    queryKey: ['citations-list', paperId],
    queryFn: () => papersApi.getCitationsList(paperId),
    enabled: !!paperId,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-anara-light-text">Paper Information</h3>
        <div className="flex items-center gap-2">
          {paper.file_path && (
            <Button
              onClick={() => extractCitationsMutation.mutate()}
              disabled={extractCitationsMutation.isPending}
              className="flex items-center gap-2 text-xs"
              variant="outline"
            >
              <FileSearch size={14} className={extractCitationsMutation.isPending ? 'animate-spin' : ''} />
              {extractCitationsMutation.isPending ? 'Extracting...' : 'Extract Citations'}
            </Button>
          )}
          <Button
            onClick={() => regenerateMetadataMutation.mutate()}
            disabled={regenerateMetadataMutation.isPending}
            className="flex items-center gap-2 text-xs"
            variant="outline"
          >
            <RefreshCw size={14} className={regenerateMetadataMutation.isPending ? 'animate-spin' : ''} />
            {regenerateMetadataMutation.isPending ? 'Regenerating...' : 'Regenerate Metadata'}
          </Button>
        </div>
      </div>
      {extractCitationsMutation.isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
          Failed to extract citations: {extractCitationsMutation.error instanceof Error ? extractCitationsMutation.error.message : 'Unknown error'}
        </div>
      )}
      {extractCitationsMutation.isSuccess && extractCitationsMutation.data && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-sm">
          Successfully extracted {extractCitationsMutation.data.citations_extracted} citation{extractCitationsMutation.data.citations_extracted !== 1 ? 's' : ''}!
        </div>
      )}
      {regenerateMetadataMutation.isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
          Failed to regenerate metadata: {regenerateMetadataMutation.error instanceof Error ? regenerateMetadataMutation.error.message : 'Unknown error'}
        </div>
      )}
      {regenerateMetadataMutation.isSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-sm">
          Metadata regenerated successfully!
        </div>
      )}

      <div className="grid grid-cols-[120px_1fr] gap-3 text-sm">
        <div className="text-anara-light-text-muted font-medium">File type</div>
        <div className="text-anara-light-text">Document</div>

        <div className="text-anara-light-text-muted font-medium">Title</div>
        <div className="text-anara-light-text break-words">{paper.title}</div>

        <div className="text-anara-light-text-muted font-medium">Authors</div>
        <div className="text-anara-light-text">
          {paper.metadata_json?.authors_list && Array.isArray(paper.metadata_json.authors_list) && paper.metadata_json.authors_list.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {paper.metadata_json.authors_list.map((author: string, index: number) => (
                <span key={index} className="bg-gray-100 px-2 py-1 rounded-sm inline-block">
                  {author}
                </span>
              ))}
            </div>
          ) : paper.metadata_json?.author ? (
            <div className="bg-gray-100 px-2 py-1 rounded-sm inline-block">
              {paper.metadata_json.author}
            </div>
          ) : (
            <span className="text-gray-400">Unavailable</span>
          )}
        </div>

        <div className="text-anara-light-text-muted font-medium">Published</div>
        <div className="text-anara-light-text">{paper.metadata_json?.published_date ? format(new Date(paper.metadata_json.published_date), 'MMM d, yyyy') : 'Unavailable'}</div>

        {paper.doi && (
          <>
            <div className="text-anara-light-text-muted font-medium">DOI</div>
            <div className="text-anara-light-text">
              <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noopener noreferrer" className="text-gray-900 hover:underline">
                {paper.doi}
              </a>
            </div>
          </>
        )}

        {paper.volume && (
          <>
            <div className="text-anara-light-text-muted font-medium">Volume</div>
            <div className="text-anara-light-text">{paper.volume}</div>
          </>
        )}

        {paper.issue && (
          <>
            <div className="text-anara-light-text-muted font-medium">Issue</div>
            <div className="text-anara-light-text">{paper.issue}</div>
          </>
        )}

        {paper.pages && (
          <>
            <div className="text-anara-light-text-muted font-medium">Pages</div>
            <div className="text-anara-light-text">{paper.pages}</div>
          </>
        )}

        {paper.isbn && (
          <>
            <div className="text-anara-light-text-muted font-medium">ISBN</div>
            <div className="text-anara-light-text">{paper.isbn}</div>
          </>
        )}

        {paper.issn && (
          <>
            <div className="text-anara-light-text-muted font-medium">ISSN</div>
            <div className="text-anara-light-text">{paper.issn}</div>
          </>
        )}

        <div className="text-anara-light-text-muted font-medium">Tags</div>
        <div className="text-anara-light-text">
          {paper.tags && paper.tags.length > 0 ? (
            <TagList tags={paper.tags} className="mb-2" />
          ) : (
            <span className="text-gray-400 text-sm">No tags</span>
          )}
          <TagInput
            selectedTags={paper.tags || []}
            onTagsChange={(tags) => {
              updatePaperTagsMutation.mutate(tags.map(t => t.id));
            }}
          />
        </div>

        <div className="text-anara-light-text-muted font-medium">Added</div>
        <div className="text-anara-light-text">{format(new Date(paper.created_at), 'MMMM d, yyyy')}</div>

        {paper.url && (
          <>
            <div className="text-anara-light-text-muted font-medium">URL</div>
            <div className="text-anara-light-text">
              <a href={paper.url} target="_blank" rel="noopener noreferrer" className="text-gray-900 hover:underline flex items-center gap-1">
                {paper.url}
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </>
        )}
      </div>

      {/* Citations Section - At the bottom */}
      <div className="mt-6 pt-6 border-t border-anara-light-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-anara-light-text">Citations</h3>
        </div>
        <PaperCitationsList
          citations={citationsData?.citations || []}
          isLoading={citationsLoading}
          error={citationsError}
        />
      </div>
    </div>
  );
}

