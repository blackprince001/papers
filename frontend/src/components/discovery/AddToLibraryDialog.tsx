import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Folder, Plus, Loader2, Check, ChevronRight } from 'lucide-react';
import { groupsApi, type Group } from '@/lib/api/groups';
import type { DiscoveredPaperPreview } from '@/lib/api/discovery';

interface AddToLibraryDialogProps {
  paper: DiscoveredPaperPreview;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (paperId: number) => void;
}

export function AddToLibraryDialog({ paper, isOpen, onClose, onSuccess }: AddToLibraryDialogProps) {
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();

  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
    enabled: isOpen,
  });

  const addToLibraryMutation = useMutation({
    mutationFn: async () => {
      // Prefer pdf_url over url (landing page URLs like Semantic Scholar won't work)
      const url = paper.pdf_url || paper.url;
      if (!url) {
        throw new Error('No URL available for this paper');
      }

      // Warn if we only have a landing page URL (no direct PDF)
      if (!paper.pdf_url && paper.source === 'semantic_scholar') {
        throw new Error('No PDF available for this paper. Try finding the paper on arXiv or the publisher website.');
      }

      // Use the ingest API with group_ids
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'}/ingest`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: paper.title,
            url,
            doi: paper.doi || undefined,
            group_ids: selectedGroups.length > 0 ? selectedGroups : undefined,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to add paper');
      }

      return response.json();
    },
  });

  const handleAddToLibrary = () => {
    addToLibraryMutation.mutate(undefined, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ['papers'] });
        onSuccess?.(data.id);
        onClose();
      },
    });
  };

  const toggleGroup = (groupId: number) => {
    setSelectedGroups((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    );
  };

  const toggleExpanded = (groupId: number) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  // Build tree structure from flat groups
  const buildTree = (groups: Group[]): Group[] => {
    const groupMap = new Map<number, Group & { children: Group[] }>();
    const roots: Group[] = [];

    groups.forEach((group) => {
      groupMap.set(group.id, { ...group, children: [] });
    });

    groups.forEach((group) => {
      const node = groupMap.get(group.id)!;
      if (group.parent_id) {
        const parent = groupMap.get(group.parent_id);
        if (parent) {
          parent.children.push(node);
        } else {
          roots.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    return roots;
  };

  const groupTree = buildTree(groups);

  const renderGroupItem = (group: Group & { children?: Group[] }, level: number = 0) => {
    const hasChildren = group.children && group.children.length > 0;
    const isExpanded = expandedGroups.has(group.id);
    const isSelected = selectedGroups.includes(group.id);

    return (
      <div key={group.id}>
        <div
          className="flex items-center gap-2 py-2 px-2 hover:bg-green-4 rounded-sm cursor-pointer transition-colors"
          style={{ paddingLeft: `${0.5 + level * 1}rem` }}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded(group.id);
              }}
              className="p-0.5 hover:bg-green-6 rounded"
            >
              <ChevronRight
                className={`w-4 h-4 text-green-28 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              />
            </button>
          ) : (
            <span className="w-5" />
          )}
          <button
            onClick={() => toggleGroup(group.id)}
            className="flex items-center gap-2 flex-1"
          >
            <div
              className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                isSelected
                  ? 'bg-green-28 border-green-28'
                  : 'border-green-6 hover:border-green-28'
              }`}
            >
              {isSelected && <Check className="w-3 h-3 text-white" />}
            </div>
            <Folder className="w-4 h-4 text-green-28" />
            <span className="text-sm text-anara-light-text">{group.name}</span>
          </button>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {group.children!.map((child) => renderGroupItem(child as Group & { children?: Group[] }, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-grayscale-8 border border-green-6 rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-green-6">
          <h2 className="text-lg font-medium text-anara-light-text">Add to Library</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-green-4 rounded transition-colors"
          >
            <X className="w-5 h-5 text-green-28" />
          </button>
        </div>

        {/* Paper Info */}
        <div className="p-4 border-b border-green-6 bg-green-4/30">
          <h3 className="text-sm font-medium text-anara-light-text line-clamp-2">
            {paper.title}
          </h3>
          {paper.authors && paper.authors.length > 0 && (
            <p className="text-xs text-green-28 mt-1 line-clamp-1">
              {paper.authors.slice(0, 3).join(', ')}
              {paper.authors.length > 3 && ` +${paper.authors.length - 3} more`}
            </p>
          )}
        </div>

        {/* Group Selection */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-anara-light-text">
              Select Groups (optional)
            </span>
            {selectedGroups.length > 0 && (
              <button
                onClick={() => setSelectedGroups([])}
                className="text-xs text-green-28 hover:text-green-38"
              >
                Clear all
              </button>
            )}
          </div>

          {groupsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-green-28" />
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-8">
              <Folder className="w-8 h-8 text-green-28 mx-auto mb-2" />
              <p className="text-sm text-green-34">No groups yet</p>
              <p className="text-xs text-green-28 mt-1">
                Paper will be added without a group
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {groupTree.map((group) => renderGroupItem(group as Group & { children?: Group[] }))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-green-6 flex items-center justify-between">
          <div className="text-xs text-green-28">
            {selectedGroups.length > 0
              ? `${selectedGroups.length} group${selectedGroups.length !== 1 ? 's' : ''} selected`
              : 'No groups selected'}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-green-28 hover:text-green-38 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddToLibrary}
              disabled={addToLibraryMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-green-28 text-white rounded-sm hover:bg-green-38 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {addToLibraryMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Add to Library
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error */}
        {addToLibraryMutation.isError && (
          <div className="px-4 pb-4">
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {addToLibraryMutation.error instanceof Error
                ? addToLibraryMutation.error.message
                : 'Failed to add paper'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
