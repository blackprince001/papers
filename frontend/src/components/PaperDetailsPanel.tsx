import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { RefreshCw, FileSearch, Trash2, Pencil, Check, X } from 'lucide-react';
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
  onDelete?: () => void;
  isDeleting?: boolean;
  updatePaperTitleMutation?: UseMutationResult<any, Error, string, unknown>;
  onTitleUpdate?: (title: string) => void;
}

export function PaperDetailsPanel({
  paper,
  paperId,
  updatePaperTagsMutation,
  regenerateMetadataMutation,
  extractCitationsMutation,
  onDelete,
  isDeleting,
  updatePaperTitleMutation,
  onTitleUpdate,
}: PaperDetailsPanelProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(paper.title);

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

  const handleSaveTitle = () => {
    if (!editedTitle.trim()) {
      return; // Don't save empty title
    }
    if (editedTitle.trim() !== paper.title && updatePaperTitleMutation) {
      updatePaperTitleMutation.mutate(editedTitle.trim());
    } else {
      setIsEditingTitle(false);
    }
  };

  const handleCancelTitle = () => {
    setEditedTitle(paper.title);
    setIsEditingTitle(false);
  };

  // Reset edited title when paper changes
  useEffect(() => {
    setEditedTitle(paper.title);
  }, [paper.title]);

  // Handle successful title update
  useEffect(() => {
    if (updatePaperTitleMutation?.isSuccess && isEditingTitle) {
      setIsEditingTitle(false);
      onTitleUpdate?.(editedTitle.trim());
      updatePaperTitleMutation.reset();
    }
  }, [updatePaperTitleMutation?.isSuccess, isEditingTitle, editedTitle, onTitleUpdate, updatePaperTitleMutation]);

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
          {onDelete && (
            <Button
              onClick={onDelete}
              disabled={isDeleting}
              className="flex items-center gap-2 text-xs"
              variant="destructive"
            >
              <Trash2 size={14} className={isDeleting ? 'animate-spin' : ''} />
              {isDeleting ? 'Deleting...' : 'Delete Paper'}
            </Button>
          )}
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
        <div className="text-anara-light-text break-words">
          {isEditingTitle && updatePaperTitleMutation ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveTitle();
                  } else if (e.key === 'Escape') {
                    handleCancelTitle();
                  }
                }}
                autoFocus
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleSaveTitle}
                disabled={!editedTitle.trim() || updatePaperTitleMutation.isPending}
                title="Save"
              >
                <Check size={14} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleCancelTitle}
                disabled={updatePaperTitleMutation.isPending}
                title="Cancel"
              >
                <X size={14} />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <span className="flex-1">{paper.title}</span>
              {updatePaperTitleMutation && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                  onClick={() => setIsEditingTitle(true)}
                  title="Edit title"
                >
                  <Pencil size={14} />
                </Button>
              )}
            </div>
          )}
        </div>

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

