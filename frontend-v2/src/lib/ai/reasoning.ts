/**
 * Shared reasoning-trace model for the agent surfaces (chat + deep research).
 *
 * Both features stream the same event vocabulary (`thought` / `tool_call` /
 * `tool_result`); this normalizes them into one ordered `Activity[]` that the
 * shared `ReasoningTrace` component renders identically everywhere.
 */

/** One tool the agent invoked, with the argument that summarizes what it did. */
export interface ActivityTool {
  id: number;
  kind: 'tool';
  tool: string;
  argSummary?: string;
  result?: string;
  status: 'running' | 'complete' | 'error';
  timestamp: number;
}

/** A block of the agent's reasoning (deltas merged). */
export interface ActivityThought {
  id: number;
  kind: 'thought';
  content: string;
  timestamp: number;
}

export type Activity = ActivityTool | ActivityThought;

const TOOL_ERROR = /^error\b/i;

const TOOL_LABELS: Record<string, string> = {
  // deep research
  search_discovery: 'Searching academic sources',
  web_search: 'Searching the web',
  get_recommendations: 'Finding related work',
  discovery_get_paper_details: 'Fetching paper details',
  discovery_get_citations: 'Fetching citations',
  search_authors: 'Searching authors',
  get_author_works: 'Fetching author works',
  get_references: 'Looking up references',
  // shared library tools
  semantic_search: 'Searching your library',
  search_papers: 'Searching your papers',
  get_paper_content: 'Reading a paper',
  get_paper_metadata: 'Reading paper details',
  get_citations: 'Looking up citations',
  get_annotations: 'Fetching annotations',
  get_notes: 'Fetching notes',
  get_chat_history: 'Checking earlier turns',
  get_chat_sessions: 'Listing sessions',
  view_figures: 'Reading figures',
};

export function toolLabel(tool?: string): string {
  if (!tool) return 'Working';
  return TOOL_LABELS[tool] ?? tool.replace(/_/g, ' ');
}

// The single most descriptive argument — usually the search query — so each
// step reads like "Searching academic sources: 'long-context retrieval'".
const ARG_KEYS = [
  'query', 'q', 'search_query', 'question', 'term', 'name',
  'title', 'author', 'external_id', 'paper_id', 'id',
];

export function summarizeArgs(args?: Record<string, unknown>): string | undefined {
  if (!args || typeof args !== 'object') return undefined;
  for (const k of ARG_KEYS) {
    const v = args[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  for (const v of Object.values(args)) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

interface ChatThought {
  content: string;
  timestamp: number;
}
interface ChatToolCall {
  tool: string;
  arguments: Record<string, unknown>;
  timestamp: number;
}
interface ChatToolResult {
  tool: string;
  result: string;
  timestamp: number;
}

/**
 * Adapt the chat stream's separate `thoughts` / `toolCalls` / `toolResults`
 * arrays into one ordered `Activity[]`, so chat renders the same trace as deep
 * research. Each tool call is matched to the next unused result for that tool.
 */
export function buildChatActivity(
  thoughts: ChatThought[],
  toolCalls: ChatToolCall[],
  toolResults: ChatToolResult[],
): Activity[] {
  const items: Activity[] = [];

  thoughts.forEach((t, i) => {
    if (t.content.trim()) {
      items.push({ id: 1_000_000 + i, kind: 'thought', content: t.content, timestamp: t.timestamp });
    }
  });

  const usedResults = new Set<number>();
  toolCalls.forEach((c, i) => {
    let result: string | undefined;
    let status: ActivityTool['status'] = 'running';
    const ri = toolResults.findIndex((r, idx) => r.tool === c.tool && !usedResults.has(idx));
    if (ri >= 0) {
      usedResults.add(ri);
      result = toolResults[ri].result;
      status = TOOL_ERROR.test(result.trim()) ? 'error' : 'complete';
    }
    items.push({
      id: 2_000_000 + i,
      kind: 'tool',
      tool: c.tool,
      argSummary: summarizeArgs(c.arguments),
      result,
      status,
      timestamp: c.timestamp,
    });
  });

  return items.sort((a, b) => a.timestamp - b.timestamp);
}
