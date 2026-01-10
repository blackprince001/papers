import { useState } from 'react';
import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTree } from '@headless-tree/react';
import {
  expandAllFeature,
  hotkeysCoreFeature,
  searchFeature,
  selectionFeature,
  syncDataLoaderFeature,
  type TreeState,
} from '@headless-tree/core';
import { FolderIcon, FolderOpenIcon, SearchIcon } from 'lucide-react';
import { groupsApi } from '@/lib/api/groups';
import { papersApi } from '@/lib/api/papers';
import { Button } from '@/components/Button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Tree, TreeItem, TreeItemLabel } from '@/components/ui/tree';
import { format } from 'date-fns';
import type { Group, Paper } from '@/lib/api/groups';
import { toastError } from '@/lib/utils/toast';
import { useConfirmDialog } from '@/components/ConfirmDialog';
import { PaperMultiSelect } from '@/components/PaperMultiSelect';

type ViewMode = 'table' | 'tree';

interface DraggablePaperRowProps {
  paper: Paper;
  isSelected?: boolean;
  onSelect?: (paperId: number) => void;
  inSelectionMode?: boolean;
}

function DraggablePaperRow({ paper, isSelected, onSelect, inSelectionMode }: DraggablePaperRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `paper-${paper.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleRowClick = () => {
    if (inSelectionMode && onSelect)
    {
      onSelect(paper.id);
    }
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={`${isDragging ? 'bg-accent/50' : ''} ${isSelected ? 'ring-2 ring-blue-500' : ''} ${inSelectionMode ? 'cursor-pointer' : ''}`}
      onClick={handleRowClick}
    >
      <TableCell className="font-medium">
        <div className="flex items-center gap-3">
          <div
            {...attributes}
            {...listeners}
            className="w-3 h-3 rounded-sm bg-gray-300 cursor-grab active:cursor-grabbing flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          />
          {inSelectionMode ? (
            <span className="text-sm">{paper.title}</span>
          ) : (
            <Link
              to={`/papers/${paper.id}`}
              className="hover:underline text-sm"
              onClick={(e) => e.stopPropagation()}
            >
              {paper.title}
            </Link>
          )}
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{format(new Date(paper.created_at), 'MMM d, yyyy')}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{paper.doi || '—'}</TableCell>
    </TableRow>
  );
}

interface GroupTableSectionProps {
  group: Group;
  allGroups: Group[];
  level?: number;
  onCreateSubGroup?: (parentId: number) => void;
  onRenameGroup?: (group: Group) => void;
  onDeleteGroup?: (group: Group) => void;
}

interface UngroupedPapersSectionProps {
  ungroupedPapers: Paper[];
}

function UngroupedPapersSection({ ungroupedPapers }: UngroupedPapersSectionProps) {
  const navigate = useNavigate();
  const [selectedPaperIds, setSelectedPaperIds] = useState<number[]>([]);

  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-gray-400" />
          Ungrouped Papers ({ungroupedPapers.length})
        </div>
        <div className="flex items-center gap-2">
          {selectedPaperIds.length > 0 && (
            <>
              <PaperMultiSelect
                papers={ungroupedPapers}
                selectedIds={selectedPaperIds}
                onSelectionChange={setSelectedPaperIds}
              />
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2 text-xs"
                onClick={() => navigate('/export', {
                  state: {
                    paperIds: selectedPaperIds,
                    returnPath: '/groups',
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
              className="flex items-center gap-2 text-xs"
              onClick={() => navigate('/export', {
                state: {
                  paperIds: ungroupedPapers.map(p => p.id),
                  returnPath: '/groups',
                  context: 'Groups'
                }
              })}
            >
              Export All
            </Button>
          )}
        </div>
      </h2>
      <div className="overflow-hidden rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Paper Title</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>DOI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ungroupedPapers.map((paper) => (
              <DraggablePaperRow
                key={paper.id}
                paper={paper}
                isSelected={selectedPaperIds.includes(paper.id)}
                inSelectionMode={selectedPaperIds.length > 0}
                onSelect={(paperId) => {
                  if (selectedPaperIds.includes(paperId))
                  {
                    setSelectedPaperIds(selectedPaperIds.filter(id => id !== paperId));
                  } else
                  {
                    setSelectedPaperIds([...selectedPaperIds, paperId]);
                  }
                }}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function GroupTableSection({ group, allGroups, level = 0, onCreateSubGroup, onDeleteGroup, onRenameGroup }: GroupTableSectionProps) {
  const navigate = useNavigate();
  const [selectedPaperIds, setSelectedPaperIds] = useState<number[]>([]);

  // Build breadcrumb path
  const buildBreadcrumb = (groupId: number, groups: Group[]): Group[] => {
    const groupMap = new Map(groups.map((g) => [g.id, g]));
    const path: Group[] = [];
    let currentGroup = groupMap.get(groupId);

    while (currentGroup?.parent_id)
    {
      const parent = groupMap.get(currentGroup.parent_id);
      if (parent)
      {
        path.unshift(parent);
        currentGroup = parent;
      } else
      {
        break;
      }
    }

    return path;
  };

  const breadcrumb = buildBreadcrumb(group.id, allGroups);
  const indentClass = level > 0 ? `ml-${level * 6}` : '';

  // Get direct children of this group (not nested children)
  const directChildren = allGroups.filter((g) => g.parent_id === group.id);

  return (
    <div className={`mb-8 ${indentClass}`}>
      <h2 className={`text-lg font-semibold mb-4 flex items-center gap-2 justify-between ${level > 0 ? 'text-base' : ''}`}>
        <div className="flex items-center gap-2">
          {breadcrumb.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {breadcrumb.map((g, idx) => (
                <span key={g.id}>
                  {g.name}
                  {idx < breadcrumb.length - 1 && ' > '}
                </span>
              ))}
              {' > '}
            </span>
          )}
          {group.name} ({group.papers?.length || 0})
        </div>
        <div className="flex items-center gap-2">
          {onCreateSubGroup && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCreateSubGroup(group.id)}
              className="text-xs"
            >
              Create Sub-Group
            </Button>
          )}
          {onRenameGroup && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRenameGroup(group)}
              className="text-xs"
            >
              Rename
            </Button>
          )}
          {onDeleteGroup && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDeleteGroup(group)}
              className="text-xs"
            >
              Delete
            </Button>
          )}
        </div>
      </h2>
      {group.papers && group.papers.length > 0 ? (
        <>
          <div className="flex items-center justify-end gap-2 mb-2">
            {selectedPaperIds.length > 0 && (
              <>
                <PaperMultiSelect
                  papers={group.papers}
                  selectedIds={selectedPaperIds}
                  onSelectionChange={setSelectedPaperIds}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 text-xs"
                  onClick={() => navigate('/export', {
                    state: {
                      paperIds: selectedPaperIds,
                      returnPath: '/groups',
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
                className="flex items-center gap-2 text-xs"
                onClick={() => navigate('/export', {
                  state: {
                    paperIds: group.papers?.map(p => p.id) || [],
                    returnPath: '/groups',
                    context: 'Groups'
                  }
                })}
              >
                Export All
              </Button>
            )}
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
                {group.papers.map((paper) => (
                  <DraggablePaperRow
                    key={paper.id}
                    paper={paper}
                    isSelected={selectedPaperIds.includes(paper.id)}
                    inSelectionMode={selectedPaperIds.length > 0}
                    onSelect={(paperId) => {
                      if (selectedPaperIds.includes(paperId))
                      {
                        setSelectedPaperIds(selectedPaperIds.filter(id => id !== paperId));
                      } else
                      {
                        setSelectedPaperIds([...selectedPaperIds, paperId]);
                      }
                    }}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      ) : (
        <div className="text-center py-8 text-muted-foreground text-sm border rounded-md">
          No papers in this group
        </div>
      )}
      {/* Render child groups recursively */}
      {directChildren.map((child) => (
        <GroupTableSection
          key={child.id}
          group={child}
          allGroups={allGroups}
          level={level + 1}
          onCreateSubGroup={onCreateSubGroup}
          onDeleteGroup={onDeleteGroup}
        />
      ))}
    </div>
  );
}

interface GroupTreeViewProps {
  groups: Group[];
  ungroupedPapers: Paper[];
}

function GroupTreeView({ groups, ungroupedPapers }: GroupTreeViewProps) {
  // Build hierarchical tree structure from flat groups list
  const buildGroupTree = (groups: Group[]): Group[] => {
    const groupMap = new Map<number, Group & { _children?: Group[] }>();
    const roots: Group[] = [];

    // First pass: create map and initialize children arrays
    groups.forEach((group) => {
      groupMap.set(group.id, { ...group, _children: [] });
    });

    // Second pass: build parent-child relationships
    groups.forEach((group) => {
      const node = groupMap.get(group.id)!;
      if (group.parent_id)
      {
        const parent = groupMap.get(group.parent_id);
        if (parent)
        {
          if (!parent._children) parent._children = [];
          parent._children.push(node);
        }
      } else
      {
        roots.push(node);
      }
    });

    // Convert _children to children for each node
    const processNode = (node: Group & { _children?: Group[] }): Group => {
      if (node._children && node._children.length > 0)
      {
        return { ...node, children: node._children.map(processNode) };
      }
      return node;
    };

    return roots.map(processNode);
  };

  const rootGroups = buildGroupTree(groups);
  const allGroupIds = groups.map((g) => `group-${g.id}`);
  const initialExpandedItems = ungroupedPapers.length > 0
    ? [...allGroupIds, 'ungrouped']
    : allGroupIds;
  const [state, setState] = useState<Partial<TreeState<{ name: string; children?: string[]; group?: Group; paper?: Paper }>>>({});
  const [searchQuery, setSearchQuery] = useState('');

  // Depth map: itemId -> depth
  const depthMap = new Map<string, number>();
  depthMap.set('root', 0);

  // Build tree data structure recursively and track depth
  const items: Record<string, { name: string; children?: string[]; group?: Group; paper?: Paper }> = {};

  const processGroup = (group: Group, parentDepth: number = 0): void => {
    const groupId = `group-${group.id}`;
    const children: string[] = [];
    const currentDepth = parentDepth + 1;
    depthMap.set(groupId, currentDepth);

    // Add child groups
    if (group.children && group.children.length > 0)
    {
      group.children.forEach((child) => {
        const childId = `group-${child.id}`;
        children.push(childId);
        processGroup(child, currentDepth);
      });
    }

    // Add papers
    if (group.papers && group.papers.length > 0)
    {
      group.papers.forEach((paper) => {
        const paperId = `paper-${paper.id}`;
        items[paperId] = { name: paper.title, paper };
        depthMap.set(paperId, currentDepth + 1);
        children.push(paperId);
      });
    }

    items[groupId] = {
      name: group.name,
      children: children.length > 0 ? children : undefined,
      group,
    };
  };

  // Process all groups recursively
  rootGroups.forEach((group) => processGroup(group, 0)); // Root groups start at depth 0

  // Build root children array
  const rootChildren: string[] = [];

  // Add ungrouped papers section if there are any
  if (ungroupedPapers.length > 0)
  {
    const ungroupedId = 'ungrouped';
    rootChildren.push(ungroupedId);
    depthMap.set(ungroupedId, 1);

    // Add ungrouped papers as children
    const ungroupedChildren: string[] = [];
    ungroupedPapers.forEach((paper) => {
      const paperId = `paper-${paper.id}`;
      items[paperId] = { name: paper.title, paper };
      depthMap.set(paperId, 2);
      ungroupedChildren.push(paperId);
    });

    items[ungroupedId] = {
      name: `Ungrouped Papers (${ungroupedPapers.length})`,
      children: ungroupedChildren,
    };
  }

  // Add groups to root children
  rootChildren.push(...rootGroups.map((g) => `group-${g.id}`));

  // Set root item
  items.root = {
    name: 'Groups',
    children: rootChildren,
  };

  const tree = useTree<{ name: string; children?: string[]; group?: Group; paper?: Paper }>({
    dataLoader: {
      getChildren: (itemId) => items[itemId]?.children ?? [],
      getItem: (itemId) => items[itemId]!,
    },
    features: [
      syncDataLoaderFeature,
      hotkeysCoreFeature,
      selectionFeature,
      searchFeature,
      expandAllFeature,
    ],
    getItemName: (item) => item.getItemData().name,
    indent: 20,
    initialState: {
      expandedItems: initialExpandedItems,
    },
    isItemFolder: (item) => {
      const data = item.getItemData();
      const itemId = item.getId();
      return (data?.children?.length ?? 0) > 0 || !!data?.group || itemId === 'ungrouped';
    },
    rootItemId: 'root',
    setState,
    state,
  });

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="relative">
        <Input
          className="peer ps-9"
          {...{
            ...tree.getSearchInputElementProps(),
            onChange: (e) => {
              const originalProps = tree.getSearchInputElementProps();
              if (originalProps.onChange)
              {
                originalProps.onChange(e);
              }
              const value = e.target.value;
              setSearchQuery(value);
              if (value.length > 0)
              {
                tree.expandAll();
              } else
              {
                setState((prevState: Partial<TreeState<{ name: string; children?: string[]; group?: Group; paper?: Paper }>>) => ({
                  ...prevState,
                  expandedItems: initialExpandedItems,
                }));
              }
            },
          }}
          placeholder="Quick search..."
          type="search"
          value={searchQuery}
        />
        <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-muted-foreground/80 peer-disabled:opacity-50">
          <SearchIcon aria-hidden="true" className="size-4" />
        </div>
      </div>

      <Tree indent={20} tree={tree} className="flex-1 overflow-auto">
        {tree.getItems().map((item) => {
          const itemData = item.getItemData();
          const isGroup = !!itemData.group;

          // Get depth from our depth map
          const itemId = item.getId();
          const depth = depthMap.get(itemId) ?? 0;

          const isUngrouped = itemId === 'ungrouped';

          return (
            <TreeItem item={item} key={item.getId()} depth={depth}>
              <TreeItemLabel>
                <span className="flex items-center gap-2">
                  {item.isFolder() &&
                    (item.isExpanded() ? (
                      <FolderOpenIcon className="pointer-events-none size-4 text-muted-foreground" />
                    ) : (
                      <FolderIcon className="pointer-events-none size-4 text-muted-foreground" />
                    ))}
                  {isGroup && itemData.group && (
                    <div
                      className="w-3 h-3 rounded-sm bg-gray-300"
                    />
                  )}
                  {isUngrouped && (
                    <div
                      className="w-3 h-3 rounded-sm bg-gray-300"
                    />
                  )}
                  <span>{item.getItemName()}</span>
                  {itemData.paper && (
                    <Link
                      to={`/papers/${itemData.paper.id}`}
                      className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View
                    </Link>
                  )}
                </span>
              </TreeItemLabel>
            </TreeItem>
          );
        })}
      </Tree>
    </div>
  );
}

export default function Groups() {
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedParentId, setSelectedParentId] = useState<number | undefined>(undefined);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [renamingGroup, setRenamingGroup] = useState<Group | null>(null);
  const [renameGroupName, setRenameGroupName] = useState('');
  const queryClient = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const { data: groups, isLoading, error } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
  });

  // Fetch all papers to find ungrouped ones
  const { data: allPapersData } = useQuery({
    queryKey: ['papers', 'all'],
    queryFn: async () => {
      // Fetch all papers with a large page size
      const result = await papersApi.list(1, 100);
      return result.papers;
    },
    enabled: !!groups, // Only fetch when groups are loaded
  });

  // Calculate ungrouped papers
  const ungroupedPapers = React.useMemo(() => {
    if (!allPapersData || !groups) return [];

    // Get all paper IDs that are in groups
    const groupedPaperIds = new Set(
      groups.flatMap((group) => group.papers?.map((p) => p.id) || [])
    );

    // Return papers that are not in any group
    return allPapersData.filter((paper) => !groupedPaperIds.has(paper.id));
  }, [allPapersData, groups]);

  const createMutation = useMutation({
    mutationFn: ({ name, parentId }: { name: string; parentId?: number }) =>
      groupsApi.create({ name, parent_id: parentId }),
    onSuccess: () => {
      setNewGroupName('');
      setSelectedParentId(undefined);
      setIsCreateDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      // Invalidate papers to refresh ungrouped papers list
      queryClient.invalidateQueries({ queryKey: ['papers'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => groupsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      // Invalidate papers to refresh ungrouped papers list
      queryClient.invalidateQueries({ queryKey: ['papers'] });
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: { name?: string; parent_id?: number } }) =>
      groupsApi.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setIsRenameDialogOpen(false);
      setRenamingGroup(null);
      setRenameGroupName('');
    },
  });

  const movePaperMutation = useMutation({
    mutationFn: ({ paperId, groupIds }: { paperId: number; groupIds: number[] }) =>
      groupsApi.updatePaperGroups(paperId, groupIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      // Invalidate papers to refresh ungrouped papers list
      queryClient.invalidateQueries({ queryKey: ['papers'] });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newGroupName.trim())
    {
      createMutation.mutate({ name: newGroupName.trim(), parentId: selectedParentId });
    }
  };

  const handleCreateSubGroup = (parentId: number) => {
    setSelectedParentId(parentId);
    setIsCreateDialogOpen(true);
  };

  const handleOpenCreateDialog = () => {
    setSelectedParentId(undefined);
    setNewGroupName('');
    setIsCreateDialogOpen(true);
  };

  const handleCloseCreateDialog = () => {
    setIsCreateDialogOpen(false);
    setNewGroupName('');
    setSelectedParentId(undefined);
  };

  const handleRenameGroup = (group: Group) => {
    setRenamingGroup(group);
    setRenameGroupName(group.name);
    setIsRenameDialogOpen(true);
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (renamingGroup && renameGroupName.trim())
    {
      updateGroupMutation.mutate({
        id: renamingGroup.id,
        updates: { name: renameGroupName.trim() },
      });
    }
  };

  const handleCloseRenameDialog = () => {
    setIsRenameDialogOpen(false);
    setRenamingGroup(null);
    setRenameGroupName('');
  };

  const handleDeleteGroup = (group: Group) => {
    const hasChildren = group.children && group.children.length > 0;
    const message = hasChildren && group.children
      ? `Delete group "${group.name}"? This group has ${group.children.length} sub-group(s). They will need to be deleted or moved first.`
      : `Delete group "${group.name}"?`;

    confirm(
      'Delete Group',
      message,
      () => {
        if (hasChildren)
        {
          toastError('Cannot delete group with sub-groups. Please delete or move sub-groups first.');
          return;
        }
        deleteMutation.mutate(group.id);
      },
      { variant: 'destructive', confirmLabel: 'Delete' }
    );
  };

  // Helper function to build flat group list with hierarchy indicators
  const buildGroupOptions = (groups: Group[]): Array<{ id: number; name: string; indent: string }> => {
    const options: Array<{ id: number; name: string; indent: string }> = [];
    const rootGroups = groups.filter((g) => !g.parent_id);

    const processGroup = (group: Group, indent: string) => {
      options.push({ id: group.id, name: group.name, indent });
      if (group.children)
      {
        group.children.forEach((child) => {
          processGroup(child, indent + '  ');
        });
      }
    };

    rootGroups.forEach((group) => {
      processGroup(group, '');
    });

    return options;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Extract paper ID and group IDs
    if (activeId.startsWith('paper-') && overId.startsWith('paper-'))
    {
      // Find the paper and its current group
      let paper: Paper | undefined;
      let currentGroupId: number | undefined;

      groups?.forEach((group) => {
        const found = group.papers?.find((p) => `paper-${p.id}` === activeId);
        if (found)
        {
          paper = found;
          currentGroupId = group.id;
        }
      });

      // Find the target group
      let targetGroupId: number | undefined;
      groups?.forEach((group) => {
        const found = group.papers?.find((p) => `paper-${p.id}` === overId);
        if (found)
        {
          targetGroupId = group.id;
        }
      });

      if (paper && currentGroupId && targetGroupId && currentGroupId !== targetGroupId && groups)
      {
        // Get all groups the paper belongs to, replace the current one with target
        const paperId = paper.id;
        const currentGroups = groups
          .filter((g) => g.papers?.some((p) => p.id === paperId))
          .map((g) => g.id)
          .filter((id) => id !== currentGroupId);

        const newGroupIds = [...currentGroups, targetGroupId];
        movePaperMutation.mutate({ paperId, groupIds: newGroupIds });
      }
    }
  };

  // Collect all paper IDs for DnD context (including ungrouped papers)
  // This must be called before early returns to maintain hook order
  const allPaperIds = React.useMemo(() => {
    const groupedPaperIds = groups
      ? groups.flatMap((group) => group.papers?.map((p) => `paper-${p.id}`) || [])
      : [];
    const ungroupedPaperIds = ungroupedPapers.map((p) => `paper-${p.id}`);
    return [...groupedPaperIds, ...ungroupedPaperIds];
  }, [groups, ungroupedPapers]);

  if (isLoading)
  {
    return (
      <div className="w-full">
        <div className="container py-8 sm:py-12">
          <div className="text-center text-gray-600">Loading groups...</div>
        </div>
      </div>
    );
  }

  if (error)
  {
    return (
      <div className="w-full bg-anara-light-bg min-h-screen">
        <div className="container py-8 sm:py-12">
          <div className="text-center text-red-600">Error loading groups: {error.message}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-anara-light-bg min-h-screen">
      <div className="container py-8 sm:py-12">
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-anara-light-text">Groups</h1>
          <Button onClick={handleOpenCreateDialog}>
            Create Group
          </Button>
        </div>

        <div className="mb-6 sm:mb-8">
          {/* View Mode Toggle */}
          {groups && groups.length > 0 && (
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)} className="w-auto">
              <TabsList>
                <TabsTrigger value="table">Table</TabsTrigger>
                <TabsTrigger value="tree">Tree</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>

        {(groups && groups.length > 0) || ungroupedPapers.length > 0 ? (
          viewMode === 'table' ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={allPaperIds} strategy={verticalListSortingStrategy}>
                <div>
                  {/* Ungrouped Papers Section */}
                  {ungroupedPapers.length > 0 && (
                    <UngroupedPapersSection ungroupedPapers={ungroupedPapers} />
                  )}
                  {/* Grouped Papers */}
                  {groups && groups
                    .filter((g) => !g.parent_id)
                    .map((group) => (
                      <GroupTableSection
                        key={group.id}
                        group={group}
                        allGroups={groups || []}
                        onCreateSubGroup={handleCreateSubGroup}
                        onRenameGroup={handleRenameGroup}
                        onDeleteGroup={handleDeleteGroup}
                      />
                    ))}
                </div>
              </SortableContext>
              <DragOverlay>
                {activeId && groups && (() => {
                  const paperId = parseInt(activeId.toString().replace('paper-', ''));
                  const paper = groups.flatMap((g) => g.papers || []).find((p) => p.id === paperId);
                  return paper ? (
                    <div className="bg-white border rounded-md p-2 shadow-lg max-w-xs">
                      <div className="text-sm font-medium truncate">{paper.title}</div>
                    </div>
                  ) : null;
                })()}
              </DragOverlay>
            </DndContext>
          ) : (
            <div className="h-[600px] border rounded-md p-4">
              <GroupTreeView groups={groups || []} ungroupedPapers={ungroupedPapers} />
            </div>
          )
        ) : ungroupedPapers.length === 0 ? (
          <div className="text-center py-12 text-anara-light-text-muted">
            <p className="text-lg mb-2">No groups or papers yet</p>
            <p className="text-sm">Create a group to organize your papers, or upload papers first.</p>
          </div>
        ) : null}

        {/* Create Group Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {selectedParentId ? 'Create Sub-Group' : 'Create Group'}
              </DialogTitle>
              <DialogDescription>
                {selectedParentId
                  ? 'Create a new sub-group under the selected parent group.'
                  : 'Create a new group to organize your papers.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate}>
              <div className="flex flex-col gap-4 py-4">
                <div className="flex flex-col gap-2">
                  <label htmlFor="group-name" className="text-sm font-medium">
                    Group Name
                  </label>
                  <Input
                    id="group-name"
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder={selectedParentId ? "Sub-group name..." : "Group name..."}
                    className="w-full"
                    autoFocus
                  />
                </div>
                {groups && groups.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <label htmlFor="parent-group" className="text-sm font-medium">
                      Parent Group (Optional)
                    </label>
                    <select
                      id="parent-group"
                      value={selectedParentId || ''}
                      onChange={(e) => setSelectedParentId(e.target.value ? parseInt(e.target.value) : undefined)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-corca-blue-medium focus:border-transparent"
                    >
                      <option value="">Top-level group</option>
                      {buildGroupOptions(groups).map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.indent}{option.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {createMutation.isError && (
                  <p className="text-sm text-red-600">
                    {createMutation.error instanceof Error ? createMutation.error.message : 'Failed to create group'}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseCreateDialog}
                  disabled={createMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!newGroupName.trim() || createMutation.isPending}
                >
                  {createMutation.isPending ? 'Creating...' : selectedParentId ? 'Create Sub-Group' : 'Create Group'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

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
                  onClick={handleCloseRenameDialog}
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
        {confirmDialog}
      </div>
    </div>
  );
}
