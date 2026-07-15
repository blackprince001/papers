import { useState } from 'react';
import { motion } from 'motion/react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toastInfo, toastError, toastSuccess } from '@/lib/utils/toast';
import { CalendarIcon, CheckIcon, CloseIcon, DownloadIcon, EditIcon, ExternalLinkIcon, FingerprintIcon, HighlighterIcon, LinkIcon, RefreshIcon, ShareIcon, TrashIcon } from '@/components/icons';
import { aiFeaturesApi } from '@/lib/api/aiFeatures';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type Paper, papersApi } from '@/lib/api/papers';
import { Button } from '@/components/ui/Button';
import { TagInput } from '@/components/TagInput';
import { PaperCitationsList } from '@/components/PaperCitationsList';
import { ShareDialog } from '@/components/ShareDialog';
import { isOwner } from '@/lib/utils/permissions';
import { paperSharingApi } from '@/lib/api/sharing';
import { useNavigate, Link } from 'react-router-dom';

interface PaperDetailsProps {
  paper: Paper;
  onDelete?: () => void;
}

export function PaperDetails({ paper, onDelete }: PaperDetailsProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(paper.title);
  const [isAbstractExpanded, setIsAbstractExpanded] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const paperId = paper.id;

  // Fetch citations for this paper
  const {
    data: citationsData,
    isLoading: citationsLoading,
    error: citationsError,
  } = useQuery({
    queryKey: ['citations-list', paperId],
    queryFn: () => papersApi.getCitationsList(paperId),
    enabled: !!paperId,
    staleTime: 5 * 60_000,
  });

  const updateMutation = useMutation({
    mutationFn: (updates: { title?: string; tag_ids?: number[] }) =>
      papersApi.update(paperId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
      setIsEditingTitle(false);
    },
  });

  // Spawns the auto-highlight AI agent (moved here from the former
  // Insights > Highlights tab — it's a one-shot action, not a view).
  const autoHighlightMutation = useMutation({
    mutationFn: () => aiFeaturesApi.generateHighlights(paperId),
    onMutate: () => {
      toastInfo('Spawning AI agent…', 'It will highlight core methods and findings shortly.');
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['annotations', paperId] });
      queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
      toastSuccess(`${data.count} highlights identified and added`);
    },
    onError: (e) =>
      toastError('AI highlighting failed', e instanceof Error ? e.message : undefined),
  });

  const extractCitationsMutation = useMutation({
    mutationFn: () => papersApi.extractCitations(paperId),
    onMutate: () => {
      toastInfo('Regenerating citations…', 'They will be updated shortly.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['citations-list', paperId] });
    },
  });

  const handleSaveTitle = () => {
    if (!editedTitle.trim() || editedTitle.trim() === paper.title)
    {
      setIsEditingTitle(false);
      return;
    }
    updateMutation.mutate({ title: editedTitle.trim() });
  };

  const handleCancelTitle = () => {
    setEditedTitle(paper.title);
    setIsEditingTitle(false);
  };

  const authors = (paper.metadata_json?.authors_list as string[]) ||
    (paper.metadata_json?.author ? [paper.metadata_json.author as string] : []);

  const publishedDate = paper.metadata_json?.published_date
    ? format(new Date(paper.metadata_json.published_date as string), 'MMMM d, yyyy')
    : null;

  return (
    <div className="flex flex-col h-full bg-(--white) overflow-hidden">
      <div className="px-6 py-4 border-b border-(--border) shrink-0 bg-(--white) z-10">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h3 className="text-btn font-semibold text-(--foreground)">Information</h3>
          <div className="flex items-center gap-1.5">
            {paper.is_shared && !isOwner(paper) && (
              <Button
                variant="ghost"
                className="h-8 text-caption text-(--destructive)"
                onClick={async () => {
                  await paperSharingApi.leave(paper.id);
                  queryClient.invalidateQueries({ queryKey: ['papers'] });
                  navigate('/');
                }}
                title="Leave share"
              >
                Leave
              </Button>
            )}
            {isOwner(paper) && (
            <Button
              variant="icon"
              size="icon"
              onClick={() => setShareOpen(true)}
              title="Share Paper"
              aria-label="Share Paper"
            >
              <ShareIcon size="sm" />
            </Button>
            )}
            <Button
              variant="icon"
              size="icon"
              onClick={() => autoHighlightMutation.mutate()}
              loading={autoHighlightMutation.isPending}
              title="Auto-highlight with AI"
              aria-label="Auto-highlight with AI"
            >
              <HighlighterIcon size="sm" />
            </Button>
            <Button
              variant="icon"
              size="icon"
              onClick={() => extractCitationsMutation.mutate()}
              loading={extractCitationsMutation.isPending}
              title="Regenerate Citations"
              aria-label="Regenerate Citations"
            >
              <RefreshIcon size="sm" />
            </Button>
            {onDelete && isOwner(paper) && (
              <Button
                variant="icon"
                size="icon"
                className="text-(--destructive) hover:bg-(--destructive)/10"
                onClick={onDelete}
                title="Delete Paper"
                aria-label="Delete Paper"
              >
                <TrashIcon size="sm" />
              </Button>
            )}
          </div>
        </div>

        {/* Title Section */}
        <div className="group relative mb-4">
          {isEditingTitle ? (
            <div className="flex items-start gap-2">
              <input
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-(--muted) border border-(--border) rounded-lg text-code focus:outline-none focus:ring-1 focus:ring-(--foreground) min-h-9"
                onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                autoFocus
              />
              <div className="flex gap-1">
                <Button variant="icon" size="icon" onClick={handleSaveTitle} aria-label="Save title">
                  <CheckIcon size="sm" />
                </Button>
                <Button variant="icon" size="icon" onClick={handleCancelTitle} aria-label="Cancel editing">
                  <CloseIcon size="sm" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-body-lg font-bold leading-snug text-(--foreground) flex-1">{paper.title}</h1>
              {isOwner(paper) && (
              <Button
                variant="icon"
                size="icon-sm"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => setIsEditingTitle(true)}
                aria-label="Edit title"
              >
                <EditIcon size="sm" />
              </Button>
              )}
            </div>
          )}
        </div>

        {/* Abstract / Description */}
        {!!paper.metadata_json?.abstract && (
          <div className="mb-4">
            <div
              className="relative cursor-pointer group"
              onClick={() => setIsAbstractExpanded(!isAbstractExpanded)}
            >
              <motion.div
                initial={false}
                animate={{ height: isAbstractExpanded ? 'auto' : '5.6em' }}
                transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                className="overflow-hidden"
              >
                <p className={cn(
                  "text-code text-(--muted-foreground) leading-relaxed transition-colors",
                  !isAbstractExpanded && "line-clamp-4",
                  isAbstractExpanded ? "text-(--foreground)" : "group-hover:text-(--foreground)"
                )}>
                  {paper.metadata_json.abstract as string}
                </p>
              </motion.div>

              {!isAbstractExpanded && (
                <div className="absolute bottom-0 left-0 right-0 h-8 bg-linear-to-t from-(--white) to-transparent pointer-events-none" />
              )}

              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-(--white) border border-(--border) rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="text-micro text-(--muted-foreground) px-1">
                  {isAbstractExpanded ? 'Show less' : 'Read more'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tags — TagInput renders the selected chips (with remove) itself */}
        <div className="space-y-2">
          <TagInput
            selectedTags={paper.tags || []}
            onTagsChange={(tags) => updateMutation.mutate({ tag_ids: tags.map(t => t.id) })}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 scrollbar-none">
        {/* Metadata Grid */}
        <div className="grid grid-cols-1 gap-5">
          {/* Authors */}
          {authors.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="flex items-center gap-1.5 text-caption font-bold uppercase tracking-wider text-(--muted-foreground)">
                Authors
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {authors.map((author, i) => (
                  <Link
                    key={i}
                    to={`/author/search?name=${encodeURIComponent(author)}`}
                    className="text-code px-2 py-0.5 bg-(--muted)/50 rounded text-(--foreground) hover:bg-(--mint-green)/20 hover:text-(--deep-forest) transition-colors no-underline"
                  >
                    {author}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Published */}
          {publishedDate && (
            <div className="space-y-1.5">
              <h4 className="flex items-center gap-1.5 text-caption font-bold uppercase tracking-wider text-(--muted-foreground)">
                <CalendarIcon size="xs" /> Published
              </h4>
              <p className="text-code text-(--foreground)">{publishedDate}</p>
            </div>
          )}

          {/* DOI / URL */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {paper.doi && (
              <div className="space-y-1.5">
                <h4 className="flex items-center gap-1.5 text-caption font-bold uppercase tracking-wider text-(--muted-foreground)">
                  <FingerprintIcon size="xs" /> DOI
                </h4>
                <a
                  href={`https://doi.org/${paper.doi}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-code text-(--foreground) hover:text-(--sky-blue) truncate block"
                >
                  {paper.doi}
                </a>
              </div>
            )}
            {(() => {
              // Uploaded files store a `file://…` placeholder rather than a real
              // web URL — for those, offer a download of the stored PDF instead
              // of a broken external link.
              const hasExternalUrl = !!paper.url && !paper.url.startsWith('file://');
              if (hasExternalUrl) {
                return (
                  <div className="space-y-1.5">
                    <h4 className="flex items-center gap-1.5 text-caption font-bold uppercase tracking-wider text-(--muted-foreground)">
                      <LinkIcon size="xs" /> URL
                    </h4>
                    <a
                      href={paper.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-code text-(--foreground) hover:text-(--sky-blue) truncate block"
                    >
                      Source <ExternalLinkIcon size="xs" className="inline ml-1" />
                    </a>
                  </div>
                );
              }
              if (paper.file_url) {
                return (
                  <div className="space-y-1.5">
                    <h4 className="flex items-center gap-1.5 text-caption font-bold uppercase tracking-wider text-(--muted-foreground)">
                      <DownloadIcon size="xs" /> File
                    </h4>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await papersApi.downloadFile(paper.id, paper.title);
                        } catch {
                          toastError('Failed to download file');
                        }
                      }}
                      className="text-code text-(--foreground) hover:text-(--sky-blue) truncate block text-left"
                    >
                      Download <DownloadIcon size="xs" className="inline ml-1" />
                    </button>
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>

        {/* Citations List */}
        <div className="pt-2 border-t border-(--border)">
          <h4 className="text-btn font-semibold text-(--foreground) mb-4">Citations</h4>
          <PaperCitationsList
            citations={citationsData?.citations || []}
            isLoading={citationsLoading}
            error={citationsError}
          />
        </div>
      </div>

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        resourceId={paperId}
        resourceType="paper"
        resourceTitle={paper.title}
      />
    </div>
  );
}
