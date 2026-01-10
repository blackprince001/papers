import { X } from 'lucide-react';
import { Button } from './Button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NotesPanel } from '@/components/NotesPanel';
import { CitationsList, SimilarList } from '@/components/RelatedPapers';
import { PaperDetailsPanel } from '@/components/PaperDetailsPanel';
import { PaperAnnotationsPanel } from '@/components/PaperAnnotationsPanel';
import { AISummary } from '@/components/AISummary';
import { KeyFindings } from '@/components/KeyFindings';
import { ReadingGuide } from '@/components/ReadingGuide';
import { AutoHighlights } from '@/components/AutoHighlights';
import type { Annotation } from '@/lib/api/annotations';
import type { Paper } from '@/lib/api/papers';
import type { UseMutationResult } from '@tanstack/react-query';

interface PaperSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  paperId: number;
  paper: Paper | null;
  annotations: Annotation[];
  annotationsLoading: boolean;
  related: any;
  relatedLoading: boolean;
  relatedError: Error | null;
  currentPage: number;
  filterByPage: boolean;
  onFilterByPageChange: (value: boolean) => void;
  editingAnnotation: Annotation | null;
  onEditAnnotation: (annotation: Annotation) => void;
  onDeleteAnnotation: (annotationId: number) => void;
  onAnnotationClick: (annotation: Annotation) => void;
  deleteAnnotationMutation: UseMutationResult<any, Error, number, unknown>;
  updatePaperTagsMutation: UseMutationResult<any, Error, number[], unknown>;
  regenerateMetadataMutation: UseMutationResult<any, Error, void, unknown>;
  extractCitationsMutation: UseMutationResult<any, Error, void, unknown>;
  getAnnotationPage: (annotation: Annotation) => number | null;
  onDelete?: () => void;
  isDeleting?: boolean;
  updatePaperTitleMutation?: UseMutationResult<any, Error, string, unknown>;
  onTitleUpdate?: (title: string) => void;
}

export function PaperSidebar({
  isOpen,
  onClose,
  paperId,
  paper,
  annotations,
  annotationsLoading,
  related,
  relatedLoading,
  relatedError,
  currentPage,
  filterByPage,
  onFilterByPageChange,
  editingAnnotation,
  onEditAnnotation,
  onDeleteAnnotation,
  onAnnotationClick,
  deleteAnnotationMutation,
  updatePaperTagsMutation,
  regenerateMetadataMutation,
  extractCitationsMutation,
  getAnnotationPage,
  onDelete,
  isDeleting,
  updatePaperTitleMutation,
  onTitleUpdate,
}: PaperSidebarProps) {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-y-0 right-0 z-50 bg-white border-l border-anara-light-border shadow-lg flex flex-col" 
      style={{ width: '36rem' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-end px-4 py-3 border-b border-anara-light-border flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 w-8 p-0"
          title="Close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <Tabs defaultValue="annotations" className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <TabsList className="flex-shrink-0 bg-white border-b border-anara-light-border px-4 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent justify-start">
          <TabsTrigger value="annotations" className="data-[state=active]:bg-gray-100 data-[state=active]:text-anara-light-text data-[state=active]:after:bg-gray-100 text-anara-light-text-muted whitespace-nowrap">
            Annotations ({annotations?.filter((ann) => ann.type !== 'note').length || 0})
          </TabsTrigger>
          <TabsTrigger value="citations" className="data-[state=active]:bg-gray-100 data-[state=active]:text-anara-light-text data-[state=active]:after:bg-gray-100 text-anara-light-text-muted whitespace-nowrap">
            Citations
          </TabsTrigger>
          <TabsTrigger value="similar" className="data-[state=active]:bg-gray-100 data-[state=active]:text-anara-light-text data-[state=active]:after:bg-gray-100 text-anara-light-text-muted whitespace-nowrap">
            Similar
          </TabsTrigger>
          <TabsTrigger value="notes" className="data-[state=active]:bg-gray-100 data-[state=active]:text-anara-light-text data-[state=active]:after:bg-gray-100 text-anara-light-text-muted whitespace-nowrap">
            Notes ({annotations?.filter((ann) => ann.type === 'note').length || 0})
          </TabsTrigger>
          <TabsTrigger value="details" className="data-[state=active]:bg-gray-100 data-[state=active]:text-anara-light-text data-[state=active]:after:bg-gray-100 text-anara-light-text-muted whitespace-nowrap">
            Details
          </TabsTrigger>
          <TabsTrigger value="ai" className="data-[state=active]:bg-gray-100 data-[state=active]:text-anara-light-text data-[state=active]:after:bg-gray-100 text-anara-light-text-muted whitespace-nowrap">
            AI Features
          </TabsTrigger>
        </TabsList>

        {/* Notes Tab */}
        <TabsContent value="notes" className="flex-1 min-h-0 overflow-auto px-4 py-2">
          <NotesPanel
            paperId={paperId}
            currentPage={currentPage}
            annotations={annotations || []}
            isLoading={annotationsLoading}
          />
        </TabsContent>

        {/* AI Features Tab */}
        <TabsContent value="ai" className="flex-1 min-h-0 overflow-auto px-6 py-4">
          <Tabs defaultValue="summary" className="space-y-4">
            <TabsList>
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="findings">Key Findings</TabsTrigger>
              <TabsTrigger value="guide">Reading Guide</TabsTrigger>
              <TabsTrigger value="highlights">Auto-Highlights</TabsTrigger>
            </TabsList>
            <TabsContent value="summary">
              <AISummary paperId={paperId} />
            </TabsContent>
            <TabsContent value="findings">
              <KeyFindings paperId={paperId} />
            </TabsContent>
            <TabsContent value="guide">
              <ReadingGuide paperId={paperId} />
            </TabsContent>
            <TabsContent value="highlights">
              <AutoHighlights paperId={paperId} />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* Details Tab */}
        <TabsContent value="details" className="flex-1 min-h-0 overflow-auto px-6 py-4">
          {paper && (
            <PaperDetailsPanel
              paper={paper}
              paperId={paperId}
              updatePaperTagsMutation={updatePaperTagsMutation}
              regenerateMetadataMutation={regenerateMetadataMutation}
              extractCitationsMutation={extractCitationsMutation}
              onDelete={onDelete}
              isDeleting={isDeleting}
              updatePaperTitleMutation={updatePaperTitleMutation}
              onTitleUpdate={onTitleUpdate}
            />
          )}
        </TabsContent>

        {/* Citations Tab */}
        <TabsContent value="citations" className="flex-1 min-h-0 overflow-auto px-6 py-4">
          <CitationsList
            related={related}
            isLoading={relatedLoading}
            error={relatedError}
          />
        </TabsContent>

        {/* Similar Tab */}
        <TabsContent value="similar" className="flex-1 min-h-0 overflow-auto px-6 py-4">
          <SimilarList
            related={related}
            isLoading={relatedLoading}
            error={relatedError}
          />
        </TabsContent>

        {/* Annotations Tab */}
        <TabsContent value="annotations" className="flex-1 overflow-auto px-6 py-4">
          <PaperAnnotationsPanel
            paperId={paperId}
            annotations={annotations || []}
            annotationsLoading={annotationsLoading}
            currentPage={currentPage}
            filterByPage={filterByPage}
            onFilterByPageChange={onFilterByPageChange}
            editingAnnotation={editingAnnotation}
            onEditAnnotation={onEditAnnotation}
            onDeleteAnnotation={onDeleteAnnotation}
            onAnnotationClick={onAnnotationClick}
            deleteAnnotationMutation={deleteAnnotationMutation}
            getAnnotationPage={getAnnotationPage}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}




