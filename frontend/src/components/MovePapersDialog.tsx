import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from './Button';
import { Input } from '@/components/ui/input';
import { FolderIcon, FolderOpenIcon, SearchIcon, Check } from 'lucide-react';
import type { Group } from '@/lib/api/groups';
import { cn } from '@/lib/utils';

interface MovePapersDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onMove: (groupIds: number[]) => void;
  groups: Group[];
  paperCount: number;
  initialGroupIds?: number[];
  isMoving?: boolean;
}

interface GroupItemProps {
  group: Group;
  level: number;
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  searchQuery: string;
}

function GroupItem({ group, level, selectedIds, onToggle, searchQuery }: GroupItemProps) {
  const isSelected = selectedIds.has(group.id);
  const hasChildren = group.children && group.children.length > 0;

  // Simple search filter: if search query matches group name, or any child matches
  const matchesSearch = (g: Group): boolean => {
    if (!searchQuery) return true;
    if (g.name.toLowerCase().includes(searchQuery.toLowerCase())) return true;
    return g.children?.some(child => matchesSearch(child)) ?? false;
  };

  if (!matchesSearch(group)) return null;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors",
          isSelected && "bg-muted"
        )}
        style={{ paddingLeft: `${Math.max(0.5, level * 1.5)}rem` }}
        onClick={() => onToggle(group.id)}
      >
        <div className={cn(
          "w-4 h-4 rounded border flex items-center justify-center transition-colors",
          isSelected ? "bg-corca-blue-medium border-corca-blue-medium text-white" : "border-gray-400"
        )}>
          {isSelected && <Check className="w-3 h-3" />}
        </div>

        {hasChildren ? (
          <FolderOpenIcon className="w-4 h-4 text-blue-400" />
        ) : (
          <FolderIcon className="w-4 h-4 text-gray-400" />
        )}

        <span className="text-sm truncate select-none">{group.name}</span>
      </div>

      {hasChildren && group.children!.map(child => (
        <GroupItem
          key={child.id}
          group={child}
          level={level + 1}
          selectedIds={selectedIds}
          onToggle={onToggle}
          searchQuery={searchQuery}
        />
      ))}
    </div>
  );
}

export function MovePapersDialog({
  isOpen,
  onClose,
  onMove,
  groups,
  paperCount,
  initialGroupIds = [],
  isMoving = false
}: MovePapersDialogProps) {
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number>>(new Set(initialGroupIds));
  const [searchQuery, setSearchQuery] = useState('');
  const prevIsOpen = useRef(isOpen);

  // Reset selection when dialog opens (only on rising edge)
  useEffect(() => {
    if (isOpen && !prevIsOpen.current)
    {
      setSelectedGroupIds(new Set(initialGroupIds));
      setSearchQuery('');
    }
    prevIsOpen.current = isOpen;
  }, [isOpen, initialGroupIds]);

  const handleToggle = (groupId: number) => {
    const newSelected = new Set(selectedGroupIds);
    if (newSelected.has(groupId))
    {
      newSelected.delete(groupId);
    } else
    {
      newSelected.add(groupId);
    }
    setSelectedGroupIds(newSelected);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onMove(Array.from(selectedGroupIds));
  };

  // Build hierarchical structure just like in Groups.tsx
  const buildGroupTree = (groups: Group[]): Group[] => {
    const groupMap = new Map<number, Group & { _children?: Group[] }>();
    const roots: Group[] = [];

    // Clone groups to avoid mutating props
    const clonedGroups = groups.map(g => ({ ...g, children: undefined }));

    clonedGroups.forEach(g => {
      groupMap.set(g.id, { ...g, _children: [] });
    });

    clonedGroups.forEach(g => {
      const node = groupMap.get(g.id)!;
      if (g.parent_id)
      {
        const parent = groupMap.get(g.parent_id);
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Move Papers</DialogTitle>
          <DialogDescription>
            Select the groups to assign to {paperCount} paper{paperCount !== 1 ? 's' : ''}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search groups..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="border rounded-md p-2 h-[300px] overflow-hidden">
            <div className="h-full overflow-y-auto pr-2">
              {rootGroups.length > 0 ? (
                <div className="space-y-0.5">
                  {rootGroups.map(group => (
                    <GroupItem
                      key={group.id}
                      group={group}
                      level={0}
                      selectedIds={selectedGroupIds}
                      onToggle={handleToggle}
                      searchQuery={searchQuery}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
                  <FolderIcon className="h-8 w-8 mb-2 opacity-20" />
                  No groups found
                </div>
              )}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            {selectedGroupIds.size} group{selectedGroupIds.size !== 1 ? 's' : ''} selected
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isMoving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isMoving}>
              {isMoving ? 'Moving...' : 'Apply Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
