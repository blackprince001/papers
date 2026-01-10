import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { annotationsApi } from '@/lib/api/annotations';
import { papersApi } from '@/lib/api/papers';
import { FileText, BookOpen, StickyNote } from 'lucide-react';

export interface MentionItem {
  id: number;
  type: 'note' | 'annotation' | 'paper';
  display: string;
  content?: string;
  title?: string;
}

interface MentionAutocompleteProps {
  paperId: number;
  value: string;
  onChange: (value: string) => void;
  onMentionSelect?: (mention: MentionItem) => void;
  onSend?: () => void;
  placeholder?: string;
  className?: string;
}

export function MentionAutocomplete({
  paperId,
  value,
  onChange,
  onMentionSelect,
  onSend,
  placeholder = 'Type a message...',
  className = '',
}: MentionAutocompleteProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPosition, setMentionPosition] = useState({ start: 0, end: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch annotations (notes and annotations)
  const { data: annotations } = useQuery({
    queryKey: ['annotations', paperId],
    queryFn: () => annotationsApi.list(paperId),
  });

  // Fetch all papers for cross-paper references
  const { data: papersData } = useQuery({
    queryKey: ['papers'],
    queryFn: () => papersApi.list(1, 100),
  });

  // Build mention items from annotations and papers
  const buildMentionItems = useCallback((): MentionItem[] => {
    const items: MentionItem[] = [];

    if (annotations)
    {
      // Add notes
      const notes = annotations.filter((ann) => ann.type === 'note');
      notes.forEach((note) => {
        const page = note.coordinate_data?.page;
        const pageInfo = page ? ` (Page ${page})` : '';
        items.push({
          id: note.id,
          type: 'note',
          display: `Note ${note.id}${pageInfo}`,
          content: note.content,
        });
      });

      // Add annotations
      const annotationsList = annotations.filter((ann) => ann.type === 'annotation');
      annotationsList.forEach((ann) => {
        const page = ann.coordinate_data?.page;
        const pageInfo = page ? ` (Page ${page})` : '';
        const preview = ann.highlighted_text || ann.content.substring(0, 50);
        items.push({
          id: ann.id,
          type: 'annotation',
          display: `Annotation ${ann.id}${pageInfo}: ${preview}...`,
          content: ann.content,
        });
      });
    }

    // Add other papers (exclude current paper)
    if (papersData?.papers)
    {
      papersData.papers
        .filter((p) => p.id !== paperId)
        .forEach((paper) => {
          items.push({
            id: paper.id,
            type: 'paper',
            display: `Paper: ${paper.title}`,
            title: paper.title,
          });
        });
    }

    return items;
  }, [annotations, papersData, paperId]);

  const allMentionItems = buildMentionItems();

  // Filter mention items based on query
  const filteredItems = mentionQuery
    ? allMentionItems.filter((item) =>
      item.display.toLowerCase().includes(mentionQuery.toLowerCase())
    )
    : allMentionItems;

  // Handle text change and detect @ mentions
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = newValue.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1)
    {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      // Check if we're still in a mention (no space after @)
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n'))
      {
        setMentionQuery(textAfterAt);
        setMentionPosition({ start: lastAtIndex, end: cursorPos });
        setShowDropdown(true);
        setSelectedIndex(0);
        return;
      }
    }

    setShowDropdown(false);
    setMentionQuery('');
  };

  // Handle mention selection
  const handleMentionSelect = (item: MentionItem) => {
    const beforeMention = value.substring(0, mentionPosition.start);
    const afterMention = value.substring(mentionPosition.end);
    const mentionText = `@${item.type}{${item.id}}`;
    const newValue = beforeMention + mentionText + afterMention;

    onChange(newValue);
    setShowDropdown(false);
    setMentionQuery('');

    // Set cursor position after mention
    setTimeout(() => {
      if (textareaRef.current)
      {
        const newCursorPos = beforeMention.length + mentionText.length;
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        textareaRef.current.focus();
      }
    }, 0);

    onMentionSelect?.(item);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle Ctrl+Enter or Cmd+Enter to send
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter')
    {
      e.preventDefault();
      onSend?.();
      return;
    }

    if (showDropdown && filteredItems.length > 0)
    {
      if (e.key === 'ArrowDown')
      {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
      } else if (e.key === 'ArrowUp')
      {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
      } else if (e.key === 'Enter' && !e.shiftKey)
      {
        e.preventDefault();
        handleMentionSelect(filteredItems[selectedIndex]);
      } else if (e.key === 'Escape')
      {
        setShowDropdown(false);
        setMentionQuery('');
      }
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(event.target as Node)
      )
      {
        setShowDropdown(false);
        setMentionQuery('');
      }
    };

    if (showDropdown)
    {
      // Use a small delay to avoid immediate close
      const timeout = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);

      return () => {
        clearTimeout(timeout);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showDropdown]);

  // Scroll selected item into view
  useEffect(() => {
    if (showDropdown && dropdownRef.current)
    {
      const selectedElement = dropdownRef.current.querySelector(
        `[data-index="${selectedIndex}"]`
      );
      if (selectedElement)
      {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, showDropdown]);

  const getIcon = (type: MentionItem['type']) => {
    switch (type)
    {
      case 'note':
        return <StickyNote className="w-4 h-4" />;
      case 'annotation':
        return <FileText className="w-4 h-4" />;
      case 'paper':
        return <BookOpen className="w-4 h-4" />;
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        onInput={(e) => {
          const target = e.target as HTMLTextAreaElement;
          target.style.height = 'auto';
          target.style.height = target.scrollHeight + 'px';
        }}
        placeholder={placeholder}
        className={`w-full bg-transparent p-0 border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 text-gray-900 placeholder:text-gray-500 resize-none border-none outline-none text-sm min-h-[40px] max-h-[25vh] ${className}`}
        rows={1}
      />

      {showDropdown && filteredItems.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-[100] w-full bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto"
          style={{
            bottom: 'calc(100% + 8px)',
            left: 0,
            right: 0
          }}
        >
          {filteredItems.map((item, index) => (
            <button
              key={`${item.type}-${item.id}`}
              type="button"
              data-index={index}
              onClick={() => handleMentionSelect(item)}
              className={`w-full px-3 py-2 text-left flex items-center gap-2 rounded-lg transition-colors ${index === selectedIndex
                  ? 'bg-corca-blue-light border border-corca-blue-light'
                  : 'hover:bg-gray-50'
                }`}
            >
              <div className="flex-shrink-0 text-gray-600 opacity-60">{getIcon(item.type)}</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-900 truncate">{item.display}</div>
                {item.content && (
                  <div className="text-xs text-gray-500 truncate mt-0.5">{item.content.substring(0, 60)}...</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

