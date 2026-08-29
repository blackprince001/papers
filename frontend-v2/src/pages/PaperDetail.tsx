import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { papersApi } from '@/lib/api/papers';
import { annotationsApi } from '@/lib/api/annotations';
import { ReaderShell } from '@/components/reader/ReaderShell';
import { ProcessingProgressPanel } from '@/components/ProcessingProgressPanel';
import { useTabs } from '@/contexts/TabContext';
import { useReadingSession } from '@/hooks/use-reading-session';
import { useReadingPosition } from '@/hooks/use-reading-position';
import { WarningIcon, FileTextIcon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

export default function PaperDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const paperId = id ? parseInt(id) : undefined;
  const { addTab, updateTab, tabs, activeTabId } = useTabs();

  // Deep-link from chat reference chips: ?page=N&focus=annotation:22
  const initialPage = searchParams.get('page')
    ? parseInt(searchParams.get('page')!) || undefined
    : undefined;
  const focusRef = searchParams.get('focus') ?? undefined;

  const { data: paper, isLoading: paperLoading, error: paperError, refetch: refetchPaper } = useQuery({
    queryKey: ['paper', paperId],
    queryFn: () => papersApi.get(paperId!),
    enabled: !!paperId,
  });

  const { data: annotations, refetch: refetchAnnotations } = useQuery({
    queryKey: ['annotations', paperId],
    queryFn: () => annotationsApi.list(paperId!),
    enabled: !!paperId,
  });

  const paperTab = tabs.find((t) => t.paperId === paperId);
  const currentPage = paperTab?.currentPage ?? 1;
  const isReadingActive = !!(paper?.file_url || paper?.file_path) && paperTab?.id === activeTabId;
  useReadingSession(paperId!, isReadingActive, currentPage);

  // Restore the last reading position (deep-link page wins). Nothing is
  // recorded until the viewer reports ready, so load-time page-one signals
  // can't clobber a stored position.
  const [readerReady, setReaderReady] = useState(false);
  const { initialPage: storedInitialPage, recordPage } = useReadingPosition({
    paperId,
    explicitPage: initialPage,
    ready: readerReady,
  });

  // Register this paper in the tab system
  useEffect(() => {
    if (paper && paperId) {
      addTab(paperId, paper.title, `/papers/${paperId}`);
    }
  }, [paper, paperId, addTab]);

  if (!paperId) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-(--white)">
        <WarningIcon size={56} className="text-(--destructive) opacity-20 mb-4" />
        <h2 className="text-subheading font-bold mb-2">Paper not found</h2>
        <p className="text-body text-(--muted-foreground) mb-6">The paper ID provided is invalid or missing.</p>
        <Button onClick={() => navigate('/')}>Return Home</Button>
      </div>
    );
  }

  if (paperLoading) {
    return (
      <div className="h-full w-full flex flex-col p-6 gap-4 bg-(--background)">
        <Skeleton className="h-8 w-2/3" />
        <div className="flex-1 flex gap-4 min-h-0">
          <Skeleton className="flex-1 rounded-2xl" />
          <Skeleton className="w-72 shrink-0 rounded-2xl hidden md:block" />
        </div>
      </div>
    );
  }

  if (paperError || !paper) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-(--white)">
        <FileTextIcon size={56} className="text-(--destructive) opacity-20 mb-4" />
        <h2 className="text-subheading font-bold mb-2">Error loading paper</h2>
        <p className="text-body text-(--muted-foreground) mb-6">
          {paperError instanceof Error ? paperError.message : 'We could not load the paper data at this time.'}
        </p>
        <Button onClick={() => refetchPaper()}>Try Again</Button>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col">
      <ProcessingProgressPanel
        paperId={paperId}
        processingStatus={paper.processing_status}
        className="m-2 shrink-0"
      />
      <div className="flex-1 min-h-0">
        <ReaderShell
          paper={paper}
          annotations={annotations || []}
          initialPage={initialPage ?? storedInitialPage}
          focusRef={focusRef}
          onReady={() => setReaderReady(true)}
          onAnnotationSuccess={() => {
            refetchAnnotations();
            refetchPaper();
          }}
          onCurrentPageChange={(page) => {
            recordPage(page);
            const activeTab = tabs.find((t) => t.id === activeTabId);
            if (activeTab) updateTab(activeTab.id, { currentPage: page });
          }}
        />
      </div>
    </div>
  );
}
