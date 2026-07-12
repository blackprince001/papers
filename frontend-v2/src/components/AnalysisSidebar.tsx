import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { PaperDetails } from './PaperDetails';
import { AISummary } from './AISummary';
import { KeyFindings } from './KeyFindings';
import { ReadingGuide } from './ReadingGuide';
import { PaperAnnotationsPanel } from './PaperAnnotationsPanel';
import { RelatedPapers } from './RelatedPapers';
import { type Paper } from '@/lib/api/papers';
import { type Annotation } from '@/lib/api/annotations';
import { FileTextIcon, HighlighterIcon, LinkIcon, SparklesIcon } from '@/components/icons';
// import { cn } from '@/lib/utils';

interface AnalysisSidebarProps {
  paper: Paper;
  annotations: Annotation[];
  annotationsLoading: boolean;
  currentPage: number;
  filterByPage: boolean;
  onFilterByPageChange: (value: boolean) => void;
  onAnnotationClick: (annotation: Annotation) => void;
  onEditAnnotation: (annotation: Annotation) => void;
  onDeleteAnnotation: (id: number) => void;
  onDeletePaper: () => void;
}

export function AnalysisSidebar({
  paper,
  annotations,
  annotationsLoading,
  currentPage,
  filterByPage,
  onFilterByPageChange,
  onAnnotationClick,
  onEditAnnotation,
  onDeleteAnnotation,
  onDeletePaper
}: AnalysisSidebarProps) {
  const [activeTab, setActiveTab] = useState('details');

  return (
    <div className="flex flex-col h-full bg-(--white) border-l border-(--border) overflow-hidden shadow-sm">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        <TabsList className="px-4 gap-2 border-b border-(--border) bg-(--white) shrink-0">
          <TabsTrigger value="details" className="h-12 gap-2 border-b-2 rounded-none">
            <FileTextIcon size="sm" />
            <span className="hidden lg:inline">Details</span>
          </TabsTrigger>
          <TabsTrigger value="ai" className="h-12 gap-2 border-b-2 rounded-none">
            <SparklesIcon size="sm" />
            <span className="hidden lg:inline">AI Analytics</span>
          </TabsTrigger>
          <TabsTrigger value="annotations" className="h-12 gap-2 border-b-2 rounded-none">
            <HighlighterIcon size="sm" />
            <span className="hidden lg:inline">Notes</span>
            {annotations.length > 0 && (
              <span className="text-micro bg-(--muted) px-1.5 py-0.5 rounded-full">
                {annotations.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="related" className="h-12 gap-2 border-b-2 rounded-none">
            <LinkIcon size="sm" />
            <span className="hidden lg:inline">Related</span>
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-hidden relative">
          <TabsContent value="details" className="h-full overflow-y-auto scrollbar-none">
            <PaperDetails paper={paper} onDelete={onDeletePaper} />
          </TabsContent>

          <TabsContent value="ai" className="h-full overflow-y-auto scrollbar-none p-6 text-(--foreground)">
            <div className="space-y-8">
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-body font-bold">Executive Summary</h3>
                </div>
                <AISummary paperId={paper.id} />
              </section>
              
              <div className="h-px bg-(--border)" />
              
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-body font-bold">Core Insights</h3>
                </div>
                <KeyFindings paperId={paper.id} />
              </section>

              <div className="h-px bg-(--border)" />

              <section>
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-body font-bold">Reading Guide</h3>
                </div>
                <ReadingGuide paperId={paper.id} />
              </section>
            </div>
          </TabsContent>

          <TabsContent value="annotations" className="h-full overflow-y-auto scrollbar-none p-6">
            <PaperAnnotationsPanel 
              annotations={annotations}
              isLoading={annotationsLoading}
              currentPage={currentPage}
              filterByPage={filterByPage}
              onFilterByPageChange={onFilterByPageChange}
              onAnnotationClick={onAnnotationClick}
              onEditAnnotation={onEditAnnotation}
              onDeleteAnnotation={onDeleteAnnotation}
            />
          </TabsContent>

          <TabsContent value="related" className="h-full overflow-y-auto scrollbar-none p-6">
            <RelatedPapers paperId={paper.id} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
