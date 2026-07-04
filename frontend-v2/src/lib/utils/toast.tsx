import { toast } from 'sonner';

export const toastSuccess = (message: string, description?: string) =>
  toast.success(message, { description });

export const toastError = (message: string, description?: string) =>
  toast.error(message, { description });

export const toastInfo = (message: string, description?: string) =>
  toast.info(message, { description });

export const toastWarning = (message: string, description?: string) =>
  toast.warning(message, { description });

/** Dismiss a toast by ID. */
export const dismissToast = (id: string | number) => toast.dismiss(id);

/* ── Error-code-to-message mapping for AI provider errors ─────────────── */

const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  no_provider: {
    title: 'AI provider not configured',
    description: 'Add an API key in Settings to use AI features.',
  },
  auth: {
    title: 'Invalid API key',
    description: 'Your AI provider key is invalid or expired. Check your Settings.',
  },
  rate_limit: {
    title: 'Rate limit reached',
    description: 'The AI provider is rate-limiting requests. Wait a moment and try again.',
  },
  insufficient_balance: {
    title: 'Insufficient credits',
    description:
      'Your AI provider key does not have enough credits. Add credits or switch providers in Settings.',
  },
  provider_unavailable: {
    title: 'Provider unavailable',
    description: 'The AI provider server is down or unreachable. Try again later.',
  },
  timeout: {
    title: 'Request timed out',
    description: 'The AI provider took too long to respond. Try again.',
  },
  network: {
    title: 'Network error',
    description: 'Could not reach the AI provider. Check your connection.',
  },
  internal: {
    title: 'Something went wrong',
    description: 'An unexpected error occurred. Please try again.',
  },
};

export function toastChatError(
  code: string,
  customMessage?: string,
): string | number {
  // Detect balance/quota issues from the message regardless of error code
  // (backend can send them under rate_limit or auth codes).
  const isBalanceIssue =
    customMessage &&
    /402|insufficient.*(balance|quota)|quota|billing|insufficient_quota/i.test(
      customMessage,
    );

  if (isBalanceIssue) {
    return customToast(
      'Insufficient credits',
      'Your AI provider key does not have enough credits for this operation. Add credits or switch providers in Settings.',
      'balance',
    );
  }

  const mapped = ERROR_MESSAGES[code];
  if (!mapped) {
    return toast.error(customMessage ?? 'Chat error');
  }
  return customToast(mapped.title, mapped.description, 'error');
}

/* ── Error-type-specific helpers ──────────────────────────────────────── */

export function toastInsufficientBalance(description?: string): string | number {
  return customToast(
    'Insufficient credits',
    description ??
      'Your AI provider key does not have enough credits for this operation. Add credits or switch providers in Settings.',
    'error',
  );
}

export function toastProcessingFailed(description?: string): string | number {
  return customToast(
    'AI processing failed',
    description ?? 'Some AI steps could not complete. Check your provider settings and try again.',
    'error',
  );
}

/* ── Custom click-to-dismiss toast ────────────────────────────────────── */

type IntentVariant = 'error' | 'balance';

function customToast(title: string, description: string, variant: IntentVariant): string | number {
  return toast.custom(
    (id) => (
      <button
        type="button"
        onClick={() => toast.dismiss(id)}
        className={`
          flex items-start gap-2.5 w-full
          rounded-[0.625rem] border p-3
          shadow-[var(--shadow-elevated)]
          bg-[var(--white)] text-left
          cursor-pointer
          transition-opacity duration-200
          hover:opacity-85
          ${variant === 'balance' ? 'border-[#f59e0b40]' : 'border-[var(--border)]'}
        `}
      >
        <span
          className="mt-0.5 shrink-0 size-[1.125rem] rounded-full flex items-center justify-center text-[0.625rem] font-bold leading-none"
          style={{
            background:
              variant === 'balance' ? '#f59e0b18' : 'rgba(209,46,62,0.12)',
            color: variant === 'balance' ? '#d97706' : 'var(--destructive)',
          }}
        >
          {variant === 'balance' ? '!' : '✕'}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="text-[0.875rem] font-semibold leading-tight"
            style={{
              color: variant === 'balance' ? '#d97706' : 'var(--destructive)',
            }}
          >
            {title}
          </p>
          <p className="text-[0.8125rem] font-normal leading-snug mt-0.5 text-[var(--muted-foreground)]">
            {description}
          </p>
        </div>
      </button>
    ),
    { duration: 8000 },
  );
}
