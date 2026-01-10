import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTabs } from '@/contexts/TabContext';
import { papersApi } from '@/lib/api/papers';
import { annotationsApi, type Annotation } from '@/lib/api/annotations';
import { PDFViewer } from '@/components/PDFViewer';
import { Button } from '@/components/Button';
import { useConfirmDialog } from '@/components/ConfirmDialog';
import { useReadingSession } from '@/hooks/use-reading-session';
import { toastSuccess, toastError } from '@/lib/utils/toast';

export default function PaperDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const paperId = parseInt(id || '0');
  const queryClient = useQueryClient();
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const { tabs, addTab, updateTab, activeTabId, setActiveTab, removeTab } = useTabs();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { data: paper, isLoading: paperLoading, error: paperError } = useQuery({
    queryKey: ['paper', paperId],
    queryFn: () => papersApi.get(paperId),
    enabled: !!paperId,
  });

  // Determine if reading is active:
  // - Tab is active (this paper's tab is the active one)
  // - Paper is loaded and valid
  // - PDF URL exists (we're actually viewing a PDF)
  const isReadingActive = useMemo(() => {
    if (!paper || !paperId || !paper.file_path) return false;

    const currentTab = tabs.find(tab => tab.paperId === paperId);
    if (!currentTab) return false;

    return currentTab.id === activeTabId;
  }, [paper, paperId, tabs, activeTabId]);

  // Track reading session
  useReadingSession(paperId, isReadingActive, currentPage);

  // Track previous paperId to detect paper switches
  const prevPaperIdRef = useRef<number | null>(null);
  // Track last saved page to avoid unnecessary updates
  const lastSavedPageRef = useRef<number | null>(null);
  // Ref for debouncing tab updates
  const tabUpdateTimeoutRef = useRef<number | null>(null);
  // Track if tab was intentionally removed for this paper (to prevent auto-recreation)
  const removedTabPaperIdRef = useRef<number | null>(null);

  // Memoize onPageChange callback to prevent PDFViewer re-renders
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  // Add paper to tabs ONLY when paperId changes (user navigates to this paper)
  // This prevents tabs from being recreated when tabs array changes due to removals
  useEffect(() => {
    if (paper && paperId)
    {
      const paperIdChanged = prevPaperIdRef.current !== paperId;

      // Find existing tab for this paper
      const existingTab = tabs.find(tab => tab.paperId === paperId);

      if (existingTab)
      {
        // Tab exists - just ensure it's active and restore page if needed
        if (paperIdChanged && existingTab.currentPage && existingTab.currentPage > 0)
        {
          // Restore page when switching papers
          setCurrentPage(existingTab.currentPage);
          lastSavedPageRef.current = existingTab.currentPage;
        }

        // Ensure this tab is active if we're viewing this paper
        if (existingTab.id !== activeTabId)
        {
          setActiveTab(existingTab.id);
        }

        // Clear removal flag since tab exists
        if (removedTabPaperIdRef.current === paperId)
        {
          removedTabPaperIdRef.current = null;
        }
      } else if (paperIdChanged)
      {
        // Only add tab when paperId actually changes (user navigated to this paper)
        // AND the tab wasn't just removed for this paper
        if (removedTabPaperIdRef.current !== paperId)
        {
          // Add new tab for this paper
          addTab(paperId, paper.title, `/papers/${paperId}`);
        }
      }

      prevPaperIdRef.current = paperId;
    }
  }, [paper, paperId, addTab, activeTabId, setActiveTab, tabs]);

  // Watch for tab removals to track which paper's tab was removed
  useEffect(() => {
    // This effect only tracks removals, it doesn't add tabs
    // Check if a tab for this paper was removed
    if (paperId && location.pathname === `/papers/${paperId}`)
    {
      const currentTab = tabs.find(tab => tab.paperId === paperId);
      if (!currentTab && prevPaperIdRef.current === paperId)
      {
        // Tab was removed for the current paper - mark it
        removedTabPaperIdRef.current = paperId;
      }
    }
  }, [tabs, paperId, location.pathname]);

  // Debounced tab update when current page changes (only for active tab of current paper)
  useEffect(() => {
    if (paper && activeTabId)
    {
      const activeTab = tabs.find(tab => tab.id === activeTabId);
      // Only update if this tab belongs to current paper
      if (activeTab && activeTab.paperId === paperId)
      {
        // Only update if page actually changed
        if (currentPage !== lastSavedPageRef.current)
        {
          // Clear any pending updates
          if (tabUpdateTimeoutRef.current)
          {
            clearTimeout(tabUpdateTimeoutRef.current);
          }
          // Debounce the update
          tabUpdateTimeoutRef.current = setTimeout(() => {
            updateTab(activeTabId, { currentPage, url: `/papers/${paperId}` });
            lastSavedPageRef.current = currentPage;
          }, 300); // 300ms debounce
        }
      }
    }
    return () => {
      if (tabUpdateTimeoutRef.current)
      {
        clearTimeout(tabUpdateTimeoutRef.current);
      }
    };
  }, [currentPage, paper, activeTabId, updateTab, paperId, tabs]);

  const { data: annotations, isLoading: annotationsLoading } = useQuery({
    queryKey: ['annotations', paperId],
    queryFn: () => annotationsApi.list(paperId),
    enabled: !!paperId,
  });

  const { data: related, isLoading: relatedLoading, error: relatedError } = useQuery({
    queryKey: ['related-papers', paperId],
    queryFn: () => papersApi.getRelated(paperId),
    enabled: !!paperId,
  });


  const deleteAnnotationMutation = useMutation({
    mutationFn: (annotationId: number) => annotationsApi.delete(annotationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['annotations', paperId] });
    },
  });

  const updatePaperTagsMutation = useMutation({
    mutationFn: (tagIds: number[]) => papersApi.update(paperId, { tag_ids: tagIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
    },
  });

  const regenerateMetadataMutation = useMutation({
    mutationFn: () => papersApi.regenerateMetadata(paperId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
    },
  });

  const extractCitationsMutation = useMutation({
    mutationFn: () => papersApi.extractCitations(paperId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
      queryClient.invalidateQueries({ queryKey: ['citation-graph', paperId] });
      queryClient.invalidateQueries({ queryKey: ['citations-list', paperId] });
    },
  });

  const updateReadingStatusMutation = useMutation({
    mutationFn: (status: 'not_started' | 'in_progress' | 'read' | 'archived') =>
      papersApi.updateReadingStatus(paperId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
      queryClient.invalidateQueries({ queryKey: ['statistics'] });
    },
  });

  const updatePriorityMutation = useMutation({
    mutationFn: (priority: 'low' | 'medium' | 'high' | 'critical') =>
      papersApi.updatePriority(paperId, priority),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
      queryClient.invalidateQueries({ queryKey: ['statistics'] });
    },
  });

  const updatePaperTitleMutation = useMutation({
    mutationFn: (title: string) => papersApi.update(paperId, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
      queryClient.invalidateQueries({ queryKey: ['papers'] });
      toastSuccess('Title updated successfully');
    },
    onError: (error: Error) => {
      toastError(`Failed to update title: ${error.message}`);
    },
  });

  const handleTitleUpdate = (newTitle: string) => {
    // Update tab title
    const currentTab = tabs.find(tab => tab.paperId === paperId);
    if (currentTab) {
      const truncatedTitle = newTitle.length > 30 ? newTitle.substring(0, 30) + '...' : newTitle;
      updateTab(currentTab.id, { title: truncatedTitle });
    }
  };

  const deletePaperMutation = useMutation({
    mutationFn: () => papersApi.delete(paperId),
    onSuccess: () => {
      // Find and remove the tab for this paper
      const currentTab = tabs.find(tab => tab.paperId === paperId);
      if (currentTab) {
        removeTab(currentTab.id);
      }
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['papers'] });
      
      // Navigate to papers list
      navigate('/');
      
      // Show success toast
      toastSuccess('Paper deleted successfully');
    },
    onError: (error: Error) => {
      toastError(`Failed to delete paper: ${error.message}`);
    },
  });

  const handleDeletePaper = () => {
    if (!paper) return;
    
    confirm(
      'Delete Paper',
      `Are you sure you want to delete "${paper.title}"? This action cannot be undone.`,
      () => {
        deletePaperMutation.mutate();
      },
      {
        variant: 'destructive',
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
      }
    );
  };

  const handleEditAnnotation = (annotation: Annotation) => {
    setEditingAnnotation(annotation);
  };

  const handleCancelEdit = () => {
    setEditingAnnotation(null);
  };

  const handleAnnotationSuccess = () => {
    setEditingAnnotation(null);
  };

  // Page click handling is managed by PDFViewer's highlight tool

  const handleAnnotationMarkerClick = (annotation: Annotation) => {
    // Navigate to the page containing the annotation
    const page = getAnnotationPage(annotation);
    if (page)
    {
      setCurrentPage(page);

      // Wait for page to navigate and PDF to render, then highlight both sidebar and PDF
      setTimeout(() => {
        // Scroll to the annotation in the sidebar
        const annotationElement = document.querySelector(`[data-annotation-id="${annotation.id}"]`);
        if (annotationElement)
        {
          annotationElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Highlight it briefly
          annotationElement.classList.add('ring-2', 'ring-corca-blue-medium');
          setTimeout(() => {
            annotationElement.classList.remove('ring-2', 'ring-corca-blue-medium');
          }, 3000);
        }

        // Find and highlight all PDF elements for this annotation (both highlights and markers)
        const pdfElements = document.querySelectorAll(`[data-pdf-annotation-id="${annotation.id}"]`);
        pdfElements.forEach((pdfElement) => {
          const element = pdfElement as HTMLElement;
          element.classList.add('ring-4', 'ring-corca-blue-medium', 'ring-offset-2', 'z-50');

          // Scroll PDF container to show the element
          const pdfContainer = document.querySelector('[class*="overflow-y-auto"][class*="bg-gray-50"]') as HTMLElement;
          if (pdfContainer && element)
          {
            const containerRect = pdfContainer.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();

            // Calculate scroll position to center the element
            const scrollTop = pdfContainer.scrollTop + (elementRect.top - containerRect.top) - (containerRect.height / 2) + (elementRect.height / 2);
            pdfContainer.scrollTo({
              top: Math.max(0, scrollTop),
              behavior: 'smooth',
            });
          }

          setTimeout(() => {
            element.classList.remove('ring-4', 'ring-corca-blue-medium', 'ring-offset-2', 'z-50');
          }, 3000);
        });
      }, 500); // Wait for page navigation and rendering
    } else
    {
      // If no page info, just scroll to sidebar
      const annotationElement = document.querySelector(`[data-annotation-id="${annotation.id}"]`);
      if (annotationElement)
      {
        annotationElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        annotationElement.classList.add('ring-2', 'ring-corca-blue-medium');
        setTimeout(() => {
          annotationElement.classList.remove('ring-2', 'ring-corca-blue-medium');
        }, 2000);
      }
    }
  };

  const handleDeleteAnnotation = (annotationId: number) => {
    confirm(
      'Delete Annotation',
      'Are you sure you want to delete this annotation?',
      () => {
        deleteAnnotationMutation.mutate(annotationId);
      },
      { variant: 'destructive', confirmLabel: 'Delete' }
    );
  };

  const getAnnotationPage = (annotation: Annotation): number | null => {
    if (annotation.coordinate_data && typeof annotation.coordinate_data === 'object')
    {
      const coord = annotation.coordinate_data as { page?: number };
      return coord.page || null;
    }
    return null;
  };

  // Handle navigation to specific annotation from URL hash
  useEffect(() => {
    if (location.hash && annotations)
    {
      const annotationId = parseInt(location.hash.replace('#annotation-', ''));
      if (!isNaN(annotationId))
      {
        const annotation = annotations.find(ann => ann.id === annotationId);
        if (annotation)
        {
          // Scroll to the page containing the annotation
          const page = getAnnotationPage(annotation);
          if (page)
          {
            setCurrentPage(page);
            // Wait for page to render, then scroll to annotation in sidebar
            setTimeout(() => {
              const annotationElement = document.querySelector(`[data-annotation-id="${annotationId}"]`);
              if (annotationElement)
              {
                annotationElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                annotationElement.classList.add('ring-2', 'ring-corca-blue-medium');
                setTimeout(() => {
                  annotationElement.classList.remove('ring-2', 'ring-corca-blue-medium');
                }, 3000);
              }
            }, 500);
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.hash, annotations]);


  if (paperLoading)
  {
    return (
      <div className="w-full bg-anara-light-bg min-h-screen">
        <div className="container py-8 sm:py-12">
          <div className="text-center text-anara-light-text-muted">Loading paper...</div>
        </div>
      </div>
    );
  }

  if (paperError || !paper)
  {
    return (
      <div className="w-full bg-anara-light-bg min-h-screen">
        <div className="container py-8 sm:py-12">
          <div className="text-center text-red-600">
            {paperError ? `Error: ${paperError.message}` : 'Paper not found'}
          </div>
          <Link to="/" className="mt-4 inline-block">
            <Button variant="outline">Back to Papers</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Construct PDF URL from file_path
  // file_path is stored as full path (e.g., "./storage/papers/filename.pdf" or absolute path)
  // We need to extract just the filename and construct URL at /storage endpoint
  // Note: Storage is mounted at /storage (root level, not under /api/v1)
  const pdfUrl = paper.file_path
    ? (() => {
      // Get base URL without /api/v1 prefix
      const envUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
      const baseUrl = envUrl.replace('/api/v1', '').replace(/\/$/, '') || 'http://localhost:8000';
      // Extract filename from path (handles both relative and absolute paths)
      const filename = paper.file_path.split(/[/\\]/).pop() || '';
      // Storage is mounted at /storage (not /api/v1/storage)
      return `${baseUrl}/storage/${filename}`;
    })()
    : null;

  return (
    <div className="w-full flex flex-col overflow-hidden bg-white">
      {pdfUrl ? (
        <PDFViewer
          url={pdfUrl}
          currentPage={currentPage}
          onPageChange={handlePageChange}
          annotations={annotations || []}
          onAnnotationClick={handleAnnotationMarkerClick}
          paperId={paperId}
          editingAnnotation={editingAnnotation}
          onAnnotationSuccess={handleAnnotationSuccess}
          onAnnotationCancel={handleCancelEdit}
          paper={paper}
          updateReadingStatusMutation={updateReadingStatusMutation}
          updatePriorityMutation={updatePriorityMutation}
          onBookmarkCreated={() => queryClient.invalidateQueries({ queryKey: ['bookmarks', paperId] })}
          related={related}
          relatedLoading={relatedLoading}
          relatedError={relatedError}
          onEditAnnotation={handleEditAnnotation}
          onDeleteAnnotation={handleDeleteAnnotation}
          deleteAnnotationMutation={deleteAnnotationMutation}
          updatePaperTagsMutation={updatePaperTagsMutation}
          regenerateMetadataMutation={regenerateMetadataMutation}
          extractCitationsMutation={extractCitationsMutation}
          annotationsLoading={annotationsLoading}
          onDelete={handleDeletePaper}
          isDeleting={deletePaperMutation.isPending}
          updatePaperTitleMutation={updatePaperTitleMutation}
          onTitleUpdate={handleTitleUpdate}
        />
      ) : (
        <div className="flex items-center justify-center h-full text-anara-light-text-muted">
          <p>PDF not available</p>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}

