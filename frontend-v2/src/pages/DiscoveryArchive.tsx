import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Archive, SearchNormal as Search, Trash as Trash2, Refresh as Loader2, Clock, DocumentText as FileText, Edit as Pencil, TickCircle as Check, CloseCircle as X } from 'iconsax-reactjs';
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
            <Archive size={24} className="text-(--muted-foreground)" />
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
          <Archive size={40} className="text-(--muted-foreground) mx-auto mb-3 opacity-40" />
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
                        <button onClick={() => commitRename(session.id)} className="p-1 text-(--foreground) hover:opacity-70"><Check size={14} /></button>
                        <button onClick={() => setRenamingId(null)} className="p-1 text-(--muted-foreground) hover:opacity-70"><X size={14} /></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mb-1">
                        <Search size={14} className="text-(--muted-foreground) shrink-0" />
                        <h4 className="text-code font-medium text-(--foreground) truncate">
                          "{session.name || session.query}"
                        </h4>
                        <button onClick={() => startRename(session)} className="p-0.5 text-(--muted-foreground) hover:text-(--foreground) opacity-0 group-hover:opacity-100 transition-all shrink-0">
                          <Pencil size={12} />
                        </button>
                      </div>
                    )}
                    {session.name && (
                      <p className="text-caption text-(--muted-foreground) pl-5 mb-1 truncate">{session.query}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 pl-5">
                      <span className="flex items-center gap-1 text-caption text-(--muted-foreground)">
                        <Clock size={11} />{formatDate(session.updated_at)}
                      </span>
                      <Badge>{session.paper_count} results</Badge>
                      {session.sources.length > 0 && (
                        <span className="flex items-center gap-1 text-caption text-(--muted-foreground)">
                          <FileText size={11} />{session.sources.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outlined" className="h-8! text-caption!" onClick={() => handleView(session)}>View</Button>
                    <Button
                      variant="ghost"
                      className="h-8! w-8! p-0! text-(--muted-foreground) hover:text-red-500"
                      disabled={deleteMutation.isPending}
                      onClick={() => { if (confirm('Delete this saved discovery?')) deleteMutation.mutate(session.id); }}
                    >
                      {deleteMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
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
