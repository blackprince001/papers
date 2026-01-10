import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/Button';
import { FileUpload } from '@/components/FileUpload';
import { papersApi } from '@/lib/api/papers';
import { groupsApi } from '@/lib/api/groups';
import { toastSuccess, toastError, toastInfo } from '@/lib/utils/toast';

export default function IngestPaper() {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [activeTab, setActiveTab] = useState('url');
  const queryClient = useQueryClient();

  const { data: groups, isLoading: groupsLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
  });

  const ingestionMutation = useMutation({
    mutationFn: (data: { url: string; group_ids?: number[] }) => {
      const tempTitle = data.url.split('/').pop() || 'Paper';
      return papersApi.create({
        url: data.url,
        title: tempTitle,
        group_ids: data.group_ids && data.group_ids.length > 0 ? data.group_ids : undefined,
      });
    },
    onSuccess: (paper) => {
      setUrl('');
      setSelectedGroupIds([]);
      setUploadFiles([]);
      queryClient.invalidateQueries({ queryKey: ['papers'] });
      
      // Show toast notification
      if (paper.background_processing_message) {
        toastSuccess(paper.background_processing_message);
      } else {
        toastSuccess('Paper ingested successfully');
      }
      
      navigate('/');
    },
    onError: (error: Error) => {
      toastError(error.message || 'Failed to ingest paper');
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (data: { files: File[]; group_ids?: number[] }) => {
      return papersApi.uploadFiles(
        data.files,
        data.group_ids && data.group_ids.length > 0 ? data.group_ids : undefined
      );
    },
    onSuccess: (response) => {
      setUrl('');
      setSelectedGroupIds([]);
      setUploadFiles([]);
      queryClient.invalidateQueries({ queryKey: ['papers'] });
      
      // Show toast notifications
      if (response.errors && response.errors.length > 0) {
        // Show errors
        response.errors.forEach((error) => {
          toastError(`${error.filename}: ${error.error}`);
        });
      }
      
      // Show success/processing message
      if (response.paper_ids && response.paper_ids.length > 0) {
        if (response.message) {
          toastInfo(response.message);
        } else if (response.paper_ids.length === 1) {
          toastSuccess('Paper uploaded successfully');
        } else {
          toastSuccess(`${response.paper_ids.length} papers uploaded successfully`);
        }
      } else if (!response.errors || response.errors.length === 0) {
        toastError('No papers were uploaded');
      }
      
      navigate('/');
    },
    onError: (error: Error) => {
      toastError(error.message || 'Failed to upload files');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === 'url' && url.trim()) {
      ingestionMutation.mutate({
        url: url.trim(),
        group_ids: selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
      });
    } else if (activeTab === 'upload' && uploadFiles.length > 0) {
      uploadMutation.mutate({
        files: uploadFiles,
        group_ids: selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
      });
    }
  };

  const handleGroupToggle = (groupId: number) => {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    );
  };

  const handleSelectAll = () => {
    if (groups) {
      setSelectedGroupIds(groups.map((g) => g.id));
    }
  };

  const handleDeselectAll = () => {
    setSelectedGroupIds([]);
  };

  const isUrlValid = url.trim().length > 0 && (url.startsWith('http://') || url.startsWith('https://'));
  const isUploadValid = uploadFiles.length > 0;
  const isProcessing = ingestionMutation.isPending || uploadMutation.isPending;
  const hasError = ingestionMutation.isError || uploadMutation.isError;
  const errorMessage = ingestionMutation.error instanceof Error
    ? ingestionMutation.error.message
    : uploadMutation.error instanceof Error
    ? uploadMutation.error.message
    : 'Failed to process papers. Please try again.';

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Ingest Paper</h1>
        <p className="text-gray-600">
          Upload PDF files or provide a URL to ingest papers. The title and DOI will be automatically extracted.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="url">From URL</TabsTrigger>
            <TabsTrigger value="upload">Upload Files</TabsTrigger>
          </TabsList>

          <TabsContent value="url" className="mt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="url" className="block text-sm font-medium text-gray-900 mb-2">
                  Paper URL <span className="text-red-500">*</span>
                </label>
                <input
                  id="url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://arxiv.org/pdf/..."
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-corca-blue-medium focus:border-transparent"
                  disabled={isProcessing}
                />
              </div>
            </form>
          </TabsContent>

          <TabsContent value="upload" className="mt-4">
            <FileUpload
              files={uploadFiles}
              onFilesChange={setUploadFiles}
              uploading={uploadMutation.isPending}
              uploadProgress={uploadMutation.isPending ? 50 : 0}
              onCancel={() => {
                setUploadFiles([]);
                uploadMutation.reset();
              }}
            />
          </TabsContent>
        </Tabs>

        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-900">
              Groups (optional)
            </label>
            {groups && groups.length > 0 && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-xs text-gray-700 hover:text-gray-900"
                  disabled={isProcessing}
                >
                  Select All
                </button>
                <span className="text-gray-400">|</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="text-xs text-gray-700 hover:text-gray-900"
                  disabled={isProcessing}
                >
                  Deselect All
                </button>
              </div>
            )}
          </div>

          {groupsLoading ? (
            <div className="text-sm text-gray-600 py-2">Loading groups...</div>
          ) : groups && groups.length > 0 ? (
            <div className="border border-gray-200 rounded-md p-3 max-h-48 overflow-y-auto bg-gray-50">
              <div className="space-y-2">
                {groups.map((group) => (
                  <label
                    key={group.id}
                    className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 p-2 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={selectedGroupIds.includes(group.id)}
                      onChange={() => handleGroupToggle(group.id)}
                      disabled={isProcessing}
                      className="w-4 h-4 text-gray-700 border-gray-300 rounded focus:ring-corca-blue-medium"
                    />
                    <span className="text-sm text-gray-900">{group.name}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-600 py-2">
              No groups available. Create groups from the Groups page.
            </div>
          )}
        </div>

        {hasError && (
          <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
            {errorMessage}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/')}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={
              (activeTab === 'url' && !isUrlValid) ||
              (activeTab === 'upload' && !isUploadValid) ||
              isProcessing
            }
          >
            {isProcessing
              ? activeTab === 'url'
                ? 'Ingesting...'
                : 'Uploading...'
              : activeTab === 'url'
              ? 'Ingest Paper'
              : 'Upload Files'}
          </Button>
        </div>
      </div>
    </div>
  );
}

