import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTabs } from '@/contexts/TabContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookmarkIcon,
  ChatIcon,
  FileTextIcon,
  HighlighterIcon,
  LinkIcon,
  NoteIcon,
  PanelRightCloseIcon,
  SparklesIcon,
} from '@/components/icons';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { PaperDetails } from '@/components/PaperDetails';
import { AISummary } from '@/components/AISummary';
import { KeyFindings } from '@/components/KeyFindings';
import { ReadingGuide } from '@/components/ReadingGuide';
import { NotesPanel } from '@/components/NotesPanel';
import { RelatedPapers } from '@/components/RelatedPapers';
import { ChatTab } from '@/components/ChatTab';
import { BookmarksTab } from '@/components/BookmarksTab';
import { AnnotationsPanel } from '@/components/reader/AnnotationsPanel';
import { useReader } from '@/contexts/ReaderContext';
import { papersApi } from '@/lib/api/papers';
import { annotationsApi, type Annotation } from '@/lib/api/annotations';
import { aiFeaturesApi } from '@/lib/api/aiFeatures';
import { annotationPage, annotationRects } from '@/components/reader/annotation-geometry';
import { toastError, toastSuccess } from '@/lib/utils/toast';

interface ChatPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function ChatPanel({ isOpen, onToggle, activeTab, setActiveTab }: ChatPanelProps) {
  const { id } = useParams<{ id: string }>();
  const paperId = id ? parseInt(id) : undefined;
  const [aiTab, setAiTab] = useState('summary');
  const [regeneratingAnnotationId, setRegeneratingAnnotationId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { tabs, activeTabId } = useTabs();
  const currentPage = tabs.find((t) => t.id === activeTabId)?.currentPage ?? 1;
  const reader = useReader();

  const { data: paper } = useQuery({
    queryKey: ['paper', paperId],
    queryFn: () => papersApi.get(paperId!),
    enabled: !!paperId,
  });

  const { data: annotations = [], isLoading: annotationsLoading } = useQuery({
    queryKey: ['annotations', paperId],
    queryFn: () => annotationsApi.list(paperId!),
    enabled: !!paperId,
  });

  const { data: savedExplanations = [] } = useQuery({
    queryKey: ['annotation-explanations', paperId],
    queryFn: () => annotationsApi.listPaperExplanations(paperId!),
    enabled: !!paperId,
    staleTime: 30_000,
  });

  const deleteAnnotationMutation = useMutation({
    mutationFn: (annotationId: number) => annotationsApi.delete(annotationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['annotations', paperId] }),
  });

  const regenerateExplanation = async (annotation: Annotation) => {
    const action = annotation.highlight_type;
    const page = annotationPage(annotation);
    const quotedText = annotation.highlighted_text?.trim();
    if (
      (action !== 'explain' && action !== 'why' && action !== 'define') ||
      page === null ||
      !quotedText ||
      !paperId
    ) {
      toastError('This explanation cannot be regenerated.');
      return;
    }

    setRegeneratingAnnotationId(annotation.id);
    try {
      await aiFeaturesApi.aiAction(paperId, {
        action,
        selection_text: quotedText,
        page,
        rects: annotationRects(annotation),
        visibility: 'private',
        regenerate: true,
      }, { idempotencyKey: crypto.randomUUID() });
      await queryClient.invalidateQueries({ queryKey: ['annotations', paperId] });
      await queryClient.invalidateQueries({ queryKey: ['annotation-explanations', paperId] });
      toastSuccess('Explanation regenerated');
    } catch {
      toastError('Could not regenerate explanation. Try again.');
    } finally {
      setRegeneratingAnnotationId(null);
    }
  };

  // Split into highlights/annotations vs freeform notes
  const annotationItems = annotations.filter((a) => a.type !== 'note');
  const noteItems = annotations.filter((a) => a.type === 'note');

  const tabItems: Array<{
    value: string;
    label: string;
    Icon: typeof FileTextIcon;
    badge?: number;
  }> = [
    { value: 'details', label: 'Details', Icon: FileTextIcon },
    { value: 'ai', label: 'Insights', Icon: SparklesIcon },
    { value: 'related', label: 'Related', Icon: LinkIcon },
    { value: 'chat', label: 'Chat', Icon: ChatIcon },
    { value: 'notes', label: 'Notes', Icon: NoteIcon, badge: noteItems.length || undefined },
    { value: 'annotations', label: 'Annotations', Icon: HighlighterIcon, badge: annotationItems.length || undefined },
    { value: 'bookmarks', label: 'Bookmarks', Icon: BookmarkIcon },
  ];

  if (!isOpen) return null;

  return (
    <div className="w-full h-full rounded-(--panel-radius) border border-(--panel-border) bg-(--panel-surface) shadow-(--shadow-panel) backdrop-blur-sm flex flex-col overflow-hidden">
      {!paperId || !paper ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-(--muted-foreground) opacity-50">
          <FileTextIcon size={40} className="mb-3" />
          <p className="text-code">Open a paper to see details</p>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} variant="plain" className="flex flex-col h-full">
          {/* Expanding pill bar — active tab reveals its label */}
          <div className="flex items-center justify-between shrink-0 border-b border-(--panel-border) bg-(--panel-surface)">
            <TabsList className="flex items-center gap-1 px-3 py-2 border-none bg-transparent">
              {tabItems.map(({ value, label, Icon, badge }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  title={label}
                  className="group relative inline-flex items-center justify-center h-10 rounded-full text-caption transition-all duration-300 ease-out data-[state=active]:bg-(--foreground) data-[state=active]:text-(--card) data-[state=inactive]:w-10 data-[state=inactive]:text-(--muted-foreground) data-[state=inactive]:hover:bg-(--muted) data-[state=inactive]:hover:text-(--foreground) data-[state=active]:px-3.5 data-[state=active]:gap-2"
                >
                  <Icon size="md" className="shrink-0" />
                  <span className="grid grid-cols-[0fr] group-data-[state=active]:grid-cols-[1fr] transition-[grid-template-columns] duration-300 ease-out">
                    <span className="overflow-hidden whitespace-nowrap font-medium">{label}</span>
                  </span>
                  {badge ? (
                    <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 inline-flex items-center justify-center rounded-full bg-(--foreground) text-(--background) text-micro tabular-nums leading-none group-data-[state=active]:hidden">
                      {badge}
                    </span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>

            <button
              onClick={onToggle}
              className="p-1.5 mr-2 text-(--muted-foreground) hover:text-(--foreground) hover:bg-(--muted) rounded-lg transition-colors shrink-0"
              aria-label="Close panel"
            >
              <PanelRightCloseIcon size="md" />
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden relative bg-(--panel-surface)">
            <TabsContent value="details" className="h-full overflow-y-auto scrollbar-none">
              <PaperDetails paper={paper} />
            </TabsContent>

            <TabsContent value="ai" className="h-full overflow-hidden flex flex-col">
              <Tabs value={aiTab} onValueChange={setAiTab} variant="plain" className="flex flex-col h-full">
                <div className="shrink-0 border-b border-(--border) px-3 py-1.5 bg-(--panel-surface)">
                  <TabsList className="gap-0.5 border-none bg-transparent">
                    <TabsTrigger value="summary" className="px-2.5 py-1 text-caption rounded-full transition-colors data-[state=active]:bg-(--foreground) data-[state=active]:text-(--card) data-[state=inactive]:text-(--muted-foreground) data-[state=inactive]:hover:bg-(--muted) data-[state=inactive]:hover:text-(--foreground)">
                      Summary
                    </TabsTrigger>
                    <TabsTrigger value="insights" className="px-2.5 py-1 text-caption rounded-full transition-colors data-[state=active]:bg-(--foreground) data-[state=active]:text-(--card) data-[state=inactive]:text-(--muted-foreground) data-[state=inactive]:hover:bg-(--muted) data-[state=inactive]:hover:text-(--foreground)">
                      Insights
                    </TabsTrigger>
                    <TabsTrigger value="guide" className="px-2.5 py-1 text-caption rounded-full transition-colors data-[state=active]:bg-(--foreground) data-[state=active]:text-(--card) data-[state=inactive]:text-(--muted-foreground) data-[state=inactive]:hover:bg-(--muted) data-[state=inactive]:hover:text-(--foreground)">
                      Guide
                    </TabsTrigger>
                  </TabsList>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-none p-6 text-(--foreground)">
                  <TabsContent value="summary">
                    <section>
                      <h3 className="text-body font-bold mb-4">Executive Summary</h3>
                      <AISummary paperId={paper.id} />
                    </section>
                  </TabsContent>
                  <TabsContent value="insights">
                    <section>
                      <h3 className="text-body font-bold mb-4">Core Insights</h3>
                      <KeyFindings paperId={paper.id} />
                    </section>
                  </TabsContent>
                  <TabsContent value="guide">
                    <section>
                      <h3 className="text-body font-bold mb-4">Reading Guide</h3>
                      <ReadingGuide paperId={paper.id} />
                    </section>
                  </TabsContent>
                </div>
              </Tabs>
            </TabsContent>

            {/* Notes tab — freeform notes (type === 'note'), page/document scoped */}
            <TabsContent value="notes" className="h-full overflow-y-auto scrollbar-none p-6">
              <NotesPanel
                paperId={paper.id}
                currentPage={currentPage}
                annotations={annotations}
                isLoading={annotationsLoading}
              />
            </TabsContent>

            {/* Annotations tab — highlights only (type !== 'note') */}
            <TabsContent value="annotations" className="h-full overflow-y-auto scrollbar-none p-6">
              <AnnotationsPanel
                annotations={annotationItems}
                activeId={reader.activeAnnotationId}
                onSelect={(ann) => {
                  reader.scrollCallbacks?.scrollToAnnotation(ann);
                }}
                onDelete={(ann) => deleteAnnotationMutation.mutate(ann.id)}
                onRegenerate={regenerateExplanation}
                regeneratingAnnotationId={regeneratingAnnotationId}
              />
              {savedExplanations.length > 0 && (
                <p
                  role="status"
                  className="px-3 pb-3 text-center text-micro text-(--muted-foreground)"
                >
                  {savedExplanations.length} saved AI {savedExplanations.length === 1 ? 'explanation' : 'explanations'}
                </p>
              )}
            </TabsContent>

            <TabsContent value="related" className="h-full overflow-y-auto scrollbar-none p-6">
              <RelatedPapers paperId={paper.id} />
            </TabsContent>

            <TabsContent value="chat" className="h-full flex flex-col overflow-hidden">
              <ChatTab paperId={paper.id} />
            </TabsContent>

            <TabsContent value="bookmarks" className="h-full overflow-y-auto scrollbar-none">
              <BookmarksTab paperId={paper.id} onJumpToPage={(page) => {
                // TODO: Implement jump to page functionality
                console.log('Jump to page:', page);
              }} />
            </TabsContent>
          </div>
        </Tabs>
      )}
    </div>
  );
}
