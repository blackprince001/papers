import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { papersApi } from '@/lib/api/papers';
import { useSharedChatController } from '@/contexts/ChatControllerContext';
import { ChatMessageList } from '@/components/chat/ChatMessageList';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { SessionPills } from '@/components/chat/SessionPills';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { ChevronLeftIcon, WarningIcon, ChatIcon } from '@/components/icons';

export default function PaperChat() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const paperId = id ? parseInt(id) : undefined;

  const { data: paper } = useQuery({
    queryKey: ['paper', paperId],
    queryFn: () => papersApi.get(paperId!),
    enabled: !!paperId,
  });

  if (!paperId) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <WarningIcon size={56} className="text-(--destructive) opacity-20 mb-4" />
        <h2 className="text-subheading font-bold mb-2">Paper not found</h2>
        <Button onClick={() => navigate('/')}>Return Home</Button>
      </div>
    );
  }

  return <PaperChatInner paperId={paperId} paperTitle={paper?.title} />;
}

function PaperChatInner({ paperId, paperTitle }: { paperId: number; paperTitle?: string }) {
  const controller = useSharedChatController();

  return (
    <div className="h-full flex flex-col bg-(--background)">
      {/* Page header */}
      <header className="shrink-0 border-b border-(--border) bg-(--card)">
        <div className="px-3 py-1.5 flex items-center gap-2">
          <Link
            to={`/papers/${paperId}`}
            className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-lg text-(--muted-foreground) hover:text-(--foreground) hover:bg-(--muted) transition-colors"
            title="Back to paper"
          >
            <ChevronLeftIcon size="sm" />
          </Link>
          <ChatIcon size="sm" className="shrink-0 text-(--muted-foreground)" />
          <div className="min-w-0 flex-1">
            <h1 className="text-code font-semibold leading-tight truncate" title={paperTitle}>
              {paperTitle ?? 'Paper chat'}
            </h1>
          </div>
        </div>
      </header>

      {/* Session switcher */}
      <SessionPills controller={controller} showExpand={false} />

      {/* Conversation */}
      {controller.isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Skeleton className="w-12 h-12 rounded-full" />
        </div>
      ) : (
        <>
          <ChatMessageList controller={controller} centered />
          <ChatComposer controller={controller} centered />
        </>
      )}

      <ConfirmDialog {...controller.confirmDialogProps} />
    </div>
  );
}
