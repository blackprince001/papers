import { ZoomIn, ZoomOut, RotateCcw, Maximize, Minimize, List, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Highlighter, StickyNote, MessageSquare, BookOpen, Flag, PanelRightClose } from 'lucide-react';
import { Button } from './Button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { BookmarkButton } from './BookmarkButton';
import type { UseMutationResult } from '@tanstack/react-query';

interface PDFToolbarProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  currentPage: number;
  numPages: number | null;
  onPageChange: (page: number) => void;
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
  showTOC: boolean;
  onTOCToggle: () => void;
  highlightMode: boolean;
  onHighlightModeToggle: () => void;
  noteMode: boolean;
  onNoteModeToggle: () => void;
  chatMode: boolean;
  onChatModeToggle: () => void;
  showNotesSidebar: boolean;
  onNotesSidebarToggle: () => void;
  showPaperSidebar: boolean;
  onPaperSidebarToggle: () => void;
  onFirstPage: () => void;
  onLastPage: () => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  // Progress/Status controls
  paperId?: number;
  readingStatus?: 'not_started' | 'in_progress' | 'read' | 'archived';
  onReadingStatusChange?: (status: 'not_started' | 'in_progress' | 'read' | 'archived') => void;
  readingStatusMutation?: UseMutationResult<any, Error, 'not_started' | 'in_progress' | 'read' | 'archived', unknown>;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  onPriorityChange?: (priority: 'low' | 'medium' | 'high' | 'critical') => void;
  priorityMutation?: UseMutationResult<any, Error, 'low' | 'medium' | 'high' | 'critical', unknown>;
  onBookmarkCreated?: () => void;
}

export function PDFToolbar({
  zoom,
  onZoomChange,
  currentPage,
  numPages,
  onPageChange,
  isFullscreen,
  onFullscreenToggle,
  showTOC,
  onTOCToggle,
  highlightMode,
  onHighlightModeToggle,
  noteMode,
  onNoteModeToggle,
  chatMode,
  onChatModeToggle,
  showNotesSidebar,
  onNotesSidebarToggle,
  showPaperSidebar,
  onPaperSidebarToggle,
  onFirstPage,
  onLastPage,
  onPreviousPage,
  onNextPage,
  paperId,
  readingStatus,
  onReadingStatusChange,
  readingStatusMutation,
  priority,
  onPriorityChange,
  priorityMutation,
  onBookmarkCreated,
}: PDFToolbarProps) {
  const handleZoomIn = () => {
    onZoomChange(Math.min(zoom + 0.25, 3));
  };

  const handleZoomOut = () => {
    onZoomChange(Math.max(zoom - 0.25, 0.5));
  };

  const handleZoomReset = () => {
    onZoomChange(1);
  };

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value >= 1 && value <= (numPages || 1))
    {
      onPageChange(value);
    }
  };

  // Button style for non-fullscreen mode: deeper blue background with white text
  const buttonClass = isFullscreen ? '' : 'bg-blue-31 text-white hover:bg-blue-35';

  return (
    <div className={`sticky top-0 z-10 flex items-center gap-2 p-2 flex-wrap flex-shrink-0 ${isFullscreen
      ? 'bg-white border-b border-gray-200'
      : 'bg-blue-14 border-b border-blue-31'
      }`}>
      {/* Zoom Controls */}
      <div className={`flex items-center gap-1 border-r pr-2 ${isFullscreen ? 'border-gray-200' : 'border-blue-31'}`}>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleZoomOut}
          disabled={zoom <= 0.5}
          aria-label="Zoom out"
          className={`h-8 w-8 p-0 ${buttonClass}`}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className={`text-sm min-w-[60px] text-center ${isFullscreen ? 'text-gray-700' : 'text-blue-38'}`}>
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleZoomIn}
          disabled={zoom >= 3}
          aria-label="Zoom in"
          className={`h-8 w-8 p-0 ${buttonClass}`}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleZoomReset}
          aria-label="Reset zoom"
          className={`h-8 w-8 p-0 ${buttonClass}`}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      {/* Page Navigation */}
      <div className={`flex items-center gap-1 border-r pr-2 ${isFullscreen ? 'border-gray-200' : 'border-blue-31'}`}>
        <Button
          variant="ghost"
          size="sm"
          onClick={onFirstPage}
          disabled={currentPage <= 1}
          aria-label="First page"
          className={`h-8 w-8 p-0 ${buttonClass}`}
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onPreviousPage}
          disabled={currentPage <= 1}
          aria-label="Previous page"
          className={`h-8 w-8 p-0 ${buttonClass}`}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-1 px-2">
          <input
            type="number"
            min="1"
            max={numPages || 1}
            value={currentPage}
            onChange={handlePageInputChange}
            className={`w-16 px-2 py-1 text-sm border rounded text-center focus:outline-none focus:ring-2 focus:ring-corca-blue-medium ${isFullscreen ? 'border-gray-300 bg-white' : 'border-blue-31 bg-blue-14'}`}
          />
          <span className={`text-sm ${isFullscreen ? 'text-gray-600' : 'text-blue-38'}`}>/ {numPages || '?'}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onNextPage}
          disabled={currentPage >= (numPages || 1)}
          aria-label="Next page"
          className={`h-8 w-8 p-0 ${buttonClass}`}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onLastPage}
          disabled={currentPage >= (numPages || 1)}
          aria-label="Last page"
          className={`h-8 w-8 p-0 ${buttonClass}`}
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Highlight Tool Toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onHighlightModeToggle}
        title={highlightMode ? 'Disable Highlight Tool' : 'Enable Highlight Tool'}
        className={`h-8 px-2 ${highlightMode ? 'bg-yellow-100 text-yellow-700' : buttonClass}`}
      >
        <Highlighter className="h-4 w-4 mr-1" />
        <span className="text-xs">Highlight</span>
      </Button>

      {/* Note Tool Toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onNoteModeToggle}
        title={noteMode ? 'Close Note Editor' : 'Open Note Editor'}
        className={`h-8 px-2 ${noteMode ? 'bg-corca-blue-light text-gray-700' : buttonClass}`}
      >
        <StickyNote className="h-4 w-4 mr-1" />
        <span className="text-xs">Note</span>
      </Button>

      {/* TOC Toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onTOCToggle}
        title="Table of Contents"
        className={`h-8 px-2 ${showTOC ? 'bg-corca-blue-light text-gray-700' : buttonClass}`}
      >
        <List className="h-4 w-4 mr-1" />
        <span className="text-xs">TOC</span>
      </Button>

      {/* Notes Sidebar Toggle (Fullscreen only) */}
      {isFullscreen && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onNotesSidebarToggle}
          title={showNotesSidebar ? 'Close Notes' : 'Open Notes'}
          className={`h-8 px-2 ${showNotesSidebar ? 'bg-corca-blue-light text-gray-700' : ''}`}
        >
          <StickyNote className="h-4 w-4 mr-1" />
          <span className="text-xs">Notes</span>
        </Button>
      )}

      {/* Chat Toggle */}
      <div className={`border-r pr-2 ${isFullscreen ? 'border-gray-200' : 'border-blue-31'}`}>
        <Button
          variant="ghost"
          size="sm"
          onClick={onChatModeToggle}
          title={chatMode ? 'Close Chat' : 'Open Chat'}
          className={`h-8 px-2 ${chatMode ? 'bg-corca-blue-light text-gray-700' : buttonClass}`}
        >
          <MessageSquare className="h-4 w-4 mr-1" />
          <span className="text-xs">Chat</span>
        </Button>
      </div>

      {/* Paper Sidebar Toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onPaperSidebarToggle}
        title={showPaperSidebar ? 'Close Sidebar' : 'Open Sidebar'}
        className={`h-8 px-2 ${showPaperSidebar ? 'bg-corca-blue-light text-gray-700' : buttonClass}`}
      >
        <PanelRightClose className="h-4 w-4 mr-1" />
        <span className="text-xs">Sidebar</span>
      </Button>

      {/* Reading Status Selector */}
      {readingStatus !== undefined && onReadingStatusChange && (
        <Select
          value={readingStatus || 'not_started'}
          onValueChange={(value: 'not_started' | 'in_progress' | 'read' | 'archived' | null) => {
            if (value !== null)
            {
              onReadingStatusChange(value);
              readingStatusMutation?.mutate(value);
            }
          }}
          disabled={readingStatusMutation?.isPending}
        >
          <SelectTrigger className={`h-8 w-[50px] text-xs flex items-center gap-1.5 ${isFullscreen ? '' : 'bg-blue-14 border-blue-31'}`}>
            <BookOpen className="h-3 w-3 flex-shrink-0" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="not_started">Not Started</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="read">Read</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      )}

      {/* Priority Selector */}
      {priority !== undefined && onPriorityChange && (
        <Select
          value={priority || 'low'}
          onValueChange={(value: 'low' | 'medium' | 'high' | 'critical' | null) => {
            if (value !== null)
            {
              onPriorityChange(value);
              priorityMutation?.mutate(value);
            }
          }}
          disabled={priorityMutation?.isPending}
        >
          <SelectTrigger className={`h-8 w-[50px] text-xs flex items-center gap-1.5 ${isFullscreen ? '' : 'bg-blue-14 border-blue-31'}`}>
            <Flag className="h-3 w-3 flex-shrink-0" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      )}

      {/* Bookmark Button */}
      {paperId !== undefined && (
        <BookmarkButton
          paperId={paperId}
          currentPage={currentPage}
          onBookmarkCreated={onBookmarkCreated}
        />
      )
      }

      {/* Fullscreen Toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onFullscreenToggle}
        title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
        className={`h-8 w-8 p-0 ml-auto ${buttonClass}`}
      >
        {isFullscreen ? (
          <Minimize className="h-4 w-4" />
        ) : (
          <Maximize className="h-4 w-4" />
        )}
      </Button>
    </div >
  );
}

