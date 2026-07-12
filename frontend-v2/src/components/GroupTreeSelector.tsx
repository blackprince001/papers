import { CheckIcon, FolderIcon, SearchIcon } from '@/components/icons';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import type { Group } from '@/lib/api/groups';

interface GroupTreeSelectorProps {
  groups: Group[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  search: string;
  onSearchChange: (q: string) => void;
  /** Tailwind height class for the scroll area, e.g. "h-70" or "h-48". */
  heightClass?: string;
  /** Hide the search box (useful when the parent supplies its own search UI). */
  hideSearch?: boolean;
  emptyLabel?: string;
}

interface GroupItemProps {
  group: Group;
  level: number;
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  search: string;
}

function matchesSearch(g: Group, q: string): boolean {
  if (!q) return true;
  if (g.name.toLowerCase().includes(q.toLowerCase())) return true;
  return g.children?.some((c) => matchesSearch(c, q)) ?? false;
}

function GroupItem({ group, level, selectedIds, onToggle, search }: GroupItemProps) {
  if (!matchesSearch(group, search)) return null;
  const isSelected = selectedIds.has(group.id);
  const hasChildren = (group.children?.length ?? 0) > 0;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-colors',
          'hover:bg-(--muted)',
          isSelected && 'bg-(--muted)',
        )}
        style={{ paddingLeft: `${0.5 + level * 1.25}rem` }}
        onClick={() => onToggle(group.id)}
      >
        <div
          className={cn(
            'w-4 h-4 rounded border-2 flex items-center justify-center transition-colors shrink-0',
            isSelected
              ? 'bg-(--foreground) border-(--foreground)'
              : 'border-(--border)',
          )}
        >
          {isSelected && <CheckIcon size="xs" strokeWidth={3} className="text-(--background)" />}
        </div>

        <span
          className={cn(
            'text-code truncate select-none',
            isSelected && 'font-medium',
          )}
        >
          {group.name}
        </span>
      </div>

      {hasChildren &&
        group.children!.map((child) => (
          <GroupItem
            key={child.id}
            group={child}
            level={level + 1}
            selectedIds={selectedIds}
            onToggle={onToggle}
            search={search}
          />
        ))}
    </div>
  );
}

/** Build a flat group list into a parent/child tree. */
export function buildGroupTree(groups: Group[]): Group[] {
  const map = new Map<number, Group & { _kids: Group[] }>();
  const roots: (Group & { _kids: Group[] })[] = [];

  groups.forEach((g) => map.set(g.id, { ...g, children: undefined, _kids: [] }));

  map.forEach((node) => {
    if (node.parent_id != null) {
      map.get(node.parent_id)?._kids.push(node);
    } else {
      roots.push(node);
    }
  });

  function toGroup(node: Group & { _kids: Group[] }): Group {
    const { _kids, ...rest } = node;
    return {
      ...rest,
      children: _kids.length
        ? _kids.map((kid) => toGroup(kid as Group & { _kids: Group[] }))
        : undefined,
    };
  }

  return roots.map(toGroup);
}

export function GroupTreeSelector({
  groups,
  selectedIds,
  onChange,
  search,
  onSearchChange,
  heightClass = 'h-70',
  hideSearch = false,
  emptyLabel = 'No groups yet',
}: GroupTreeSelectorProps) {
  const selectedSet = new Set(selectedIds);
  const tree = buildGroupTree(groups);

  const toggle = (id: number) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  return (
    <div>
      {!hideSearch && (
        <div className="relative mb-3">
          <SearchIcon
            size="sm"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-(--muted-foreground) pointer-events-none"
          />
          <Input
            placeholder="Search groups…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-8 text-code"
          />
        </div>
      )}

      <div
        className={cn(
          'border border-(--border) rounded-xl p-2 overflow-y-auto space-y-0.5',
          heightClass,
        )}
      >
        {tree.length > 0 ? (
          tree.map((g) => (
            <GroupItem
              key={g.id}
              group={g}
              level={0}
              selectedIds={selectedSet}
              onToggle={toggle}
              search={search}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-(--muted-foreground)">
            <FolderIcon size="xl" className="opacity-30" />
            <span className="text-code">{emptyLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
}
