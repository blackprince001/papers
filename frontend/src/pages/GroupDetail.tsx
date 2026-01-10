import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Folder } from 'lucide-react';
import { groupsApi } from '@/lib/api/groups';
import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/Button';
import { PaperMultiSelect } from '@/components/PaperMultiSelect';

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const groupId = parseInt(id || '0');
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [renameGroupName, setRenameGroupName] = useState('');
  const [selectedPaperIds, setSelectedPaperIds] = useState<number[]>([]);
  const queryClient = useQueryClient();

  // Fetch the specific group
  const { data: group, isLoading: groupLoading, error: groupError } = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => groupsApi.get(groupId),
    enabled: !!groupId,
    retry: 2,
    retryDelay: 1000,
  });

  // Fetch all groups to build breadcrumb and find children
  const { data: allGroups, isLoading: allGroupsLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
    retry: 2,
    retryDelay: 1000,
  });


  // Get direct children of this group
  const childGroups = allGroups?.filter((g) => g.parent_id === groupId) || [];

  const updateGroupMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: { name?: string } }) =>
      groupsApi.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['group', groupId] });
      setIsRenameDialogOpen(false);
      setRenameGroupName('');
    },
  });

  const handleRenameClick = () => {
    if (displayGroup)
    {
      setRenameGroupName(displayGroup.name);
      setIsRenameDialogOpen(true);
    }
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (displayGroup && renameGroupName.trim())
    {
      updateGroupMutation.mutate({
        id: displayGroup.id,
        updates: { name: renameGroupName.trim() },
      });
    }
  };

  if (groupLoading || allGroupsLoading)
  {
    return (
      <div className="w-full bg-anara-light-bg min-h-screen">
        <div className="container py-8 sm:py-12">
          <div className="text-center text-anara-light-text-muted">Loading group...</div>
        </div>
      </div>
    );
  }

  // Try to get group data - use fetched group or fallback to allGroups
  const displayGroup = group || (allGroups ? allGroups.find(g => g.id === groupId) : null);

  // If we have an error and no group data at all, show error
  if (groupError && !displayGroup)
  {
    return (
      <div className="w-full bg-anara-light-bg min-h-screen">
        <div className="container py-8 sm:py-12">
          <div className="text-center text-red-600">
            <p className="mb-2">Error loading group: {groupError.message}</p>
            {groupError.message.includes('Network error') && (
              <p className="text-sm text-anara-light-text-muted mb-4">
                Could not reach server!
              </p>
            )}
          </div>
          <Link to="/groups" className="mt-4 inline-block">
            <button className="text-gray-900 hover:underline">Back to Groups</button>
          </Link>
        </div>
      </div>
    );
  }

  // If we still don't have group data, show not found
  if (!displayGroup)
  {
    return (
      <div className="w-full bg-anara-light-bg min-h-screen">
        <div className="container py-8 sm:py-12">
          <div className="text-center text-red-600">
            <p className="mb-2">Group not found</p>
          </div>
          <Link to="/groups" className="mt-4 inline-block">
            <button className="text-gray-900 hover:underline">Back to Groups</button>
          </Link>
        </div>
      </div>
    );
  }


  return (
    <div className="w-full bg-anara-light-bg min-h-screen">
      <div className="container py-8 sm:py-12">
        {/* Group Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl sm:text-4xl font-bold text-anara-light-text">
                {displayGroup.name}
              </h1>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRenameClick}
            >
              Rename
            </Button>
          </div>
          <p className="text-sm text-anara-light-text-muted">
            Created {format(new Date(displayGroup.created_at), 'MMMM d, yyyy')}
          </p>
        </div>

        {/* Child Groups Section - Always show if folders exist */}
        {childGroups.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 text-anara-light-text">Folders</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {childGroups.map((childGroup) => {
                return (
                  <Link
                    key={childGroup.id}
                    to={`/groups/${childGroup.id}`}
                    className="border border-anara-light-border rounded-sm p-4 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Folder size={20} className="text-anara-light-text-muted flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-anara-light-text truncate">
                          {childGroup.name}
                        </h3>
                        <p className="text-xs text-anara-light-text-muted">
                          {childGroup.papers?.length || 0} papers
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Papers Section - Only show if papers exist */}
        {displayGroup.papers && displayGroup.papers.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-anara-light-text">Papers</h2>
              <div className="flex items-center gap-2">
                {selectedPaperIds.length > 0 && (
                  <>
                    <PaperMultiSelect
                      papers={displayGroup.papers}
                      selectedIds={selectedPaperIds}
                      onSelectionChange={setSelectedPaperIds}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                      onClick={() => navigate('/export', {
                        state: {
                          paperIds: selectedPaperIds,
                          returnPath: `/groups/${groupId}`,
                          context: 'Groups'
                        }
                      })}
                    >
                      Export {selectedPaperIds.length}
                    </Button>
                  </>
                )}
                {selectedPaperIds.length === 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                    onClick={() => navigate('/export', {
                      state: {
                        paperIds: displayGroup.papers?.map(p => p.id) || [],
                        returnPath: `/groups/${groupId}`,
                        context: 'Groups'
                      }
                    })}
                  >
                    Export All
                  </Button>
                )}
              </div>
            </div>
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paper Title</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>DOI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayGroup.papers.map((paper) => (
                    <TableRow
                      key={paper.id}
                      className={`cursor-pointer hover:opacity-80 ${selectedPaperIds.includes(paper.id) ? 'ring-2 ring-blue-500' : ''}`}
                      onClick={() => {
                        if (selectedPaperIds.length > 0)
                        {
                          // In selection mode, toggle selection instead of navigating
                          if (selectedPaperIds.includes(paper.id))
                          {
                            setSelectedPaperIds(selectedPaperIds.filter(id => id !== paper.id));
                          } else
                          {
                            setSelectedPaperIds([...selectedPaperIds, paper.id]);
                          }
                        } else
                        {
                          navigate(`/papers/${paper.id}`);
                        }
                      }}
                    >
                      <TableCell className="font-medium">
                        {paper.title}
                      </TableCell>
                      <TableCell className="text-sm text-anara-light-text-muted">
                        {format(new Date(paper.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-sm text-anara-light-text-muted">
                        {paper.doi || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Empty State - Only show if no papers AND no folders */}
        {(!displayGroup.papers || displayGroup.papers.length === 0) && childGroups.length === 0 && (
          <div className="text-center py-12 text-anara-light-text-muted">
            <p className="text-lg mb-2">No papers in this group</p>
            <p className="text-sm">This group is empty.</p>
          </div>
        )}

        {/* Rename Group Dialog */}
        <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename Group</DialogTitle>
              <DialogDescription>
                Enter a new name for the group.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleRenameSubmit}>
              <div className="flex flex-col gap-4 py-4">
                <div className="flex flex-col gap-2">
                  <label htmlFor="rename-group-name" className="text-sm font-medium">
                    Group Name
                  </label>
                  <Input
                    id="rename-group-name"
                    type="text"
                    value={renameGroupName}
                    onChange={(e) => setRenameGroupName(e.target.value)}
                    placeholder="Group name..."
                    className="w-full"
                    autoFocus
                  />
                </div>
                {updateGroupMutation.isError && (
                  <p className="text-sm text-red-600">
                    {updateGroupMutation.error instanceof Error ? updateGroupMutation.error.message : 'Failed to rename group'}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsRenameDialogOpen(false);
                    setRenameGroupName('');
                  }}
                  disabled={updateGroupMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!renameGroupName.trim() || updateGroupMutation.isPending}
                >
                  {updateGroupMutation.isPending ? 'Renaming...' : 'Rename'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

