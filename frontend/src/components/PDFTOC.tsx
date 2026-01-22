import { useState } from 'react';
import { X, ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from './Button';

export interface TOCItem {
  title: string;
  page: number;
  items?: TOCItem[];
}

interface PDFTOCProps {
  items: TOCItem[] | null;
  isOpen: boolean;
  onClose: () => void;
  onItemClick: (page: number) => void;
  currentPage: number;
}

function TOCItemComponent({
  item,
  onItemClick,
  currentPage,
  level = 0
}: {
  item: TOCItem;
  onItemClick: (page: number) => void;
  currentPage: number;
  level?: number;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = item.items && item.items.length > 0;
  const isActive = item.page === currentPage;

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1.5 text-sm cursor-pointer hover:bg-gray-100 rounded ${isActive ? 'bg-corca-blue-light text-gray-700 font-medium' : 'text-gray-700'
          }`}
        style={{ paddingLeft: `${0.5 + level * 1}rem` }}
        onClick={() => {
          onItemClick(item.page);
          if (hasChildren)
          {
            setIsExpanded(!isExpanded);
          }
        }}
      >
        {hasChildren && (
          <span className="w-4 h-4 flex items-center justify-center">
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </span>
        )}
        {!hasChildren && <span className="w-4" />}
        <span className="flex-1 truncate">{item.title}</span>
        <span className="text-xs text-gray-500 ml-2">{item.page}</span>
      </div>
      {hasChildren && isExpanded && (
        <div>
          {item.items!.map((child, index) => (
            <TOCItemComponent
              key={index}
              item={child}
              onItemClick={onItemClick}
              currentPage={currentPage}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function PDFTOC({ items, isOpen, onClose, onItemClick, currentPage }: PDFTOCProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-y-0 right-0 z-[70] w-80 bg-white border-l border-gray-200 shadow-lg flex flex-col"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold">Table of Contents</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 w-8 p-0"
          aria-label="Close table of contents"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {items && items.length > 0 ? (
          <div>
            {items.map((item, index) => (
              <TOCItemComponent
                key={index}
                item={item}
                onItemClick={onItemClick}
                currentPage={currentPage}
              />
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-500 text-sm py-8">
            No table of contents available
          </div>
        )}
      </div>
    </div>
  );
}

