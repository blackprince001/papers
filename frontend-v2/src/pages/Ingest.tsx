import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  UploadIcon,
} from '@/components/icons';
import { papersApi } from '@/lib/api/papers';
import { groupsApi } from '@/lib/api/groups';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { Dialog } from '@/components/ui/Dialog';
import { GroupTreeSelector } from '@/components/GroupTreeSelector';
import { UploadHero, type FileUploadState } from '@/components/ingest/UploadHero';
import { UrlChipsInput } from '@/components/ingest/UrlChipsInput';
import { toastSuccess, toastError, toastInfo } from '@/lib/utils/toast';

const MAX_FILES = 5;
const MAX_FILE_SIZE = 50 * 1024 * 1024;

interface IngestRouteState {
  preselectedGroupIds?: number[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Ingest() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [files, setFiles] = useState<File[]>([]);
  const [urlChips, setUrlChips] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [groupSearch, setGroupSearch] = useState('');
  const [groupsExpanded, setGroupsExpanded] = useState(false);

  // Upload progress (bytes)
  const [uploadProgress, setUploadProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [isProcessingServer, setIsProcessingServer] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const { data: groups } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
  });

  // Seed selected groups from route state (e.g. from the Finder's "Add Paper")
  useEffect(() => {
    const state = location.state as IngestRouteState | null;
    if (state?.preselectedGroupIds?.length) {
      setSelectedGroupIds(state.preselectedGroupIds);
      setGroupsExpanded(true);
      // Clear state so a refresh / re-navigation doesn't keep re-applying.
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadMutation = useMutation({
    mutationFn: (data: { files: File[]; group_ids?: number[] }) =>
      papersApi.uploadFilesWithProgress(data.files, data.group_ids, (loaded, total) => {
        setUploadProgress({ loaded, total });
        if (loaded >= total) setIsProcessingServer(true);
      }),
    onMutate: () => {
      setUploadProgress({ loaded: 0, total: 1 });
      setIsProcessingServer(false);
    },
    onSettled: () => {
      setUploadProgress(null);
      setIsProcessingServer(false);
    },
  });

  const batchMutation = useMutation({
    mutationFn: (data: { urls: string[]; group_ids?: number[] }) =>
      papersApi.ingestBatch(data.urls, data.group_ids),
  });

  const isProcessing = uploadMutation.isPending || batchMutation.isPending;

  const handleSubmit = async () => {
    const groupIds = selectedGroupIds.length > 0 ? selectedGroupIds : undefined;
    let anySuccess = false;

    if (files.length > 0) {
      try {
        const response = await uploadMutation.mutateAsync({ files, group_ids: groupIds });
        if (response.paper_ids.length > 0) {
          anySuccess = true;
          toastInfo(response.message || `${response.paper_ids.length} file(s) uploaded successfully`);
        }
        response.errors.forEach((e) => toastError(`${e.filename}: ${e.error}`));
        setFiles([]);
      } catch (error) {
        toastError(`Upload failed: ${(error as Error).message}`);
        return;
      }
    }

    if (urlChips.length > 0) {
      try {
        const response = await batchMutation.mutateAsync({ urls: urlChips, group_ids: groupIds });
        if (response.paper_ids.length > 0) {
          anySuccess = true;
          toastSuccess(`${response.paper_ids.length} paper(s) imported successfully`);
        }
        response.errors.forEach((e) => toastError(`${e.url}: ${e.error}`));
        setUrlChips([]);
      } catch (error) {
        toastError(`Import failed: ${(error as Error).message}`);
        return;
      }
    }

    if (anySuccess) {
      queryClient.invalidateQueries({ queryKey: ['papers'] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setSelectedGroupIds([]);
      navigate('/');
    }
  };

  const handleFilesAdded = (incoming: File[]) => {
    const valid = incoming.filter((f) => {
      if (f.size > MAX_FILE_SIZE) {
        toastError(`${f.name} exceeds 50MB`);
        return false;
      }
      return true;
    });
    setFiles((prev) => {
      const combined = [...prev, ...valid];
      if (combined.length > MAX_FILES) {
        toastError(`Maximum ${MAX_FILES} files at a time`);
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
  };

  // Aggregate upload metrics (only meaningful during uploadMutation)
  const totalSize = files.reduce((acc, f) => acc + f.size, 0);
  const aggregatePct = uploadProgress
    ? Math.min(100, Math.round((uploadProgress.loaded / uploadProgress.total) * 100))
    : 0;

  // Per-file progress is derived: distribute global loaded bytes across files in order.
  // (Whole multipart body uploads as one stream — this is a best-effort visualisation.)
  function fileProgressPct(index: number): number {
    if (!uploadProgress || totalSize === 0) return 0;
    if (isProcessingServer) return 100;
    const fileStart = files.slice(0, index).reduce((a, f) => a + f.size, 0);
    const fileSize = files[index].size;
    const scaledLoaded = Math.min(totalSize, (uploadProgress.loaded / uploadProgress.total) * totalSize);
    const localLoaded = Math.max(0, Math.min(fileSize, scaledLoaded - fileStart));
    return Math.round((localLoaded / fileSize) * 100);
  }

  function fileState(index: number): FileUploadState {
    if (!uploadMutation.isPending) return 'pending';
    if (isProcessingServer) return 'processing';
    const pct = fileProgressPct(index);
    if (pct >= 100) return 'done';
    if (pct > 0) return 'uploading';
    return 'pending';
  }

  const itemCount = files.length + urlChips.length;

  const handlePreview = (file: File) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = URL.createObjectURL(file);
    setPreviewFile(file);
  };

  return (
    <div className="max-w-main mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-page-title mb-1">Add Paper</h1>
        <p className="text-body text-(--muted-foreground)">
          Drop PDFs or paste links — arXiv, ACM, IEEE, OpenReview, PMLR, NeurIPS, Semantic Scholar
        </p>
      </div>

      <div className="space-y-6">
        {/* Groups Selection */}
        {groups && groups.length > 0 && (
          <div className="bg-(--card) border border-(--border) rounded-xl">
            <button
              type="button"
              onClick={() => setGroupsExpanded((v) => !v)}
              className="w-full flex items-center justify-between px-6 py-4 text-left"
              aria-expanded={groupsExpanded}
            >
              <div className="flex items-center gap-2">
                <h4 className="text-caption font-medium text-(--muted-foreground) uppercase tracking-wider">
                  Add to Groups (Optional)
                </h4>
                {selectedGroupIds.length > 0 && (
                  <Badge variant="secondary" className="text-micro h-5">
                    {selectedGroupIds.length} selected
                  </Badge>
                )}
              </div>
              {groupsExpanded ? (
                <ChevronDownIcon size="sm" className="text-(--muted-foreground)" />
              ) : (
                <ChevronRightIcon size="sm" className="text-(--muted-foreground)" />
              )}
            </button>
            {groupsExpanded && (
              <div className="px-6 pb-6">
                <GroupTreeSelector
                  groups={groups}
                  selectedIds={selectedGroupIds}
                  onChange={setSelectedGroupIds}
                  search={groupSearch}
                  onSearchChange={setGroupSearch}
                  heightClass="h-48"
                />
              </div>
            )}
          </div>
        )}

        {/* Upload hero + smart link input */}
        <div className="bg-(--card) border border-(--border) rounded-xl p-6 space-y-4">
          <UploadHero
            files={files}
            onFilesAdded={handleFilesAdded}
            onRemove={(index) => setFiles((prev) => prev.filter((_, i) => i !== index))}
            onClear={() => setFiles([])}
            disabled={isProcessing}
            isUploading={uploadMutation.isPending}
            fileProgressPct={fileProgressPct}
            fileState={fileState}
            maxFiles={MAX_FILES}
            onPreview={handlePreview}
          />

          {uploadMutation.isPending && uploadProgress && (
            <div className="space-y-1.5 p-3 rounded-lg bg-(--muted) border border-(--border)">
              <div className="flex items-center justify-between text-caption">
                <span className="font-medium text-(--foreground)">
                  {isProcessingServer
                    ? 'Processing on server…'
                    : `Uploading ${formatBytes(uploadProgress.loaded)} / ${formatBytes(uploadProgress.total)}`}
                </span>
                <span className="text-(--muted-foreground)">
                  {isProcessingServer ? '' : `${aggregatePct}%`}
                </span>
              </div>
              <Progress
                value={isProcessingServer ? 100 : aggregatePct}
                fillClassName={isProcessingServer ? 'animate-pulse' : undefined}
              />
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-(--border)" />
            <span className="text-micro uppercase tracking-wider text-(--muted-foreground)">
              or paste links
            </span>
            <div className="h-px flex-1 bg-(--border)" />
          </div>

          <UrlChipsInput chips={urlChips} onChange={setUrlChips} disabled={isProcessing} />

          {batchMutation.isPending && (
            <div className="space-y-1.5">
              <Progress value={100} fillClassName="animate-pulse" />
              <p className="text-caption text-(--muted-foreground)">Processing links…</p>
            </div>
          )}
        </div>

        <Button
          variant="primary"
          icon={<UploadIcon size="sm" />}
          onClick={handleSubmit}
          disabled={itemCount === 0}
          loading={isProcessing}
        >
          {itemCount > 0
            ? `Import ${itemCount} ${itemCount === 1 ? 'paper' : 'papers'}`
            : 'Import Papers'}
        </Button>
      </div>

      {/* PDF Preview Dialog */}
      <Dialog
        open={previewFile !== null}
        onClose={() => {
          setPreviewFile(null);
          if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current);
            previewUrlRef.current = null;
          }
        }}
        title={previewFile?.name ?? 'Preview'}
        size="xl"
      >
        {previewFile && previewUrlRef.current && (
          <div className="h-[70vh]">
            <object
              data={previewUrlRef.current}
              type="application/pdf"
              className="size-full rounded-lg"
            >
              <p className="text-code text-(--muted-foreground) p-4">
                PDF preview not available. <a href={previewUrlRef.current} download className="underline">Download file</a>
              </p>
            </object>
          </div>
        )}
      </Dialog>
    </div>
  );
}
