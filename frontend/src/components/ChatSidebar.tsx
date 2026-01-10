import { ChatPanel } from './ChatPanel';

interface ChatSidebarProps {
  paperId: number;
  onClose: () => void;
}

/**
 * ChatSidebar is a wrapper around ChatPanel that provides
 * the sidebar layout styling. This ensures both ChatSidebar
 * and ChatPanel have identical functionality.
 */
export function ChatSidebar({ paperId, onClose }: ChatSidebarProps) {
  return (
    <div 
      className="fixed inset-y-0 right-0 z-50 w-full md:w-[600px] lg:w-[700px] max-w-full bg-white border-l border-gray-200 shadow-lg flex flex-col"
    >
      <ChatPanel paperId={paperId} onClose={onClose} />
    </div>
  );
}
