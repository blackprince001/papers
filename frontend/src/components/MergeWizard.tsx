import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, X } from 'lucide-react';
import { Button } from './Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { duplicatesApi } from '@/lib/api/duplicates';
import type { MergeRequest, MergePreview } from '@/lib/api/duplicates';

interface MergeWizardProps {
  primaryPaperId: number;
  duplicatePaperId: number;
  onClose: () => void;
  onComplete: () => void;
}

export function MergeWizard({ primaryPaperId, duplicatePaperId, onClose, onComplete }: MergeWizardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'preview' | 'confirm' | 'processing' | 'complete'>('preview');
  const [error, setError] = useState<string | null>(null);

  const previewQuery = useQuery({
    queryKey: ['merge-preview', primaryPaperId, duplicatePaperId],
    queryFn: () => duplicatesApi.getMergePreview(primaryPaperId, duplicatePaperId),
  });

  const preview: MergePreview | null = previewQuery.data || null;

  // Handle query error
  if (previewQuery.error && !error) {
    setError(previewQuery.error instanceof Error ? previewQuery.error.message : 'Failed to load merge preview');
  }

  const mergeMutation = useMutation({
    mutationFn: (request: MergeRequest) => duplicatesApi.mergePapers(request),
    onSuccess: () => {
      setStep('complete');
      queryClient.invalidateQueries({ queryKey: ['papers'] });
      queryClient.invalidateQueries({ queryKey: ['paper', primaryPaperId] });
      setTimeout(() => {
        onComplete();
        navigate(`/papers/${primaryPaperId}`);
      }, 2000);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to merge papers');
      setStep('preview');
    },
  });

  const handleConfirm = () => {
    setStep('processing');
    mergeMutation.mutate({
      primary_paper_id: primaryPaperId,
      duplicate_paper_id: duplicatePaperId,
    });
  };

  if (step === 'complete') {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Complete</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <Check className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <p className="text-lg font-medium">Papers merged successfully!</p>
              <p className="text-sm text-gray-600 mt-2">Redirecting to merged paper...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (previewQuery.isLoading) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Preview</DialogTitle>
          </DialogHeader>
          <div className="text-center py-8">Loading preview...</div>
        </DialogContent>
      </Dialog>
    );
  }

  if (error || !preview) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Error</DialogTitle>
          </DialogHeader>
          <div className="text-red-600 py-4">{error || 'Failed to load preview'}</div>
          <Button onClick={onClose}>Close</Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Merge Papers</DialogTitle>
        </DialogHeader>

        {step === 'preview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold mb-2">Primary Paper (Keep)</h4>
                <p className="text-sm">{preview.primary_paper.title}</p>
                {preview.primary_paper.doi && (
                  <p className="text-xs text-gray-500 mt-1">DOI: {preview.primary_paper.doi}</p>
                )}
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold mb-2">Duplicate (Merge Into Primary)</h4>
                <p className="text-sm">{preview.duplicate_paper.title}</p>
                {preview.duplicate_paper.doi && (
                  <p className="text-xs text-gray-500 mt-1">DOI: {preview.duplicate_paper.doi}</p>
                )}
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-semibold mb-3">What will be merged:</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-blue-500" />
                  {preview.annotations_to_merge} annotation{preview.annotations_to_merge !== 1 ? 's' : ''} will be merged
                </li>
                <li className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-blue-500" />
                  {preview.tags_to_add} tag{preview.tags_to_add !== 1 ? 's' : ''} will be added
                </li>
                <li className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-blue-500" />
                  {preview.groups_to_add} group{preview.groups_to_add !== 1 ? 's' : ''} will be added
                </li>
                <li className="flex items-center gap-2 text-gray-500">
                  <X className="h-4 w-4" />
                  Duplicate paper will be marked as merged
                </li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={() => setStep('confirm')}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="font-semibold text-yellow-800 mb-2">⚠️ Warning</p>
              <p className="text-sm text-yellow-700">
                This action cannot be undone. The duplicate paper will be merged into the primary paper,
                and all its annotations, tags, and groups will be transferred.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setStep('preview')}>
                Back
              </Button>
              <Button onClick={handleConfirm} disabled={mergeMutation.isPending}>
                {mergeMutation.isPending ? 'Merging...' : 'Confirm Merge'}
              </Button>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="text-center py-8">
            <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p>Merging papers...</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

