import { UserIcon } from '@/components/icons';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';

export const ASSISTANT_NAME = 'Lumen';

interface MessageAuthorProps {
  role: 'user' | 'assistant';
  name?: string;
  className?: string;
}

export function MessageAuthor({ role, name, className }: MessageAuthorProps) {
  const isAssistant = role === 'assistant';
  return (
    <div className={cn('flex items-center gap-2 mb-1.5', className)}>
      <span className="flex items-center justify-center w-5 h-5 rounded-full overflow-hidden bg-(--muted) text-(--muted-foreground) shrink-0">
        {isAssistant ? (
          <Logo size={20} className="w-5 h-5 object-cover" />
        ) : (
          <UserIcon size="xs" />
        )}
      </span>
      <span className="text-caption font-medium text-(--foreground)">
        {name ?? (isAssistant ? ASSISTANT_NAME : 'You')}
      </span>
    </div>
  );
}

export default MessageAuthor;
