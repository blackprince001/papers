import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { GroupTreeSelector } from '@/components/GroupTreeSelector';
import type { Group } from '@/lib/api/groups';

interface MovePapersDialogProps {
  open: boolean;
  onClose: () => void;
  onMove: (groupIds: number[]) => void;
  groups: Group[];
  paperCount: number;
  initialGroupIds?: number[];
  isMoving?: boolean;
}

export function MovePapersDialog({
  open,
  onClose,
  onMove,
  groups,
  paperCount,
  initialGroupIds = [],
  isMoving = false,
}: MovePapersDialogProps) {
  const [selected, setSelected] = useState<number[]>(initialGroupIds);
  const [search, setSearch] = useState('');
  const prevOpen = useRef(open);

  useEffect(() => {
    if (open && !prevOpen.current) {
      setSelected(initialGroupIds);
      setSearch('');
    }
    prevOpen.current = open;
  }, [open, initialGroupIds]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Move to Group"
      description={`Assign ${paperCount} paper${paperCount !== 1 ? 's' : ''} to one or more groups.`}
      size="md"
    >
      <GroupTreeSelector
        groups={groups}
        selectedIds={selected}
        onChange={setSelected}
        search={search}
        onSearchChange={setSearch}
      />

      <p className="mt-2 text-caption text-(--muted-foreground)">
        {selected.length} group{selected.length !== 1 ? 's' : ''} selected
      </p>

      <DialogFooter className="mt-4">
        <Button variant="ghost" onClick={onClose} disabled={isMoving}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => onMove(selected)} loading={isMoving}>
          Apply
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
