import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArchiveIcon, SearchIcon, TrashIcon, ClockIcon, FileTextIcon, EditIcon, CheckIcon, CloseIcon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { discoveryApi, type DiscoverySession } from '@/lib/api/discovery';

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

export default function DiscoveryArchive() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['discovery-sessions'],
    queryFn: () => discoveryApi.getSessions(50, 0),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => discoveryApi.deleteSession(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['discovery-sessions'] }),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => discoveryApi.updateSession(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discovery-sessions'] });
      setRenamingId(null);
    },
  });

  const handleView = (session: DiscoverySession) => {
    navigate('/discovery', { state: { restoreSessionId: session.id } });
  };

  const startRename = (session: DiscoverySession) => {
    setRenamingId(session.id);
    setRenameValue(session.name || session.query);
  };

  const commitRename = (id: number) => {
    if (renameValue.trim()) renameMutation.mutate({ id, name: renameValue.trim() });
    else setRenamingId(null);
  };

  return (
    <div className="max-w-content mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1>Discovery Archive</h1>
          </div>
          <p className="text-btn text-(--muted-foreground) mt-1">
            Previously saved discovery searches and results
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="p-4 rounded-2xl border border-(--panel-border) space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          ))}
        </div>
      ) : !sessions || sessions.length === 0 ? (
        <div className="text-center py-16">
          <ArchiveIcon size={48} className="text-(--muted-foreground) mx-auto mb-3 opacity-40" />
          <p className="text-body text-(--muted-foreground)">No saved discoveries yet.</p>
          <p className="text-code text-(--muted-foreground) mt-1">Search for papers and save your sessions from the Discovery page.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sessions.map((session: DiscoverySession) => (
            <Card key={session.id} variant="feature">
              <CardContent>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Name / rename */}
                    {renamingId === session.id ? (
                      <div className="flex items-center gap-2 mb-1">
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitRename(session.id); if (e.key === 'Escape') setRenamingId(null); }}
                          className="flex-1 px-2 py-1 text-code bg-(--muted) border border-(--border) rounded-lg focus:outline-none focus:border-(--foreground)"
                        />
                        <button onClick={() => commitRename(session.id)} className="p-1 text-(--foreground) hover:opacity-70"><CheckIcon size="sm" /></button>
                        <button onClick={() => setRenamingId(null)} className="p-1 text-(--muted-foreground) hover:opacity-70"><CloseIcon size="sm" /></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mb-1">
                        <SearchIcon size="sm" className="text-(--muted-foreground) shrink-0" />
                        <h4 className="text-code font-medium text-(--foreground) truncate">
                          "{session.name || session.query}"
                        </h4>
                        <button onClick={() => startRename(session)} className="p-0.5 text-(--muted-foreground) hover:text-(--foreground) opacity-0 group-hover:opacity-100 transition-all shrink-0">
                          <EditIcon size="xs" />
                        </button>
                      </div>
                    )}
                    {session.name && (
                      <p className="text-caption text-(--muted-foreground) pl-5 mb-1 truncate">{session.query}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 pl-5">
                      <span className="flex items-center gap-1 text-caption text-(--muted-foreground)">
                        <ClockIcon size="xs" />{formatDate(session.updated_at)}
                      </span>
                      <Badge>{session.paper_count} results</Badge>
                      {session.sources.length > 0 && (
                        <span className="flex items-center gap-1 text-caption text-(--muted-foreground)">
                          <FileTextIcon size="xs" />{session.sources.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outlined" size="sm" onClick={() => handleView(session)}>View</Button>
                    <Button
                      variant="icon"
                      size="icon"
                      className="text-(--muted-foreground) hover:text-(--danger)"
                      loading={deleteMutation.isPending}
                      aria-label="Delete saved discovery"
                      onClick={() => { if (confirm('Delete this saved discovery?')) deleteMutation.mutate(session.id); }}
                    >
                      <TrashIcon size="md" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
