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

/** Codes that signal a recoverable/transient condition — warning intent;
 * everything else is an error. */
const WARNING_CODES = new Set(['rate_limit', 'insufficient_balance', 'timeout']);

export function toastChatError(code: string, customMessage?: string): string | number {
  // Detect balance/quota issues from the message regardless of error code
  // (backend can send them under rate_limit or auth codes).
  const isBalanceIssue =
    customMessage &&
    /402|insufficient.*(balance|quota)|quota|billing|insufficient_quota/i.test(customMessage);

  if (isBalanceIssue) {
    return toastInsufficientBalance();
  }

  const mapped = ERROR_MESSAGES[code];
  if (!mapped) {
    return toast.error(customMessage ?? 'Chat error');
  }
  const show = WARNING_CODES.has(code) ? toast.warning : toast.error;
  return show(mapped.title, { description: mapped.description, duration: 8000 });
}

/* ── Error-type-specific helpers ──────────────────────────────────────── */

export function toastInsufficientBalance(description?: string): string | number {
  return toast.warning('Insufficient credits', {
    description:
      description ??
      'Your AI provider key does not have enough credits for this operation. Add credits or switch providers in Settings.',
    duration: 8000,
  });
}

export function toastProcessingFailed(description?: string): string | number {
  return toast.error('AI processing failed', {
    description:
      description ?? 'Some AI steps could not complete. Check your provider settings and try again.',
    duration: 8000,
  });
}
