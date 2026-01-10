import { Document, Page, pdfjs } from 'react-pdf';
import { useState, useRef, useEffect, useCallback } from 'react';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import type { Annotation } from '@/lib/api/annotations';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PDFToolbar } from './PDFToolbar';
import { PDFTOC, type TOCItem } from './PDFTOC';
import { FloatingAnnotationForm } from './FloatingAnnotationForm';
import { NoteEditorSidebar } from './NoteEditorSidebar';
import { FloatingNoteEditor } from './FloatingNoteEditor';
import { ChatSidebar } from './ChatSidebar';
import { ChatPanel } from './ChatPanel';
import { NotesSidebar } from './NotesSidebar';
import { PaperSidebar } from './PaperSidebar';

import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

import type { UseMutationResult } from '@tanstack/react-query';
import type { Paper } from '@/lib/api/papers';

interface PDFViewerProps {
  url: string;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  annotations?: Annotation[];
  onAnnotationClick?: (annotation: Annotation) => void;
  paperId: number;
  editingAnnotation?: Annotation | null;
  onAnnotationSuccess?: () => void;
  onAnnotationCancel?: () => void;
  // Progress/Status controls
  paper?: Paper;
  updateReadingStatusMutation?: UseMutationResult<any, Error, 'not_started' | 'in_progress' | 'read' | 'archived', unknown>;
  updatePriorityMutation?: UseMutationResult<any, Error, 'low' | 'medium' | 'high' | 'critical', unknown>;
  onBookmarkCreated?: () => void;
  // Sidebar props
  related?: any;
  relatedLoading?: boolean;
  relatedError?: Error | null;
  onEditAnnotation?: (annotation: Annotation) => void;
  onDeleteAnnotation?: (annotationId: number) => void;
  deleteAnnotationMutation?: UseMutationResult<any, Error, number, unknown>;
  updatePaperTagsMutation?: UseMutationResult<any, Error, number[], unknown>;
  regenerateMetadataMutation?: UseMutationResult<any, Error, void, unknown>;
  extractCitationsMutation?: UseMutationResult<any, Error, void, unknown>;
  annotationsLoading?: boolean;
}

export function PDFViewer({
  url,
  currentPage,
  onPageChange,
  annotations = [],
  onAnnotationClick,
  paperId,
  editingAnnotation,
  onAnnotationSuccess,
  onAnnotationCancel,
  paper,
  updateReadingStatusMutation,
  updatePriorityMutation,
  onBookmarkCreated,
  related,
  relatedLoading = false,
  relatedError = null,
  onEditAnnotation,
  onDeleteAnnotation,
  deleteAnnotationMutation,
  updatePaperTagsMutation,
  regenerateMetadataMutation,
  extractCitationsMutation,
  annotationsLoading = false,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(currentPage || 1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTOC, setShowTOC] = useState(false);
  const [highlightMode, setHighlightMode] = useState(false);
  const [noteMode, setNoteMode] = useState(false);
  const [chatMode, setChatMode] = useState(false);
  const [showNotesSidebar, setShowNotesSidebar] = useState(false);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [editingNote, setEditingNote] = useState<Annotation | null>(null);
  const [showPaperSidebar, setShowPaperSidebar] = useState(false);
  const [filterByPage, setFilterByPage] = useState(false);
  const [tocItems, setTocItems] = useState<TOCItem[] | null>(null);
  const [pageDimensions, setPageDimensions] = useState<Map<number, { width: number; height: number }>>(new Map());
  const [firstPageDimensions, setFirstPageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [renderedPageSizes, setRenderedPageSizes] = useState<Map<number, { width: number; height: number }>>(new Map());
  const [floatingFormData, setFloatingFormData] = useState<{
    coordinates: { page: number; x: number; y: number };
    position: { x: number; y: number };
    highlightedText?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    selectionData?: any;
  } | null>(null);
  const [noteEditorPosition, setNoteEditorPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const isScrollingRef = useRef(false);
  const lastPageNumberRef = useRef(pageNumber);
  const lastPropPageRef = useRef(currentPage);
  const lastUrlRef = useRef<string>(url);
  const lastPaperIdRef = useRef<number>(paperId);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pageCanvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const pdfDocumentRef = useRef<PDFDocumentProxy | null>(null);

  const scrollToPage = useCallback((pageNum: number) => {
    // Validate page number
    if (pageNum < 1 || (numPages && pageNum > numPages)) {
      return;
    }
    
    const attemptScroll = (retryCount = 0) => {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        const pageEl = pageRefs.current.get(pageNum);
        const scrollContainer = scrollContainerRef.current;
        
        if (pageEl && scrollContainer)
        {
          isScrollingRef.current = true;
          
          // Calculate scroll position relative to the scrollable container
          // Get the position of the page element relative to the scroll container
          const containerRect = scrollContainer.getBoundingClientRect();
          const elementRect = pageEl.getBoundingClientRect();
          
          // Calculate the scroll position to center the page in the viewport
          // offsetTop gives position relative to offsetParent, but we need relative to scroll container
          const scrollTop = scrollContainer.scrollTop + (elementRect.top - containerRect.top) - (containerRect.height / 2) + (elementRect.height / 2);

          // Only scroll the scrollable container, not the window or parent
          scrollContainer.scrollTo({
            top: Math.max(0, scrollTop),
            behavior: 'smooth',
          });

          // Reset scrolling flag after animation
          setTimeout(() => {
            isScrollingRef.current = false;
          }, 1000);
        }
        else if (retryCount < 3)
        {
          // If element not found, try again after a short delay (page might still be rendering)
          setTimeout(() => {
            attemptScroll(retryCount + 1);
          }, 150);
        }
        else
        {
          isScrollingRef.current = false;
        }
      });
    };
    
    attemptScroll();
  }, [numPages]);

  // Track last container width to prevent unnecessary updates
  const lastContainerWidthRef = useRef<number>(0);

  const updateZoom = useCallback(() => {
    const container = containerRef.current;
    if (!container || !numPages || !firstPageDimensions) return;

    const containerWidth = container.clientWidth;
    if (containerWidth === 0) return;

    // Only update if width actually changed significantly
    if (Math.abs(containerWidth - lastContainerWidthRef.current) < 10)
    {
      return;
    }
    lastContainerWidthRef.current = containerWidth;

    const padding = 40;
    const availableWidth = containerWidth - padding;
    const calculatedZoom = Math.max(0.5, Math.min(2, availableWidth / firstPageDimensions.width));

    setZoom((prevZoom) => {
      // Only update if change is significant
      if (Math.abs(prevZoom - calculatedZoom) > 0.05)
      {
        return calculatedZoom;
      }
      return prevZoom;
    });
  }, [numPages, firstPageDimensions]);

  // Adjust zoom based on available container width
  useEffect(() => {
    if (!containerRef.current || !numPages) return;

    // Initial calculation
    updateZoom();

    let timeoutId: ReturnType<typeof setTimeout>;
    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(updateZoom, 300); // Increased from 100ms
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(timeoutId);
    };
  }, [numPages, updateZoom]);

  // Reset PDF viewer state when URL or paperId changes (tab switch)
  useEffect(() => {
    if (url !== lastUrlRef.current || paperId !== lastPaperIdRef.current)
    {
      // PDF changed, reset state
      setNumPages(null);
      setLoading(true);
      setError(null);
      setPageNumber(1);
      lastPageNumberRef.current = 1;
      lastPropPageRef.current = currentPage || 1;
      setPageDimensions(new Map());
      setFirstPageDimensions(null);
      setRenderedPageSizes(new Map());
      pdfDocumentRef.current = null;

      // Reset to page 1 or restore from currentPage prop
      if (currentPage !== undefined)
      {
        lastPropPageRef.current = currentPage;
        lastPageNumberRef.current = currentPage;
        setPageNumber(currentPage);
      }

      lastUrlRef.current = url;
      lastPaperIdRef.current = paperId;
    }
  }, [url, paperId, currentPage]);

  // Sync page number with prop if provided
  useEffect(() => {
    if (currentPage !== undefined && currentPage !== lastPropPageRef.current)
    {
      // Only sync if the page actually needs to change
      if (currentPage !== pageNumber)
      {
        lastPropPageRef.current = currentPage;
        lastPageNumberRef.current = currentPage;
        setPageNumber(currentPage);
        // Only scroll if page is different by more than 1 to avoid scroll loops
        if (Math.abs(currentPage - pageNumber) > 1)
        {
          scrollToPage(currentPage);
        } else if (currentPage !== pageNumber)
        {
          // For adjacent pages, still scroll but use a shorter delay
          scrollToPage(currentPage);
        }
      } else
      {
        // Update refs even if pageNumber is already correct
        lastPropPageRef.current = currentPage;
        lastPageNumberRef.current = currentPage;
      }
    }
  }, [currentPage, pageNumber, scrollToPage]);

  // Track current page based on scroll position
  useEffect(() => {
    if (!scrollContainerRef.current || numPages === null) return;

    const handleScroll = () => {
      if (isScrollingRef.current) return;
      const container = scrollContainerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const viewportCenter = containerRect.top + containerRect.height / 2;

      // Find which page is in the center of the viewport
      let currentPageInView = 1;
      let minDistance = Infinity;

      for (let i = 1; i <= numPages; i++)
      {
        const pageEl = pageRefs.current.get(i);
        if (!pageEl) continue;

        const pageRect = pageEl.getBoundingClientRect();
        const pageCenter = pageRect.top + pageRect.height / 2;

        const distance = Math.abs(viewportCenter - pageCenter);
        if (distance < minDistance)
        {
          minDistance = distance;
          currentPageInView = i;
        }
      }

      if (currentPageInView !== lastPageNumberRef.current)
      {
        lastPageNumberRef.current = currentPageInView;
        lastPropPageRef.current = currentPageInView; // Also update prop ref to avoid sync-back
        setPageNumber(currentPageInView);
        onPageChange?.(currentPageInView);
      }
    };

    const container = scrollContainerRef.current;
    container.addEventListener('scroll', handleScroll, { passive: true });
    // Also check on initial load and when pages are loaded
    const timer = setTimeout(handleScroll, 100);
    return () => {
      clearTimeout(timer);
      container.removeEventListener('scroll', handleScroll);
    };
  }, [numPages, onPageChange, pageDimensions]); // Removed pageNumber to avoid scroll loop

  // Extract table of contents from PDF outline/bookmarks
  const extractTOC = useCallback(async (pdf: PDFDocumentProxy) => {
    try
    {
      // Check if getOutline method exists (it should in pdfjs-dist)
      if (typeof (pdf as any).getOutline !== 'function') {
        setTocItems(null);
        return;
      }

      // Wait a bit for document to fully load if needed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const outline = await (pdf as any).getOutline();
      
      if (!outline || (Array.isArray(outline) && outline.length === 0))
      {
        setTocItems(null);
        return;
      }

      const processOutline = async (items: any[]): Promise<TOCItem[]> => {
        const processed: TOCItem[] = [];
        for (const item of items)
        {
          let pageNum = 1;

          // Try to resolve destination to get page number
          if (item.dest || item.url)
          {
            try
            {
              let dest = item.dest || item.url;
              let resolvedDest = null;
              
              // Step 1: Resolve destination if it's a string reference or named destination
              if (typeof dest === 'string')
              {
                // Named destination - resolve it
                if (typeof (pdf as any).getDestination === 'function')
                {
                  resolvedDest = await (pdf as any).getDestination(dest);
                }
              }
              // If dest is an array with string as first element, it's a named destination
              else if (Array.isArray(dest) && dest.length > 0 && typeof dest[0] === 'string')
              {
                if (typeof (pdf as any).getDestination === 'function')
                {
                  resolvedDest = await (pdf as any).getDestination(dest);
                }
              }
              // If dest is already an array, it might be a resolved destination
              else if (Array.isArray(dest))
              {
                resolvedDest = dest;
              }
              // If dest is an object, it might be a resolved destination or page ref
              else if (dest && typeof dest === 'object')
              {
                resolvedDest = dest;
              }

              // Step 2: Extract page reference from resolved destination
              let pageRef = null;
              
              if (Array.isArray(resolvedDest) && resolvedDest.length > 0)
              {
                // Resolved destination array format: [pageRef, destinationType, x, y, zoom, ...]
                pageRef = resolvedDest[0];
              }
              else if (resolvedDest && typeof resolvedDest === 'object' && !Array.isArray(resolvedDest))
              {
                // Destination might already be a page reference object
                pageRef = resolvedDest;
              }
              // If dest was never resolved, try using it directly
              else if (dest && typeof dest === 'object' && !Array.isArray(dest))
              {
                pageRef = dest;
              }

              // Step 3: Resolve page reference to page number using getPageIndex
              if (pageRef && typeof (pdf as any).getPageIndex === 'function')
              {
                try
                {
                  // getPageIndex is the most reliable method - returns 0-based index
                  const pageIndex = await (pdf as any).getPageIndex(pageRef);
                  
                  if (pageIndex !== null && pageIndex !== undefined && !isNaN(pageIndex) && pageIndex >= 0 && pageIndex < pdf.numPages)
                  {
                    // Convert 0-based index to 1-based page number
                    pageNum = Math.floor(pageIndex) + 1;
                  }
                  else
                  {
                    throw new Error(`Invalid page index: ${pageIndex}`);
                  }
                }
                catch (pageIndexError)
                {
                  // getPageIndex failed - try alternative methods
                  // Check if pageRef has properties that indicate page number
                  if (pageRef && typeof pageRef === 'object')
                  {
                    // Try different possible properties for page number
                    if ('num' in pageRef && typeof pageRef.num === 'number')
                    {
                      const refNum = pageRef.num;
                      // Check if it's already 1-based (common case)
                      if (refNum >= 1 && refNum <= pdf.numPages)
                      {
                        pageNum = Math.floor(refNum);
                      }
                      // Or if it's 0-based
                      else if (refNum >= 0 && refNum < pdf.numPages)
                      {
                        pageNum = Math.floor(refNum) + 1;
                      }
                    }
                  }
                }
              }
              // Fallback: Direct number (shouldn't happen but handle it)
              else if (typeof pageRef === 'number' && pageRef > 0)
              {
                if (pageRef >= 1 && pageRef <= pdf.numPages)
                {
                  pageNum = Math.floor(pageRef);
                }
                else if (pageRef < pdf.numPages)
                {
                  pageNum = Math.floor(pageRef) + 1; // Assume 0-based
                }
              }
            }
            catch (e)
            {
              // Keep default pageNum = 1
            }
          }
          
          // Validate page number is within valid range
          if (pageNum < 1 || pageNum > pdf.numPages)
          {
            pageNum = 1;
          }

          const tocItem: TOCItem = {
            title: item.title || 'Untitled',
            page: pageNum,
            items: item.items && Array.isArray(item.items) && item.items.length > 0 
              ? await processOutline(item.items) 
              : undefined,
          };
          
          processed.push(tocItem);
        }
        return processed;
      };

      const processedTOC = await processOutline(outline);
      setTocItems(processedTOC);
    } catch (err)
    {
      setTocItems(null);
    }
  }, []);

  function onDocumentLoadSuccess(document: PDFDocumentProxy) {
    pdfDocumentRef.current = document;
    setNumPages(document.numPages);
    setLoading(false);
    setError(null);
    
    // Extract table of contents from PDF
    extractTOC(document).catch(() => {
      // Silently fail - TOC is optional
    });
  }

  function onDocumentLoadError(error: Error) {
    setError(error.message);
    setLoading(false);
  }

  // Handle text selection for highlighting
  useEffect(() => {
    if (!highlightMode) return;

    const handleSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      const selectedText = range.toString().trim();

      if (!selectedText) return;

      // Find which page contains the selection
      let selectedPage = null;
      let pageElement: HTMLElement | null = null;

      for (let i = 1; i <= (numPages || 0); i++)
      {
        const pageEl = pageRefs.current.get(i);
        if (pageEl && pageEl.contains(range.commonAncestorContainer))
        {
          selectedPage = i;
          pageElement = pageEl;
          break;
        }
      }

      if (!selectedPage || !pageElement) return;

      // Get page dimensions
      const pageDims = pageDimensions.get(selectedPage);
      if (!pageDims) return;

      // Find the actual PDF page canvas/element (react-pdf renders inside the container)
      const pdfPageElement = pageElement.querySelector('.react-pdf__Page__canvas') as HTMLElement;
      if (!pdfPageElement)
      {
        // Fallback: try to find the page wrapper
        const pageWrapper = pageElement.querySelector('.react-pdf__Page') as HTMLElement;
        if (!pageWrapper) return;

        // Use page wrapper as fallback
        const pageRect = pageWrapper.getBoundingClientRect();
        const selectionRect = range.getBoundingClientRect();

        const startX = Math.max(0, Math.min(1, (selectionRect.left - pageRect.left) / pageRect.width));
        const startY = Math.max(0, Math.min(1, (selectionRect.top - pageRect.top) / pageRect.height));
        const endX = Math.max(0, Math.min(1, (selectionRect.right - pageRect.left) / pageRect.width));
        const endY = Math.max(0, Math.min(1, (selectionRect.bottom - pageRect.top) / pageRect.height));

        const selectionData = {
          start: { x: startX, y: startY },
          end: { x: endX, y: endY },
          boundingBox: {
            left: Math.min(startX, endX),
            top: Math.min(startY, endY),
            right: Math.max(startX, endX),
            bottom: Math.max(startY, endY),
            width: Math.abs(endX - startX),
            height: Math.abs(endY - startY),
          },
        };

        const centerX = (selectionRect.left + selectionRect.right) / 2;
        const centerY = (selectionRect.top + selectionRect.bottom) / 2;

        setFloatingFormData({
          coordinates: {
            page: selectedPage,
            x: (startX + endX) / 2,
            y: (startY + endY) / 2,
          },
          position: { x: centerX, y: centerY },
          highlightedText: selectedText,
          selectionData,
        });

        selection.removeAllRanges();
        setHighlightMode(false);
        return;
      }

      // Calculate selection coordinates relative to the actual PDF page canvas
      const pageRect = pdfPageElement.getBoundingClientRect();
      const selectionRect = range.getBoundingClientRect();

      // Normalize coordinates relative to the PDF page canvas (0-1 range)
      const startX = Math.max(0, Math.min(1, (selectionRect.left - pageRect.left) / pageRect.width));
      const startY = Math.max(0, Math.min(1, (selectionRect.top - pageRect.top) / pageRect.height));
      const endX = Math.max(0, Math.min(1, (selectionRect.right - pageRect.left) / pageRect.width));
      const endY = Math.max(0, Math.min(1, (selectionRect.bottom - pageRect.top) / pageRect.height));

      const selectionData = {
        start: { x: startX, y: startY },
        end: { x: endX, y: endY },
        boundingBox: {
          left: Math.min(startX, endX),
          top: Math.min(startY, endY),
          right: Math.max(startX, endX),
          bottom: Math.max(startY, endY),
          width: Math.abs(endX - startX),
          height: Math.abs(endY - startY),
        },
      };

      // Center position for floating form
      const centerX = (selectionRect.left + selectionRect.right) / 2;
      const centerY = (selectionRect.top + selectionRect.bottom) / 2;

      setFloatingFormData({
        coordinates: {
          page: selectedPage,
          x: (startX + endX) / 2,
          y: (startY + endY) / 2,
        },
        position: { x: centerX, y: centerY },
        highlightedText: selectedText,
        selectionData,
      });

      // Clear selection
      selection.removeAllRanges();
      setHighlightMode(false);
    };

    // Listen for mouseup to capture selection
    document.addEventListener('mouseup', handleSelection);
    return () => document.removeEventListener('mouseup', handleSelection);
  }, [highlightMode, numPages, pageDimensions]);


  const handlePageNumberChange = useCallback((newPage: number) => {
    setPageNumber(newPage);
    onPageChange?.(newPage);
    scrollToPage(newPage);
  }, [onPageChange, scrollToPage]);

  const onPageLoadSuccess = useCallback((pageNum: number, page: { width: number; height: number }) => {
    setPageDimensions(prev => {
      const existing = prev.get(pageNum);
      if (existing && existing.width === page.width && existing.height === page.height) return prev;
      if (pageNum === 1) setFirstPageDimensions({ width: page.width, height: page.height });
      const newMap = new Map(prev);
      newMap.set(pageNum, { width: page.width, height: page.height });
      return newMap;
    });

    // Update rendered size after a brief delay to ensure canvas is rendered
    setTimeout(() => {
      const canvas = pageCanvasRefs.current.get(pageNum);
      if (canvas)
      {
        const rect = canvas.getBoundingClientRect();
        setRenderedPageSizes(prev => {
          const existing = prev.get(pageNum);
          if (existing && existing.width === rect.width && existing.height === rect.height) return prev;
          const newMap = new Map(prev);
          newMap.set(pageNum, { width: rect.width, height: rect.height });
          return newMap;
        });
      }
    }, 50);
  }, []);

  // Update rendered sizes when zoom changes or pages load
  useEffect(() => {
    const updateRenderedSizes = () => {
      const newSizes = new Map<number, { width: number; height: number }>();
      pageRefs.current.forEach((pageEl, pageNum) => {
        if (pageEl)
        {
          const pdfCanvas = pageEl.querySelector('.react-pdf__Page__canvas') as HTMLCanvasElement;
          if (pdfCanvas)
          {
            pageCanvasRefs.current.set(pageNum, pdfCanvas);
            const rect = pdfCanvas.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0)
            {
              newSizes.set(pageNum, { width: rect.width, height: rect.height });
            }
          }
        }
      });
      if (newSizes.size > 0)
      {
        setRenderedPageSizes(prev => {
          if (prev.size === newSizes.size)
          {
            let changed = false;
            newSizes.forEach((val, key) => {
              const old = prev.get(key);
              if (!old || old.width !== val.width || old.height !== val.height) changed = true;
            });
            if (!changed) return prev;
          }
          return newSizes;
        });
      }
    };

    // Update after zoom changes or initial load
    const timer = setTimeout(updateRenderedSizes, 150);

    // Also set up ResizeObserver for each canvas
    const observers: ResizeObserver[] = [];
    pageCanvasRefs.current.forEach((canvas) => {
      if (canvas)
      {
        const observer = new ResizeObserver(() => {
          updateRenderedSizes();
        });
        observer.observe(canvas);
        observers.push(observer);
      }
    });

    return () => {
      clearTimeout(timer);
      observers.forEach(obs => obs.disconnect());
    };
  }, [zoom, numPages, pageDimensions]);

  const getAnnotationPage = useCallback((annotation: Annotation): number | null => {
    if (annotation.coordinate_data && typeof annotation.coordinate_data === 'object')
    {
      const coord = annotation.coordinate_data as { page?: number };
      return coord.page || null;
    }
    return null;
  }, []);

  // Handle edit annotation
  const handleEditAnnotation = useCallback((annotation: Annotation) => {
    onEditAnnotation?.(annotation);
  }, [onEditAnnotation]);

  // Handle delete annotation
  const handleDeleteAnnotation = useCallback((annotationId: number) => {
    onDeleteAnnotation?.(annotationId);
  }, [onDeleteAnnotation]);

  function getAnnotationPosition(annotation: Annotation): { x: number; y: number } | null {
    if (annotation.coordinate_data && typeof annotation.coordinate_data === 'object')
    {
      const coord = annotation.coordinate_data as { x?: number; y?: number };
      if (coord.x !== undefined && coord.y !== undefined)
      {
        return { x: coord.x, y: coord.y };
      }
    }
    return null;
  }

  function getHighlightSelectionData(annotation: Annotation): any | null {
    return annotation.selection_data || null;
  }


  // Fullscreen handling
  const handleFullscreenToggle = useCallback(async () => {
    if (!containerRef.current) return;

    try
    {
      if (!isFullscreen)
      {
        await containerRef.current.requestFullscreen();
      } else
      {
        await document.exitFullscreen();
      }
    } catch (err)
    {
    }
  }, [isFullscreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Handle TOC item click
  const handleTOCItemClick = useCallback((page: number) => {
    // Validate page number
    if (page < 1 || (numPages && page > numPages)) {
      return;
    }
    
    // Close TOC first
    setShowTOC(false);
    
    // Update page number state
    setPageNumber(page);
    onPageChange?.(page);
    
    // Wait for DOM to update, then scroll to the page
    // Use setTimeout with requestAnimationFrame to ensure the page element is rendered
    setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToPage(page);
        });
      });
    }, 50);
  }, [numPages, onPageChange, scrollToPage]);

  // Show floating form when editing annotation
  useEffect(() => {
    if (editingAnnotation)
    {
      const annPage = getAnnotationPage(editingAnnotation);
      const annPos = getAnnotationPosition(editingAnnotation);

      if (annPage && annPos)
      {
        // Use a timeout to ensure page is rendered
        const timer = setTimeout(() => {
          const pageEl = pageRefs.current.get(annPage);
          if (pageEl && containerRef.current)
          {
            const pageDims = pageDimensions.get(annPage);

            if (pageDims)
            {
              // Calculate screen position from normalized coordinates
              // Position relative to the page element
              const pageRect = pageEl.getBoundingClientRect();
              const x = pageRect.left + annPos.x * pageDims.width * zoom;
              const y = pageRect.top + annPos.y * pageDims.height * zoom;

              setFloatingFormData({
                coordinates: { page: annPage, x: annPos.x, y: annPos.y },
                position: { x, y },
              });

              // Scroll to the annotation's page
              scrollToPage(annPage);
            }
          }
        }, 100);

        return () => clearTimeout(timer);
      }
    }
  }, [editingAnnotation, pageDimensions, zoom, scrollToPage]);

  // Handle floating form close
  const handleFloatingFormClose = useCallback(() => {
    setFloatingFormData(null);
    onAnnotationCancel?.();
  }, [onAnnotationCancel]);

  const handleFloatingFormSuccess = useCallback(() => {
    setFloatingFormData(null);
    onAnnotationSuccess?.();
  }, [onAnnotationSuccess]);

  // Handle note mode toggle
  const handleNoteModeToggle = useCallback(() => {
    if (noteMode)
    {
      // Close note editor
      setShowNoteEditor(false);
      setNoteMode(false);
      setEditingNote(null);
    } else
    {
      // Open note editor (close chat if open)
      setChatMode(false);
      setShowNoteEditor(true);
      setNoteMode(true);
      setEditingNote(null);
      // Set initial position for floating editor (center of viewport)
      if (!isFullscreen)
      {
        setNoteEditorPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });
      }
    }
  }, [noteMode, isFullscreen]);

  // Handle chat mode toggle
  const handleChatModeToggle = useCallback(() => {
    if (chatMode)
    {
      // Close chat
      setChatMode(false);
    } else
    {
      // Open chat (close other sidebars if open)
      setShowNoteEditor(false);
      setNoteMode(false);
      setEditingNote(null);
      setShowNotesSidebar(false);
      setChatMode(true);
    }
  }, [chatMode]);

  // Handle notes sidebar toggle
  const handleNotesSidebarToggle = useCallback(() => {
    if (showNotesSidebar)
    {
      // Close notes sidebar
      setShowNotesSidebar(false);
    } else
    {
      // Open notes sidebar (close other sidebars if open)
      setShowNoteEditor(false);
      setNoteMode(false);
      setEditingNote(null);
      setChatMode(false);
      setShowNotesSidebar(true);
    }
  }, [showNotesSidebar]);

  // Handle edit note from notes sidebar
  const handleEditNoteFromSidebar = useCallback((note: Annotation) => {
    setEditingNote(note);
    setShowNoteEditor(true);
    setShowNotesSidebar(false); // Close notes sidebar when opening editor
  }, []);

  // Handle create new note from notes sidebar
  const handleCreateNoteFromSidebar = useCallback(() => {
    setEditingNote(null); // null means creating a new note
    setShowNoteEditor(true);
    setShowNotesSidebar(false); // Close notes sidebar when opening editor
  }, []);

  // Handle note editor close
  const handleNoteEditorClose = useCallback(() => {
    setShowNoteEditor(false);
    setNoteMode(false);
    setEditingNote(null);
  }, []);

  // Handle note editor success
  const handleNoteEditorSuccess = useCallback(() => {
    setShowNoteEditor(false);
    setNoteMode(false);
    setEditingNote(null);
    onAnnotationSuccess?.();
  }, [onAnnotationSuccess]);

  // Render all pages in continuous mode
  const renderPages = () => {
    if (!numPages) return null;

    return Array.from({ length: numPages }, (_, i) => {
      const pageNum = i + 1;
      const pageDims = pageDimensions.get(pageNum);
      const pageAnnotations = annotations.filter((ann) => {
        const annPage = getAnnotationPage(ann);
        return annPage === pageNum && ann.type !== 'note';
      });
      // Get regular highlights with selection_data (exclude AI-generated ones without selection_data)
      const pageHighlights = annotations.filter((ann) => {
        const annPage = getAnnotationPage(ann);
        return annPage === pageNum &&
          ann.type === 'annotation' &&
          ann.selection_data &&
          (!ann.auto_highlighted || ann.selection_data.boundingBox); // Only show AI highlights if they have boundingBox
      });

      return (
        <div
          key={pageNum}
          ref={(el) => {
            if (el) pageRefs.current.set(pageNum, el);
          }}
          className="relative mb-2 flex justify-center"
        >
          <div className={`relative ${highlightMode ? 'cursor-text' : ''}`}>
            <Page
              pageNumber={pageNum}
              scale={zoom}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              className="border border-gray-200"
              onLoadSuccess={(page) => onPageLoadSuccess(pageNum, page)}
            />
            {/* Store canvas reference for size measurement */}
            {/* Highlight overlays - positioned relative to the Page component */}
            {pageDims && pageHighlights.length > 0 && (() => {
              // Use actual rendered size if available, otherwise calculate from base dimensions
              const renderedSize = renderedPageSizes.get(pageNum);
              const renderedWidth = renderedSize?.width ?? (pageDims.width * zoom);
              const renderedHeight = renderedSize?.height ?? (pageDims.height * zoom);

              return (
                <div
                  key={`highlights-${pageNum}-${zoom}`}
                  className="absolute pointer-events-none"
                  style={{
                    zIndex: 1,
                    left: 0,
                    top: 0,
                    width: `${renderedWidth}px`,
                    height: `${renderedHeight}px`,
                  }}
                >
                  {pageHighlights.map((annotation) => {
                    const selectionData = getHighlightSelectionData(annotation);
                    if (!selectionData || !selectionData.boundingBox) return null;

                    const bbox = selectionData.boundingBox;
                    // Calculate positions based on normalized coordinates (0-1) and actual rendered page size
                    const left = bbox.left * renderedWidth;
                    const top = bbox.top * renderedHeight;
                    const width = Math.max(2, bbox.width * renderedWidth); // Minimum 2px width
                    const height = Math.max(2, bbox.height * renderedHeight); // Minimum 2px height

                    return (
                      <div
                        key={`highlight-${annotation.id}`}
                        data-pdf-annotation-id={annotation.id}
                        className="absolute pointer-events-auto group"
                        style={{
                          left: `${left}px`,
                          top: `${top}px`,
                          width: `${width}px`,
                          height: `${height}px`,
                          backgroundColor: 'rgba(255, 255, 0, 0.3)',
                          border: '1px solid rgba(255, 200, 0, 0.5)',
                          borderRadius: '2px',
                          mixBlendMode: 'multiply',
                          transition: 'all 0.3s ease',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onAnnotationClick?.(annotation);
                        }}
                      >
                        {/* Tooltip on hover */}
                        <div className="absolute bottom-full left-0 mb-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                          <div className="bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap max-w-xs truncate">
                            {annotation.highlighted_text || annotation.content}
                          </div>
                          <div className="absolute top-full left-2 border-4 border-transparent border-t-gray-900" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Annotation markers overlay */}
            {pageDims && pageAnnotations.length > 0 && (
              <div className="absolute inset-0 pointer-events-none">
                {pageAnnotations.map((annotation) => {
                  const position = getAnnotationPosition(annotation);
                  if (!position) return null;

                  const x = position.x * pageDims.width * zoom;
                  const y = position.y * pageDims.height * zoom;

                  return (
                    <div
                      key={annotation.id}
                      data-pdf-annotation-id={annotation.id}
                      className="absolute pointer-events-auto group"
                      style={{
                        left: `${x}px`,
                        top: `${y}px`,
                        transform: 'translate(-50%, -50%)',
                        transition: 'all 0.3s ease',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAnnotationClick?.(annotation);
                      }}
                    >
                      {/* Marker */}
                      <div className="w-4 h-4 bg-corca-blue-medium rounded-full border-2 border-white cursor-pointer hover:bg-corca-blue-light transition-colors" />
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        <div className="bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap max-w-xs truncate">
                          {annotation.content}
                        </div>
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      );
    });
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-screen flex flex-col overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50 bg-white' : ''}`}
    >
      <PDFToolbar
        zoom={zoom}
        onZoomChange={setZoom}
        currentPage={pageNumber}
        numPages={numPages}
        onPageChange={handlePageNumberChange}
        isFullscreen={isFullscreen}
        onFullscreenToggle={handleFullscreenToggle}
        showTOC={showTOC}
        onTOCToggle={() => setShowTOC(!showTOC)}
        highlightMode={highlightMode}
        onHighlightModeToggle={() => setHighlightMode(!highlightMode)}
        noteMode={noteMode}
        onNoteModeToggle={handleNoteModeToggle}
        chatMode={chatMode}
        onChatModeToggle={handleChatModeToggle}
        showNotesSidebar={showNotesSidebar}
        onNotesSidebarToggle={handleNotesSidebarToggle}
        showPaperSidebar={showPaperSidebar}
        onPaperSidebarToggle={() => setShowPaperSidebar(!showPaperSidebar)}
        onFirstPage={() => handlePageNumberChange(1)}
        onLastPage={() => handlePageNumberChange(numPages || 1)}
        onPreviousPage={() => handlePageNumberChange(Math.max(1, pageNumber - 1))}
        onNextPage={() => handlePageNumberChange(Math.min(numPages || 1, pageNumber + 1))}
        paperId={paperId}
        readingStatus={paper?.reading_status}
        onReadingStatusChange={(status) => {
          updateReadingStatusMutation?.mutate(status);
        }}
        readingStatusMutation={updateReadingStatusMutation}
        priority={paper?.priority}
        onPriorityChange={(priority) => {
          updatePriorityMutation?.mutate(priority);
        }}
        priorityMutation={updatePriorityMutation}
        onBookmarkCreated={onBookmarkCreated}
      />

      <PDFTOC
        items={tocItems}
        isOpen={showTOC}
        onClose={() => setShowTOC(false)}
        onItemClick={handleTOCItemClick}
        currentPage={pageNumber}
      />

      {/* Paper Sidebar */}
      {
        paper && deleteAnnotationMutation && updatePaperTagsMutation && regenerateMetadataMutation && extractCitationsMutation && (
          <PaperSidebar
            isOpen={showPaperSidebar}
            onClose={() => setShowPaperSidebar(false)}
            paperId={paperId}
            paper={paper}
            annotations={annotations}
            annotationsLoading={annotationsLoading}
            related={related}
            relatedLoading={relatedLoading}
            relatedError={relatedError}
            currentPage={pageNumber}
            filterByPage={filterByPage}
            onFilterByPageChange={setFilterByPage}
            editingAnnotation={editingAnnotation || null}
            onEditAnnotation={handleEditAnnotation}
            onDeleteAnnotation={handleDeleteAnnotation}
            onAnnotationClick={onAnnotationClick || (() => { })}
            deleteAnnotationMutation={deleteAnnotationMutation}
            updatePaperTagsMutation={updatePaperTagsMutation}
            regenerateMetadataMutation={regenerateMetadataMutation}
            extractCitationsMutation={extractCitationsMutation}
            getAnnotationPage={getAnnotationPage}
          />
        )
      }

      {/* Note Editor Sidebar (Fullscreen) */}
      {
        isFullscreen && showNoteEditor && (
          <NoteEditorSidebar
            paperId={paperId}
            currentPage={pageNumber}
            annotation={editingNote}
            onClose={handleNoteEditorClose}
            onSuccess={handleNoteEditorSuccess}
          />
        )
      }

      {/* Notes Sidebar (PDF Fullscreen) */}
      {
        isFullscreen && showNotesSidebar && (
          <NotesSidebar
            paperId={paperId}
            currentPage={pageNumber}
            annotations={annotations}
            isLoading={false}
            onClose={() => setShowNotesSidebar(false)}
            onEditNote={handleEditNoteFromSidebar}
            onCreateNote={handleCreateNoteFromSidebar}
          />
        )
      }

      {/* Chat Sidebar (PDF Fullscreen) */}
      {
        isFullscreen && chatMode && (
          <ChatSidebar
            paperId={paperId}
            onClose={() => setChatMode(false)}
          />
        )
      }

      {/* Chat Panel Fullscreen (PDF Not Fullscreen) */}
      {
        !isFullscreen && chatMode && (
          <div className="fixed inset-0 z-50 bg-white">
            <ChatPanel paperId={paperId} onClose={() => setChatMode(false)} />
          </div>
        )
      }

      {/* Note Editor Floating (Normal Mode) */}
      {
        !isFullscreen && showNoteEditor && (
          <FloatingNoteEditor
            paperId={paperId}
            currentPage={pageNumber}
            annotation={editingNote}
            position={noteEditorPosition}
            onCancel={handleNoteEditorClose}
            onSuccess={handleNoteEditorSuccess}
          />
        )
      }

      {/* Backdrop overlays - clicking outside closes the sidebars */}
      {/* Z-index hierarchy: PDF content (z-0) < backdrops (z-[49]) < sidebars (z-50) < dropdowns/popovers (z-100) */}
      {/* TOC backdrop - works in both fullscreen and non-fullscreen */}
      {showTOC && (
        <div 
          className="fixed inset-0 bg-black/20 z-[49]" 
          onClick={() => setShowTOC(false)} 
        />
      )}
      {/* PaperSidebar backdrop - works in both fullscreen and non-fullscreen */}
      {showPaperSidebar && (
        <div 
          className="fixed inset-0 bg-black/20 z-[49]" 
          onClick={() => setShowPaperSidebar(false)} 
        />
      )}

      <div 
        ref={scrollContainerRef}
        className={`flex-1 overflow-y-auto bg-gray-50 relative z-0 ${isFullscreen && showNoteEditor ? 'mr-96' : ''} ${isFullscreen && showNotesSidebar ? 'mr-[600px]' : ''} ${isFullscreen && chatMode ? 'mr-[600px]' : ''} ${isFullscreen && showTOC ? 'mr-80' : ''} ${!isFullscreen && showPaperSidebar ? 'mr-[36rem]' : ''} ${!isFullscreen && showTOC ? 'mr-80' : ''}`}
      >
        {loading && (
          <div className="p-8 text-center text-gray-600">Loading PDF...</div>
        )}
        {error && (
          <div className="p-8 text-center text-red-600">
            Error loading PDF: {error}
          </div>
        )}
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={<div className="p-8 text-center">Loading PDF...</div>}
          className="flex flex-col items-center"
        >
          {renderPages()}
        </Document>
      </div>

      {/* Floating annotation form */}
      {
        floatingFormData && (
          <FloatingAnnotationForm
            paperId={paperId}
            coordinateData={floatingFormData.coordinates}
            position={floatingFormData.position}
            annotation={editingAnnotation}
            highlightedText={floatingFormData.highlightedText}
            selectionData={floatingFormData.selectionData}
            onCancel={handleFloatingFormClose}
            onSuccess={handleFloatingFormSuccess}
          />
        )
      }
    </div >
  );
}

