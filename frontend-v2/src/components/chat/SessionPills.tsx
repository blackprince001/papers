import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckIcon, ChevronDownIcon, CloseIcon, EditIcon, MaximizeIcon, PlusIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { ChatController } from '@/hooks/use-chat-controller';

interface SessionPillsProps {
  controller: ChatController;
  /** Show the "open full chat view" link. Off on the full-page view itself. */
  showExpand?: boolean;
}

/** Compact horizontal session switcher used in the side panel ChatTab. */
export function SessionPills({ controller, showExpand = true }: SessionPillsProps) {
  const {
    paperId, sessions, currentSessionId, switchSession, renameSession,
    handleCreateSession, handleDeleteSession, isCreatingSession,
  } = controller;

  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [sessionsCollapsed, setSessionsCollapsed] = useState(false);

  const startRename = (id: number, name: string) => {
    setEditingSessionId(id);
    setEditName(name);
  };
  const saveRename = async () => {
    if (editingSessionId && editName.trim()) {
      await renameSession(editingSessionId, editName.trim());
      setEditingSessionId(null);
    }
  };
  const cancelRename = () => {
    setEditingSessionId(null);
    setEditName('');
  };

  return (
    <div className="shrink-0 border-b border-(--border) bg-(--card)">
      <div className="flex items-center gap-1 px-2 py-1 overflow-x-auto scrollbar-none">
        {sessions.length > 1 && (
          <button
            onClick={() => setSessionsCollapsed(!sessionsCollapsed)}
            className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full hover:bg-(--muted) text-(--muted-foreground) transition-colors"
            title={sessionsCollapsed ? 'Show all sessions' : 'Collapse sessions'}
          >
            <ChevronDownIcon size="xs" className={cn('transition-transform', sessionsCollapsed && '-rotate-90')} />
          </button>
        )}

        {sessions.length === 0 ? (
          <span className="text-caption text-(--muted-foreground) px-1">No sessions</span>
        ) : (
          sessions.map((s) => {
            const isActive = s.id === currentSessionId;
            if (sessionsCollapsed && !isActive) return null;

            if (editingSessionId === s.id) {
              return (
                <div key={s.id} className="flex items-center gap-1 shrink-0">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-28 h-7 px-2 text-caption bg-(--white) border border-(--border) rounded-full"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRename();
                      if (e.key === 'Escape') cancelRename();
                    }}
                  />
                  <button onClick={saveRename} className="text-(--success) hover:opacity-70 shrink-0">
                    <CheckIcon size="xs" />
                  </button>
                  <button onClick={cancelRename} className="text-(--muted-foreground) hover:opacity-70 shrink-0">
                    <CloseIcon size="xs" />
                  </button>
                </div>
              );
            }

            return (
              <button
                key={s.id}
                onClick={() => switchSession(s.id)}
                className={cn(
                  'shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-micro transition-all duration-150 whitespace-nowrap border',
                  isActive
                    ? cn(
                        'bg-(--foreground) text-(--card) border-(--foreground) font-medium',
                        'shadow-(--shadow-inset) hover:shadow-(--shadow-inset-hover) hover:opacity-90',
                        'active:translate-y-px active:shadow-(--shadow-inset-hover)',
                      )
                    : 'bg-(--card) text-(--muted-foreground) border-(--border) hover:text-(--foreground) hover:border-(--foreground)/30',
                )}
              >
                <span className="max-w-28 truncate">{s.name}</span>
                {isActive && (
                  <span className="flex items-center gap-0.5 ml-0.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); startRename(s.id, s.name); }}
                      className="opacity-60 hover:opacity-100 transition-opacity"
                    >
                      <EditIcon size="xs" />
                    </button>
                    {sessions.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id); }}
                        className="opacity-60 hover:opacity-100 transition-opacity"
                      >
                        <CloseIcon size="xs" />
                      </button>
                    )}
                  </span>
                )}
              </button>
            );
          })
        )}

        <button
          onClick={handleCreateSession}
          disabled={isCreatingSession}
          className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full border border-dashed border-(--border) text-(--muted-foreground) hover:text-(--foreground) hover:border-(--foreground)/30 transition-colors"
          title="New session"
        >
          <PlusIcon size="xs" />
        </button>

        {showExpand && (
          <Link
            to={`/papers/${paperId}/chat`}
            className="shrink-0 ml-auto inline-flex items-center justify-center w-6 h-6 rounded-full text-(--muted-foreground) hover:text-(--foreground) hover:bg-(--muted) transition-colors"
            title="Open full chat view"
          >
            <MaximizeIcon size="sm" />
          </Link>
        )}
      </div>
    </div>
  );
}
