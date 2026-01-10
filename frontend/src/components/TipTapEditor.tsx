import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { TipTapToolbar } from './TipTapToolbar';

// Simple helper to check if content is HTML
const isHTML = (content: string): boolean => {
  return /^<[a-z][\s\S]*>/i.test(content.trim());
};

// Simple markdown to HTML converter (basic)
// This maintains backward compatibility with existing markdown notes
const markdownToHTML = (markdown: string): string => {
  if (!markdown || isHTML(markdown)) return markdown;
  
  // Very basic markdown to HTML conversion
  // For production, consider using a proper library like marked or remark
  let html = markdown
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/`(.*?)`/gim, '<code>$1</code>')
    .replace(/\n/gim, '<br>');
  
  // Wrap in paragraph if not already wrapped
  if (!html.startsWith('<')) {
    html = '<p>' + html + '</p>';
  }
  
  return html;
};

interface TipTapEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  editable?: boolean;
  autoFocus?: boolean;
  showToolbar?: boolean;
}

export function TipTapEditor({
  content,
  onChange,
  placeholder = 'Start typing...',
  className = '',
  editable = true,
  autoFocus = false,
  showToolbar = false,
}: TipTapEditorProps) {
  // Convert markdown to HTML for initial content (backward compatibility)
  const initialContent = content
    ? (isHTML(content) ? content : markdownToHTML(content))
    : '';

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Configure markdown-friendly features
        heading: {
          levels: [1, 2, 3],
        },
        // Disable default link to use our custom Link extension
        link: false,
      }),
      Placeholder.configure({
        placeholder,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-gray-700 underline cursor-pointer',
        },
        validate: (url) => {
          try {
            // Allow empty URLs (for removal) and valid URLs
            if (!url) return true;
            new URL(url);
            return /^https?:\/\//.test(url);
          } catch {
            // If URL constructor fails, check if it's a valid protocol
            return /^https?:\/\//.test(url);
          }
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Underline,
    ],
    content: initialContent,
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none focus:outline-none text-sm',
          'prose-headings:font-semibold prose-headings:text-gray-900 prose-headings:text-sm prose-h1:text-sm',
          'prose-p:text-gray-700 prose-p:leading-relaxed prose-p:text-sm',
          'prose-ul:text-gray-700 prose-ol:text-gray-700 prose-ul:text-sm prose-ol:text-sm',
          'prose-li:text-gray-700 prose-li:text-sm',
          'prose-code:text-sm prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded',
          'prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:overflow-x-auto prose-pre:text-sm',
          'prose-a:text-gray-700 prose-a:no-underline hover:prose-a:underline prose-a:text-sm',
          'prose-strong:text-gray-900 prose-strong:font-semibold prose-strong:text-sm',
          'prose-em:text-gray-700 prose-em:text-sm',
          'prose-blockquote:border-l-4 prose-blockquote:border-gray-300 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-sm',
          'prose-hr:border-gray-300',
        ),
      },
    },
  });

  // Sync content with editor, converting markdown to HTML if needed
  useEffect(() => {
    if (editor && content !== undefined) {
      const currentHTML = editor.getHTML();
      // Convert markdown to HTML if needed (for backward compatibility with existing markdown notes)
      const htmlContent = isHTML(content) ? content : markdownToHTML(content);
      
      // Normalize HTML for comparison (Tiptap may add extra whitespace/formatting)
      const normalizeHTML = (html: string) => html.trim().replace(/\s+/g, ' ');
      const normalizedCurrent = normalizeHTML(currentHTML);
      const normalizedContent = normalizeHTML(htmlContent);
      
      // Only update if content has actually changed to avoid infinite loops
      if (normalizedCurrent !== normalizedContent && htmlContent) {
        editor.commands.setContent(htmlContent, { emitUpdate: false });
      }
    }
  }, [content, editor]);

  useEffect(() => {
    if (autoFocus && editor && editable) {
      editor.commands.focus();
    }
  }, [editor, autoFocus, editable]);

  if (!editor) {
    return null;
  }

  return (
    <div
      className={cn(
        'w-full rounded-md border border-gray-300 bg-white',
        'focus-within:ring-2 focus-within:ring-corca-blue-medium focus-within:border-transparent',
        editable && 'min-h-[200px]',
        showToolbar && 'flex flex-col',
        className
      )}
    >
      {showToolbar && editable && (
        <TipTapToolbar editor={editor} />
      )}
      <EditorContent
        editor={editor}
        className={cn(
          'p-3 flex-1 text-sm',
          editable && 'min-h-[200px]',
          showToolbar && 'overflow-y-auto'
        )}
      />
    </div>
  );
}

