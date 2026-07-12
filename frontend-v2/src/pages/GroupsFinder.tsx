import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PlusIcon,
  DownloadIcon,
  EditIcon,
  EyeIcon,
  FolderIcon,
  FolderOpenIcon,
  ChatIcon,
  ArrowRightIcon,
  CloseIcon,
  ShareIcon,
  TrashIcon,
} from '@/components/icons';
import { groupsApi, type Group } from '@/lib/api/groups';
import { papersApi } from '@/lib/api/papers';
import { useAuth } from '@/contexts/AuthContext';
import { fetchApi } from '@/lib/api/client';
import {
  FileSystem,
  type FileSystemFileItem,
  type FileSystemItem,
} from '@/components/shadcn/file-system';
const QuickLookViewer = lazy(() =>
  import('@/components/shadcn/pdf-viewer').then((m) => ({ default: m.PDFViewer }))
);
import {
  buildManifest,
  groupIdFromPath,
  isSharedPath,
  type PaperFileMetadata,
} from '@/lib/finder/manifest';
import { loadPaperThumbnail } from '@/lib/finder/thumbnails';
import { PaperInfoPanel } from '@/components/finder/PaperInfoPanel';
import { PaperCoverPlaceholder } from '@/components/ui/PaperCoverPlaceholder';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogFooter } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog, useConfirmDialog } from '@/components/ConfirmDialog';
import { MovePapersDialog } from '@/components/MovePapersDialog';
import { ShareDialog } from '@/components/ShareDialog';
import { GroupChatSidebar } from '@/components/GroupChatSidebar';
import { toastError, toastSuccess } from '@/lib/utils/toast';

/* ----------------------------- context menu ----------------------------- */

interface MenuAction {
  label: string;
  icon?: React.ReactNode;
  destructive?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
}

function FinderContextMenu({
  x,
  y,
  actions,
  onClose,
}: {
  x: number;
  y: number;
  actions: MenuAction[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  // Keep the menu inside the viewport.
  const [position, setPosition] = useState({ left: x, top: y });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPosition({
      left: Math.min(x, window.innerWidth - rect.width - 8),
      top: Math.min(y, window.innerHeight - rect.height - 8),
    });
  }, [x, y]);

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left: position.left, top: position.top }}
      className="fixed z-50 min-w-44 rounded-lg border border-(--border) bg-(--popover) p-1 shadow-(--shadow-modal)"
    >
      {actions.map((action, i) => (
        <div key={action.label}>
          {action.separatorBefore && i > 0 && (
            <div className="my-1 h-px bg-(--border)" />
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              action.onSelect();
            }}
            className={
              'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-body transition-colors hover:bg-(--secondary) ' +
              (action.destructive ? 'text-(--destructive)' : 'text-(--foreground)')
            }
          >
            {action.icon}
            {action.label}
          </button>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------- page ---------------------------------- */

type ContextMenuState = { x: number; y: number; item: FileSystemItem };
type NameDialogState =
  | { mode: 'create'; parentId: number | null }
  | { mode: 'rename'; group: Group };

function fileMeta(item: FileSystemItem): PaperFileMetadata | null {
  if (item.kind !== 'file') return null;
  return (item.metadata as unknown as PaperFileMetadata) ?? null;
}

export default function GroupsFinder() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { confirm, dialogProps } = useConfirmDialog();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
  });

  const { data: ungroupedData } = useQuery({
    queryKey: ['papers', 'ungrouped'],
    queryFn: () =>
      papersApi.list(1, 100, undefined, {
        ungrouped: true,
        sort_by: 'date_added',
        sort_order: 'desc',
      }),
  });
  const ungroupedPapers = useMemo(() => ungroupedData?.papers ?? [], [ungroupedData]);

  const manifest = useMemo(
    () => buildManifest(groups, user?.id, ungroupedPapers),
    [groups, user?.id, ungroupedPapers],
  );
  const { items, index } = manifest;

  // The component owns navigation; we mirror it into ?path= for deep links.
  const initialPathRef = useRef(searchParams.get('path') ?? '');
  const [currentPath, setCurrentPath] = useState(initialPathRef.current);
  const handlePathChange = useCallback(
    (path: string) => {
      setCurrentPath(path);
      setSearchParams(path ? { path } : {}, { replace: true });
    },
    [setSearchParams]
  );

  const currentGroupId = groupIdFromPath(currentPath);
  const currentGroup = currentGroupId != null ? index.groups.get(currentGroupId) : undefined;
  const inSharedTree = isSharedPath(currentPath);

  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null);
  const [nameValue, setNameValue] = useState('');
  const [movePaperIds, setMovePaperIds] = useState<number[] | null>(null);
  const [shareGroup, setShareGroup] = useState<Group | null>(null);
  const [sharePaper, setSharePaper] = useState<{ id: number; title: string } | null>(null);
  const [chatGroup, setChatGroup] = useState<Group | null>(null);
  const [multiSelected, setMultiSelected] = useState<FileSystemFileItem[]>([]);
  const [quickLook, setQuickLook] = useState<{ title: string; url: string } | null>(null);
  const quickLookUrlRef = useRef<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['groups'] });
    // Membership changes move papers in/out of the ungrouped root set.
    queryClient.invalidateQueries({ queryKey: ['papers', 'ungrouped'] });
  };

  const createMutation = useMutation({
    mutationFn: ({ name, parentId }: { name: string; parentId: number | null }) =>
      groupsApi.create({ name, parent_id: parentId }),
    onSuccess: () => {
      invalidate();
      setNameDialog(null);
      toastSuccess('Folder created');
    },
    onError: () => toastError('Failed to create folder'),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => groupsApi.update(id, { name }),
    onSuccess: () => {
      invalidate();
      setNameDialog(null);
      toastSuccess('Folder renamed');
    },
    onError: () => toastError('Failed to rename folder'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => groupsApi.delete(id),
    onSuccess: () => {
      invalidate();
      toastSuccess('Folder deleted');
    },
    onError: () => toastError('Failed to delete folder'),
  });

  const moveMutation = useMutation({
    mutationFn: ({ paperIds, groupIds }: { paperIds: number[]; groupIds: number[] }) =>
      Promise.all(paperIds.map((pid) => groupsApi.updatePaperGroups(pid, groupIds))),
    onSuccess: () => {
      invalidate();
      setMovePaperIds(null);
      setMultiSelected([]);
      toastSuccess('Papers moved');
    },
    onError: () => toastError('Failed to move papers'),
  });

  /* ------------------------------- actions ------------------------------- */

  const openQuickLook = useCallback(async (file: FileSystemFileItem) => {
    if (!file.url) return;
    try {
      const blob = await fetchApi<Blob>(file.url, { method: 'GET', responseType: 'blob' });
      const url = URL.createObjectURL(blob);
      if (quickLookUrlRef.current) URL.revokeObjectURL(quickLookUrlRef.current);
      quickLookUrlRef.current = url;
      setQuickLook({ title: file.name ?? 'Preview', url });
    } catch {
      toastError('Failed to load PDF preview');
    }
  }, []);

  useEffect(
    () => () => {
      if (quickLookUrlRef.current) URL.revokeObjectURL(quickLookUrlRef.current);
    },
    []
  );

  const removeFromFolder = useCallback(
    async (paperId: number, groupId: number) => {
      const memberships = index.groupsByPaper.get(paperId) ?? [];
      const next = memberships.filter((id) => id !== groupId);
      try {
        await groupsApi.updatePaperGroups(paperId, next);
        invalidate();
        toastSuccess('Removed from folder');
      } catch {
        toastError('Failed to remove from folder');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index]
  );

  const exportPapers = useCallback(
    (paperIds: number[]) => {
      if (paperIds.length === 0) return;
      navigate('/export', {
        state: { paperIds, returnPath: currentPath ? `/groups?path=${encodeURIComponent(currentPath)}` : '/groups' },
      });
    },
    [navigate, currentPath]
  );

  const collectFolderPaperIds = useCallback(
    (groupId: number): number[] => {
      const ids = new Set<number>();
      const walk = (g: Group | undefined) => {
        if (!g) return;
        for (const p of g.papers ?? []) ids.add(p.id);
        for (const child of groups.filter((c) => c.parent_id === g.id)) walk(child);
      };
      walk(index.groups.get(groupId));
      return [...ids];
    },
    [groups, index]
  );

  const menuActions = useMemo((): MenuAction[] => {
    if (!menu) return [];
    const { item } = menu;

    if (item.kind === 'folder') {
      const groupId = groupIdFromPath(item.path);
      const group = groupId != null ? index.groups.get(groupId) : undefined;
      const readOnly = isSharedPath(item.path);
      if (!group) return [];

      const actions: MenuAction[] = [
        {
          label: 'Export papers',
          icon: <DownloadIcon size="sm" />,
          onSelect: () => exportPapers(collectFolderPaperIds(group.id)),
        },
        {
          label: 'Chat with folder',
          icon: <ChatIcon size="sm" />,
          onSelect: () => setChatGroup(group),
        },
      ];
      if (!readOnly) {
        actions.unshift(
          {
            label: 'New subfolder',
            icon: <FolderIcon size="sm" />,
            onSelect: () => {
              setNameValue('');
              setNameDialog({ mode: 'create', parentId: group.id });
            },
          },
          {
            label: 'Rename',
            icon: <EditIcon size="sm" />,
            onSelect: () => {
              setNameValue(group.name);
              setNameDialog({ mode: 'rename', group });
            },
          },
          {
            label: 'Share',
            icon: <ShareIcon size="sm" />,
            onSelect: () => setShareGroup(group),
          }
        );
        actions.push({
          label: 'Delete',
          icon: <TrashIcon size="sm" />,
          destructive: true,
          separatorBefore: true,
          onSelect: async () => {
            const ok = await confirm({
              title: 'Delete Folder',
              description: `Delete “${group.name}”? Papers will not be deleted.`,
              confirmLabel: 'Delete',
              destructive: true,
            });
            if (ok) deleteMutation.mutate(group.id);
          },
        });
      }
      return actions;
    }

    const meta = fileMeta(item);
    if (!meta) return [];
    const selectedIds = multiSelected.length
      ? [...new Set(multiSelected.map((f) => (f.metadata as unknown as PaperFileMetadata).paperId))]
      : [meta.paperId];
    const plural = selectedIds.length > 1;

    const actions: MenuAction[] = [
      {
        label: 'Open',
        icon: <FolderOpenIcon size="sm" />,
        onSelect: () => navigate(`/papers/${meta.paperId}`),
      },
      {
        label: 'Quick Look',
        icon: <EyeIcon size="sm" />,
        onSelect: () => void openQuickLook(item as FileSystemFileItem),
      },
      {
        label: plural ? `Move ${selectedIds.length} papers…` : 'Move to folder…',
        icon: <ArrowRightIcon size="sm" />,
        separatorBefore: true,
        onSelect: () => setMovePaperIds(selectedIds),
      },
      {
        label: plural ? `Export ${selectedIds.length} papers` : 'Export',
        icon: <DownloadIcon size="sm" />,
        onSelect: () => exportPapers(selectedIds),
      },
      ...(!plural
        ? [
            {
              label: 'Share paper',
              icon: <ShareIcon size="sm" />,
              onSelect: () => setSharePaper({ id: meta.paperId, title: String(meta.title ?? 'Paper') }),
            } as MenuAction,
          ]
        : []),
    ];
    if (meta.groupId != null && !isSharedPath(item.path)) {
      actions.push({
        label: 'Remove from this folder',
        icon: <CloseIcon size="sm" />,
        destructive: true,
        separatorBefore: true,
        onSelect: () => void removeFromFolder(meta.paperId, meta.groupId!),
      });
    }
    return actions;
  }, [
    menu,
    index,
    multiSelected,
    navigate,
    confirm,
    deleteMutation,
    exportPapers,
    collectFolderPaperIds,
    openQuickLook,
    removeFromFolder,
  ]);

  /* ------------------------------- toolbar ------------------------------- */

  const selectedPaperIds = useMemo(
    () => [...new Set(multiSelected.map((f) => (f.metadata as unknown as PaperFileMetadata).paperId))],
    [multiSelected]
  );

  // Labels collapse based on the Finder component's own width (named
  // @container/finder on the block root), not the viewport.
  const toolbarExtra = (
    <div className="flex shrink-0 items-center gap-1 whitespace-nowrap">
      {selectedPaperIds.length > 0 && (
        <>
          <span className="hidden px-1 text-caption text-(--muted-foreground) @[36rem]/finder:inline">
            {selectedPaperIds.length} selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            icon={<ArrowRightIcon size="sm" />}
            onClick={() => setMovePaperIds(selectedPaperIds)}
            aria-label={`Move ${selectedPaperIds.length} selected papers`}
            title="Move selected"
          >
            <span className="hidden @[30rem]/finder:inline">Move</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<DownloadIcon size="sm" />}
            onClick={() => exportPapers(selectedPaperIds)}
            aria-label={`Export ${selectedPaperIds.length} selected papers`}
            title="Export selected"
          >
            <span className="hidden @[30rem]/finder:inline">Export</span>
          </Button>
          <div className="mx-0.5 h-4 w-px bg-(--border)" />
        </>
      )}
      {!inSharedTree && (
        <Button
          variant="ghost"
          size="sm"
          icon={<FolderIcon size="sm" />}
          onClick={() => {
            setNameValue('');
            setNameDialog({ mode: 'create', parentId: currentGroupId });
          }}
          aria-label="New folder"
          title="New folder"
        >
          <span className="hidden @[44rem]/finder:inline">New Folder</span>
        </Button>
      )}
      {currentGroup && !inSharedTree && (
        <Button
          variant="ghost"
          size="sm"
          icon={<PlusIcon size="sm" />}
          onClick={() =>
            navigate('/ingest', { state: { preselectedGroupIds: [currentGroup.id] } })
          }
          aria-label="Add paper"
          title="Add paper"
        >
          <span className="hidden @[44rem]/finder:inline">Add Paper</span>
        </Button>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="max-w-content mx-auto px-6 py-8">
        <Skeleton className="mb-2 h-8 w-48" />
        <Skeleton className="mb-8 h-5 w-96" />
        <Skeleton className="h-[60vh] w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-content mx-auto flex h-full flex-col px-6 py-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1>Groups</h1>
          <p className="text-btn mt-1 text-(--muted-foreground)">
            Organize papers into folders. Right-click for actions; ⌘-click to select multiple.
          </p>
        </div>
      </div>

      <FileSystem
        items={items}
        title="Groups"
        defaultView="icons"
        defaultPath={initialPathRef.current}
        className="min-h-[60vh] flex-1"
        onPathChange={handlePathChange}
        onFileOpen={(file) => {
          const meta = fileMeta(file);
          if (meta) navigate(`/papers/${meta.paperId}`);
        }}
        onItemContextMenu={(item, event) =>
          setMenu({ x: event.clientX, y: event.clientY, item })
        }
        onMultiSelectionChange={setMultiSelected}
        toolbarExtra={toolbarExtra}
        renderInformationExtra={(item) => {
          const meta = fileMeta(item);
          const paper = meta ? index.papers.get(meta.paperId) : undefined;
          return paper ? <PaperInfoPanel paper={paper} /> : null;
        }}
        loadPreviewImageUrl={loadPaperThumbnail}
        renderFilePreview={(file) => (
          <PaperCoverPlaceholder theme={fileMeta(file)?.theme ?? 'olive'} />
        )}
      />

      {menu && (
        <FinderContextMenu
          x={menu.x}
          y={menu.y}
          actions={menuActions}
          onClose={() => setMenu(null)}
        />
      )}

      {/* Create / rename folder */}
      <Dialog
        open={nameDialog !== null}
        onClose={() => setNameDialog(null)}
        title={nameDialog?.mode === 'rename' ? 'Rename Folder' : 'New Folder'}
        size="sm"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const name = nameValue.trim();
            if (!name || !nameDialog) return;
            if (nameDialog.mode === 'rename') {
              renameMutation.mutate({ id: nameDialog.group.id, name });
            } else {
              createMutation.mutate({ name, parentId: nameDialog.parentId });
            }
          }}
        >
          <Input
            autoFocus
            value={nameValue}
            onChange={(event) => setNameValue(event.target.value)}
            placeholder="Folder name"
          />
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={() => setNameDialog(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!nameValue.trim() || createMutation.isPending || renameMutation.isPending}
            >
              {nameDialog?.mode === 'rename' ? 'Rename' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      <MovePapersDialog
        open={movePaperIds !== null}
        onClose={() => setMovePaperIds(null)}
        onMove={(groupIds) =>
          movePaperIds && moveMutation.mutate({ paperIds: movePaperIds, groupIds })
        }
        groups={groups.filter((g) => isOwn(g, user?.id))}
        paperCount={movePaperIds?.length ?? 0}
        initialGroupIds={
          movePaperIds?.length === 1 ? (index.groupsByPaper.get(movePaperIds[0]) ?? []) : []
        }
        isMoving={moveMutation.isPending}
      />

      {shareGroup && (
        <ShareDialog
          open
          onClose={() => setShareGroup(null)}
          resourceId={shareGroup.id}
          resourceType="group"
          resourceTitle={shareGroup.name}
        />
      )}

      {sharePaper && (
        <ShareDialog
          open
          onClose={() => setSharePaper(null)}
          resourceId={sharePaper.id}
          resourceType="paper"
          resourceTitle={sharePaper.title}
        />
      )}

      {chatGroup && (
        <GroupChatSidebar
          groupId={chatGroup.id}
          groupName={chatGroup.name}
          onClose={() => setChatGroup(null)}
        />
      )}

      {/* Quick Look */}
      <Dialog
        open={quickLook !== null}
        onClose={() => setQuickLook(null)}
        title={quickLook?.title ?? 'Preview'}
        size="xl"
      >
        {quickLook && (
          <div className="h-[70vh]">
            <Suspense fallback={null}>
              <QuickLookViewer
                file={quickLook.url}
                showUpload={false}
                documentOptions={{
                  cMapPacked: true,
                  cMapUrl: '/pdfjs/cmaps/',
                  standardFontDataUrl: '/pdfjs/standard_fonts/',
                }}
              />
            </Suspense>
          </div>
        )}
      </Dialog>

      <ConfirmDialog {...dialogProps} />
    </div>
  );
}

function isOwn(group: Group, userId: number | undefined): boolean {
  return !group.user_id || group.user_id === userId;
}
