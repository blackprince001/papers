import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import type { DuplicateMatch } from '@/lib/api/duplicates';

interface DuplicateWarningProps {
  duplicates: DuplicateMatch[];
  onCancel: () => void;
  onProceed: () => void;
  onMerge: (duplicate: DuplicateMatch) => void;
}

export function DuplicateWarning({ duplicates, onCancel, onProceed, onMerge }: DuplicateWarningProps) {
  if (duplicates.length === 0) {
    return null;
  }

  return (
    <Dialog open={true} onOpenChange={() => onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Potential Duplicates Found
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            We found {duplicates.length} potential duplicate{duplicates.length !== 1 ? 's' : ''} of this paper:
          </p>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {duplicates.map((dup) => (
              <div
                key={dup.paper.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-100"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium">{dup.paper.title}</h4>
                    {dup.paper.doi && (
                      <p className="text-xs text-gray-500 mt-1">DOI: {dup.paper.doi}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                        {dup.detection_method} ({(dup.confidence_score * 100).toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onMerge(dup)}
                  >
                    Merge
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="ghost" onClick={onProceed}>
              Add Anyway
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

