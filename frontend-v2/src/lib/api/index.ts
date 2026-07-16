export { api, fetchApi, ApiError } from './client';
export type { } from './client';

export { papersApi } from './papers';
export type {
  Paper,
  PaperCreate,
  PaperListResponse,
  PaperListFilters,
  PaperReference,
  PaperUploadResponse,
  BatchIngestionResponse,
  RelatedPaperExternal,
  RelatedPapersResponse,
  CitationGraph,
  CitationGraphNode,
  CitationGraphEdge,
  Citation,
  ReadingStatus,
  PaperPriority,
  ReadingSession,
  Bookmark,
  Tag as PaperTag,
} from './papers';

export { annotationsApi } from './annotations';
export type { Annotation, AnnotationCreate, AnnotationUpdate } from './annotations';

export { chatApi } from './chat';
export type {
  ChatMessage,
  ChatSession,
  ChatRequest,
  ChatResponse,
  ChatReferences,
  ReferenceItem,
  ThreadRequest,
  ThreadResponse,
} from './chat';

export { multiChatApi } from './multi-chat';
export type {
  PaperSummary,
  MultiChatMessage,
  MultiChatSession,
  MultiChatRequest,
} from './multi-chat';

export { searchApi } from './search';
export type { SearchRequest, SearchResultItem, SearchResponse } from './search';

export { groupsApi } from './groups';
export type { Group, GroupCreate, GroupUpdate } from './groups';

export { tagsApi } from './tags';
export type { Tag, TagListResponse } from './tags';

export { aiFeaturesApi } from './aiFeatures';
export type { SummaryResponse, FindingsResponse, ReadingGuideResponse } from './aiFeatures';

export { exportApi } from './export';
export type { ExportRequest, CitationExportRequest } from './export';

export { paperSharingApi, groupSharingApi } from './sharing';
export type { SharePermission, ShareRecipient, ShareListResponse } from './sharing';

export { statisticsApi } from './statistics';
export type { ReadingStatistics, ReadingStreak } from './statistics';

export { huggingfaceApi } from './huggingface';
export type {
  HFAuthor,
  HFSubmittedBy,
  HFOrganization,
  HFPaperCore,
  HFPaperItem,
  HFDailyPapersResponse,
} from './huggingface';

export { userAiSettingsApi } from './userAiSettings';
export type {
  UserAiSettings,
  UserAiSettingsUpdate,
  ProviderInfo,
  ModelInfo,
  ProviderTestRequest,
  ProviderTestResponse,
} from './userAiSettings';
export { userAiProvidersApi } from './userAiProviders';
export type { UserAiProvider, UserAiProviderCreate, UserAiProviderUpdate } from './userAiProviders';

export { deepResearchApi } from './deepResearch';
export type {
  DeepResearchStatus,
  CitedSource,
  DeepResearchSession as DeepResearchSessionType,
  DeepResearchSessionDetail as DeepResearchSessionDetailType,
} from './deepResearch';

export { discoveryApi } from './discovery';
export type {
  DiscoverySearchFilters,
  DiscoverySearchRequest,
  DiscoveredPaperPreview,
  SourceSearchResult,
  DiscoverySearchResponse,
  DiscoverySourceInfo,
  DiscoverySourcesResponse,
  AddToLibraryResponse,
  BatchAddToLibraryRequest,
  BatchAddToLibraryResponse,
  CitationExplorerRequest,
  CitationExplorerResponse,
  RecommendationRequest,
  RecommendationResponse,
  QueryUnderstanding,
  SearchOverview,
  PaperCluster,
  ClusteringResult,
  PaperRelevanceExplanation,
  RelevanceExplanations,
  AISearchRequest,
  AISearchResponse,
  DiscoverySessionCreate,
  DiscoverySession,
  DiscoverySessionDetail,
} from './discovery';
