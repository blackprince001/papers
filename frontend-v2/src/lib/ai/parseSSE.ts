import { logger } from '../logger';

/**
 * Extended SSE event shape.
 * Supports both the chat streaming format and the event-based discovery format.
 */
export interface SSEEvent {
  type: string;
  /** Server-supplied resume cursor from the SSE id field. */
  id?: string;
  [key: string]: unknown;
}

export interface ParseSSEOptions {
  signal?: AbortSignal;
  /** Max ms between successive data events before we treat it as a timeout. 0 = no timeout. */
  timeoutMs?: number;
  /** Max auto-retries on connection drop. 0 = no retry. */
  maxRetries?: number;
  /** Called when a retry is about to happen, with the retry count (1-based) */
  onRetry?: (attempt: number, error: Error) => void;
  /** Create a fresh response for a retry. Required when maxRetries > 0. */
  reconnect?: () => Promise<Response>;
}

/** Default timeout: 60s of silence = stale connection */
const DEFAULT_TIMEOUT_MS = 60_000;
const RETRY_BASE_DELAY_MS = 1000;

/**
 * Find the position of the first blank line that separates SSE events.
 * Handles both \n\n and \r\n\r\n.
 */
function findEventSeparator(buffer: string): number {
  const lf = buffer.indexOf('\n\n');
  const crlf = buffer.indexOf('\r\n\r\n');
  if (lf === -1) return crlf;
  if (crlf === -1) return lf;
  return Math.min(lf, crlf);
}

/**
 * Sleep for a given duration (used for retry backoff).
 */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Unified SSE parser that works with both `data: {...}` and
 * `event:\ndata:` formats.
 *
 * Yields parsed SSE events as `SSEEvent` objects.
 * Supports AbortSignal, timeout detection, and auto-retry.
 */
export async function* parseSSE(
  response: Response,
  options: ParseSSEOptions = {},
): AsyncGenerator<SSEEvent, void, unknown> {
  const {
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = 0,
    onRetry,
  } = options;

  let retriesDone = 0;

  while (true) {
    const controller = new AbortController();

    // Link the external signal so we abort when the caller wants to cancel
    const onExternalAbort = () => controller.abort();
    signal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

      const resetTimeout = () => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (timeoutMs > 0) {
          timeoutTimer = setTimeout(() => {
            controller.abort();
            void reader.cancel();
          }, timeoutMs);
        }
      };

      try {
        resetTimeout();
        while (true) {
          if (signal?.aborted || controller.signal.aborted) {
            if (signal?.aborted) {
              // External cancellation, not a timeout — stop without retry
              return;
            }
            // Timeout or internal abort
            throw new Error('Stream timed out');
          }

          const { done, value } = await reader.read();
          if (done) {
            // Process any remaining data in buffer
            if (buffer.trim()) {
              const events = processBlock(buffer, resetTimeout);
              for (const evt of events) {
                yield evt;
              }
            }
            break;
          }

          resetTimeout();

          buffer += decoder.decode(value, { stream: true });

          let sepIdx: number;
          while ((sepIdx = findEventSeparator(buffer)) !== -1) {
            const block = buffer.slice(0, sepIdx);
            buffer = buffer.slice(sepIdx).replace(/^(\r?\n){1,2}/, '');
            const events = processBlock(block, resetTimeout);
            for (const evt of events) {
              yield evt;
            }
          }
        }
      } finally {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        reader.releaseLock();
        signal?.removeEventListener('abort', onExternalAbort);
      }

      // Success — exited without error
      return;
    } catch (err) {
      signal?.removeEventListener('abort', onExternalAbort);

      if (signal?.aborted) {
        // External cancel — no retry
        return;
      }

      retriesDone++;
      if (retriesDone > maxRetries || !options.reconnect) {
        throw err;
      }

      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, retriesDone - 1);
      onRetry?.(retriesDone, err as Error);
      logger.warn(
        `SSE stream error, retrying (${retriesDone}/${maxRetries}) after ${delay}ms:`,
        err,
      );
      await sleep(delay);
      response = await options.reconnect();
    }
  }
}

/**
 * Process a single SSE block (between blank lines).
 * Returns zero or more parsed events.
 */
function processBlock(
  block: string,
  resetTimeout?: () => void,
): SSEEvent[] {
  const events: SSEEvent[] = [];
  let eventType = '';
  let eventId: string | undefined;
  const dataLines: string[] = [];

  for (const rawLine of block.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line) continue;

    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith('id:')) {
      eventId = line.slice(3).trim();
    } else if (line.startsWith('data:')) {
      // data: can have an optional space after the colon
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }

  if (dataLines.length === 0) return events;

  const rawData = dataLines.join('\n');

  try {
    const parsed = JSON.parse(rawData);
    resetTimeout?.();

    if (eventType) {
      // Event-type format: use event as the type field
      events.push({ ...parsed, ...(eventId ? { id: eventId } : {}), type: eventType });
    } else if (typeof parsed === 'object' && parsed !== null && 'type' in parsed) {
      // Already has a type field
      events.push({ ...(eventId ? { id: eventId } : {}), ...(parsed as SSEEvent) });
    } else {
      // No explicit type — wrap with a default
      events.push({ type: 'data', ...(eventId ? { id: eventId } : {}), ...(parsed as Record<string, unknown>) });
    }
  } catch (e) {
    // Could be non-JSON data or a partial event — skip silently
    logger.warn('Failed to parse SSE data:', rawData.slice(0, 200), e);
  }

  return events;
}

export default parseSSE;
