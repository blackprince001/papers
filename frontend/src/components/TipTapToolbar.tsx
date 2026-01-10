import { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code2,
  Minus,
  Link,
  Undo,
  Redo,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TipTapToolbarProps {
  editor: Editor | null;
  className?: string;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  icon: React.ReactNode;
  className?: string;
}

function ToolbarButton({
  onClick,
  isActive = false,
  disabled = false,
  title,
  icon,
  className,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'p-1.5 rounded transition-colors',
        'hover:bg-gray-100',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        isActive && 'bg-gray-200 text-gray-700',
        !isActive && 'text-gray-600',
        className
      )}
    >
      {icon}
    </button>
  );
}

export function TipTapToolbar({ editor, className }: TipTapToolbarProps) {
  if (!editor) {
    return null;
  }

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    if (url === null) {
      return;
    }

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div
      className={cn(
        'flex items-center gap-1 p-2 border-b border-gray-200 bg-gray-50 flex-wrap',
        className
      )}
    >
      {/* Text Formatting */}
      <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          disabled={!editor.can().chain().focus().toggleBold().run()}
          title="Bold (Ctrl+B)"
          icon={<Bold className="h-4 w-4" />}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          title="Italic (Ctrl+I)"
          icon={<Italic className="h-4 w-4" />}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive('strike')}
          disabled={!editor.can().chain().focus().toggleStrike().run()}
          title="Strikethrough"
          icon={<Strikethrough className="h-4 w-4" />}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCode().run()}
          isActive={editor.isActive('code')}
          disabled={!editor.can().chain().focus().toggleCode().run()}
          title="Inline code"
          icon={<Code className="h-4 w-4" />}
        />
      </div>

      {/* Headings */}
      <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive('heading', { level: 1 })}
          title="Heading 1"
          icon={<Heading1 className="h-4 w-4" />}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
          icon={<Heading2 className="h-4 w-4" />}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive('heading', { level: 3 })}
          title="Heading 3"
          icon={<Heading3 className="h-4 w-4" />}
        />
      </div>

      {/* Lists */}
      <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          title="Bullet list"
          icon={<List className="h-4 w-4" />}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          title="Ordered list"
          icon={<ListOrdered className="h-4 w-4" />}
        />
      </div>

      {/* Block Elements */}
      <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive('blockquote')}
          title="Blockquote"
          icon={<Quote className="h-4 w-4" />}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          isActive={editor.isActive('codeBlock')}
          title="Code block"
          icon={<Code2 className="h-4 w-4" />}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontal rule"
          icon={<Minus className="h-4 w-4" />}
        />
      </div>

      {/* Links */}
      <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
        <ToolbarButton
          onClick={setLink}
          isActive={editor.isActive('link')}
          title="Add/remove link"
          icon={<Link className="h-4 w-4" />}
        />
      </div>

      {/* History */}
      <div className="flex items-center gap-1">
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().chain().focus().undo().run()}
          title="Undo (Ctrl+Z)"
          icon={<Undo className="h-4 w-4" />}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().chain().focus().redo().run()}
          title="Redo (Ctrl+Y)"
          icon={<Redo className="h-4 w-4" />}
        />
      </div>
    </div>
  );
}

