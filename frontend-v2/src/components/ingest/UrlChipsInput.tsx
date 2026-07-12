import { useState } from 'react';
import { CloseIcon, GlobeIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

const URL_PATTERN = /^https?:\/\/\S+$/i;

function extractUrls(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter((part) => URL_PATTERN.test(part));
}

/**
 * Compact smart input: pasted text is scanned for URLs which become
 * removable chips; Enter commits the current value; Backspace on an empty
 * input pops the last chip.
 */
export function UrlChipsInput({
  chips,
  onChange,
  maxChips = 5,
  disabled = false,
}: {
  chips: string[];
  onChange: (chips: string[]) => void;
  maxChips?: number;
  disabled?: boolean;
}) {
  const [value, setValue] = useState('');

  const addUrls = (urls: string[]) => {
    if (urls.length === 0) return false;
    const next = [...new Set([...chips, ...urls])].slice(0, maxChips);
    onChange(next);
    return true;
  };

  const commitValue = () => {
    const urls = extractUrls(value);
    if (addUrls(urls)) setValue('');
  };

  return (
    <div
      className={cn(
        'flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-(--border) bg-(--white) px-2 py-1.5',
        'focus-within:border-(--foreground) focus-within:ring-2 focus-within:ring-(--foreground)/10',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <GlobeIcon size="sm" className="shrink-0 text-(--muted-foreground)" />
      {chips.map((chip) => (
        <span
          key={chip}
          className="inline-flex max-w-64 items-center gap-1 rounded-md bg-(--muted) px-1.5 py-0.5 text-caption"
          title={chip}
        >
          <span className="truncate">{chip.replace(/^https?:\/\//i, '')}</span>
          <button
            type="button"
            onClick={() => onChange(chips.filter((c) => c !== chip))}
            aria-label={`Remove ${chip}`}
            className="shrink-0 text-(--muted-foreground) transition-colors hover:text-(--foreground)"
          >
            <CloseIcon size="xs" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={value}
        disabled={disabled}
        placeholder={
          chips.length === 0
            ? 'Paste paper links — arXiv, ACM, IEEE, OpenReview…'
            : chips.length >= maxChips
              ? `Max ${maxChips} links`
              : 'Add another link…'
        }
        onChange={(event) => setValue(event.target.value)}
        onPaste={(event) => {
          const urls = extractUrls(event.clipboardData.getData('text'));
          if (urls.length > 0) {
            event.preventDefault();
            addUrls(urls);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitValue();
          } else if (event.key === 'Backspace' && value === '' && chips.length > 0) {
            onChange(chips.slice(0, -1));
          }
        }}
        onBlur={commitValue}
        className="min-w-40 flex-1 bg-transparent text-body outline-none placeholder:text-(--muted-foreground)"
      />
    </div>
  );
}
