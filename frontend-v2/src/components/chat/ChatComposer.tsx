import { EyeIcon, InsightIcon, MicroscopeIcon, SendIcon } from '@/components/icons';
import { ExpandedInput, type PromptGroup } from '@/components/ExpandedInput';
import { ProviderPicker } from '@/components/ai/ProviderPicker';
import { defaultPrompts } from '@/lib/constants/defaultPrompts';
import { cn } from '@/lib/utils';
import type { ChatController } from '@/hooks/use-chat-controller';

const CHAT_PROMPT_GROUPS: PromptGroup[] = [
  {
    label: 'Comprehension',
    icon: EyeIcon,
    prompts: defaultPrompts
      .filter(p => ['summarize', 'eli5', 'initial-screen'].includes(p.id))
      .map(p => ({ icon: p.icon, text: p.label, prompt: p.content })),
  },
  {
    label: 'Scrutiny',
    icon: MicroscopeIcon,
    prompts: defaultPrompts
      .filter(p => ['critique', 'deep-dive', 'figures-breakdown', 'landscape'].includes(p.id))
      .map(p => ({ icon: p.icon, text: p.label, prompt: p.content })),
  },
  {
    label: 'Deep Knowledge',
    icon: InsightIcon,
    prompts: defaultPrompts
      .filter(p => ['claims-evidence', 'citation-radar', 'reproducibility', 'future-work', 'synthesis'].includes(p.id))
      .map(p => ({ icon: p.icon, text: p.label, prompt: p.content })),
  },
];

interface ChatComposerProps {
  controller: ChatController;
  /** Centres and width-caps the composer to match a centered message column. */
  centered?: boolean;
}

export function ChatComposer({ controller, centered = false }: ChatComposerProps) {
  const {
    paperId, input, setInput, setReferences, handleSend,
    activeProviderId, setActiveProviderId, stream, composerHidden,
  } = controller;

  return (
    <div
      className={cn(
        'shrink-0 grid transition-[grid-template-rows] duration-300 ease-out',
        composerHidden ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
      )}
    >
      {/* overflow only needs to clip while the row is actually collapsing —
          left visible at rest so the mention dropdown and prompts popover
          (which render above the input) aren't cut off. */}
      <div className={composerHidden ? 'overflow-hidden' : 'overflow-visible'}>
        <div
          className={cn(
            'relative z-10 -mt-10 pt-10 px-3 pb-3 pointer-events-none bg-gradient-to-b from-transparent',
            centered ? 'to-(--background)' : 'to-(--panel-surface)',
          )}
        >
          <div className={cn('pointer-events-auto', centered && 'mx-auto w-full max-w-3xl')}>
            <div className="mb-2 flex justify-end">
              <ProviderPicker
                value={activeProviderId}
                onChange={setActiveProviderId}
                className="max-w-56"
              />
            </div>
            <ExpandedInput
              value={input}
              onChange={setInput}
              onSubmit={handleSend}
              placeholder="Ask about this paper... (use @ to mention notes/annotations/papers)"
              submitLabel="Send"
              submitIcon={<SendIcon size="sm" />}
              bordered={false}
              disabled={stream.isActive}
              mentionPaperId={paperId}
              onMentionSelect={(mention) => {
                const refKey = `${mention.type}s` as 'notes' | 'annotations' | 'papers';
                setReferences(prev => ({
                  ...prev,
                  [refKey]: [...(prev[refKey] || []), { id: mention.id, type: mention.type }],
                }));
              }}
              promptsCollapsible
              promptGroups={CHAT_PROMPT_GROUPS}
              onSuggestionClick={(prompt) => setInput(prompt)}
            />
            <p className="text-caption text-(--muted-foreground) px-1 mt-2">
              Press Enter to send, Shift+Enter for newline
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
