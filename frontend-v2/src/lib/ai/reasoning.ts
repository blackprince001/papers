/** Safe labels for allowlisted AI tools. Raw tool names stay at the wire boundary. */
const TOOL_LABELS: Record<string, string> = {
  search_discovery: 'Searching academic sources',
  web_search: 'Searching the web',
  get_recommendations: 'Finding related work',
  discovery_get_paper_details: 'Fetching paper details',
  discovery_get_citations: 'Fetching citations',
  search_authors: 'Searching authors',
  get_author_works: 'Fetching author works',
  get_references: 'Looking up references',
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
  return TOOL_LABELS[tool] ?? 'Working with sources';
}
