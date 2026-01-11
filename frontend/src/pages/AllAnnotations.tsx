import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { papersApi, type Paper } from '@/lib/api/papers';
import { annotationsApi, type Annotation } from '@/lib/api/annotations';
import { Button } from '@/components/Button';
import { format } from 'date-fns';
import { FileText, BookOpen, StickyNote, Highlighter, Search } from 'lucide-react';
import { AnnotationSkeleton } from '@/components/Skeletons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type FilterType = 'all' | 'annotations' | 'notes';
type SortBy = 'date' | 'paper';

interface AnnotationWithPaper extends Annotation {
  paper: Paper;
}

export default function AllAnnotations() {
  const navigate = useNavigate();
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch all papers
  const { data: papersData, isLoading: papersLoading } = useQuery({
    queryKey: ['all-papers'],
    queryFn: async () => {
      // Fetch all papers by requesting with a large page size
      const allPapers: any[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore)
      {
        const response = await papersApi.list(page, 100); // Get 100 papers per page
        allPapers.push(...response.papers);
        hasMore = response.papers.length === 100 && allPapers.length < response.total;
        page++;
      }

      return allPapers;
    },
  });

  // Fetch annotations for all papers
  const { data: allAnnotationsData, isLoading: annotationsLoading } = useQuery({
    queryKey: ['all-annotations', papersData?.map(p => p.id)],
    queryFn: async (): Promise<AnnotationWithPaper[]> => {
      if (!papersData || papersData.length === 0) return [];

      // Fetch annotations for all papers in parallel
      const annotationPromises = papersData.map(async (paper): Promise<AnnotationWithPaper[]> => {
        try
        {
          const annotations = await annotationsApi.list(paper.id);
          return annotations.map(ann => ({ ...ann, paper }));
        } catch (error)
        {
          console.error(`Failed to fetch annotations for paper ${paper.id}:`, error);
          return [];
        }
      });

      const results = await Promise.all(annotationPromises);
      return results.flat();
    },
    enabled: !!papersData && papersData.length > 0,
  });

  // Filter and sort annotations
  const filteredAndSortedAnnotations = useMemo(() => {
    if (!allAnnotationsData) return [];

    let filtered = allAnnotationsData;

    // Filter by type
    if (filterType === 'annotations')
    {
      filtered = filtered.filter(ann => ann.type !== 'note');
    } else if (filterType === 'notes')
    {
      filtered = filtered.filter(ann => ann.type === 'note');
    }

    // Filter by search query
    if (searchQuery.trim())
    {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(ann => {
        const contentMatch = ann.content.toLowerCase().includes(query);
        const paperMatch = (ann.paper as any).title.toLowerCase().includes(query);
        const highlightedMatch = ann.highlighted_text?.toLowerCase().includes(query);
        return contentMatch || paperMatch || highlightedMatch;
      });
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'date')
      {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      } else
      {
        // Sort by paper title
        const titleA = (a.paper as any).title.toLowerCase();
        const titleB = (b.paper as any).title.toLowerCase();
        if (titleA !== titleB)
        {
          return titleA.localeCompare(titleB);
        }
        // If same paper, sort by date
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return sorted;
  }, [allAnnotationsData, filterType, sortBy, searchQuery]);

  const getAnnotationPage = (annotation: Annotation): number | null => {
    if (annotation.coordinate_data && typeof annotation.coordinate_data === 'object')
    {
      const coord = annotation.coordinate_data as { page?: number };
      return coord.page || null;
    }
    return null;
  };

  const handleAnnotationClick = (annotation: AnnotationWithPaper) => {
    // Navigate to paper with annotation ID as hash
    navigate(`/papers/${annotation.paper.id}#annotation-${annotation.id}`);
  };

  const isLoading = papersLoading || annotationsLoading;
  const annotationsCount = allAnnotationsData?.filter(ann => ann.type !== 'note').length || 0;
  const notesCount = allAnnotationsData?.filter(ann => ann.type === 'note').length || 0;

  return (
    <div className="w-full bg-anara-light-bg min-h-screen">
      <div className="container py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-medium mb-2 text-anara-light-text">All Annotations & Notes</h1>
          <p className="text-anara-light-text-muted text-sm sm:text-base">
            View all annotations and notes across all documents ({annotationsCount} annotations, {notesCount} notes)
          </p>
        </div>

        {/* Filters and Search */}
        <div className="mb-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            {/* Type Filter */}
            <div className="flex gap-2 bg-gray-100 rounded-sm p-1">
              <button
                onClick={() => setFilterType('all')}
                className={`px-4 py-2 text-sm rounded-sm transition-colors ${filterType === 'all'
                  ? 'bg-white text-gray-900'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
              >
                All ({annotationsCount + notesCount})
              </button>
              <button
                onClick={() => setFilterType('annotations')}
                className={`px-4 py-2 text-sm rounded-sm transition-colors flex items-center gap-2 ${filterType === 'annotations'
                  ? 'bg-white text-gray-900'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
              >
                <Highlighter className="h-4 w-4" />
                Annotations ({annotationsCount})
              </button>
              <button
                onClick={() => setFilterType('notes')}
                className={`px-4 py-2 text-sm rounded-sm transition-colors flex items-center gap-2 ${filterType === 'notes'
                  ? 'bg-white text-gray-900'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
              >
                <StickyNote className="h-4 w-4" />
                Notes ({notesCount})
              </button>
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Sort by:</label>
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortBy)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date (newest first)</SelectItem>
                  <SelectItem value="paper">Paper (A-Z)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search annotations and notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-corca-blue-medium focus:border-transparent"
            />
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-4">
            <AnnotationSkeleton />
            <AnnotationSkeleton />
            <AnnotationSkeleton />
            <AnnotationSkeleton />
            <AnnotationSkeleton />
          </div>
        )}

        {/* Results */}
        {!isLoading && (
          <>
            {filteredAndSortedAnnotations.length > 0 ? (
              <div className="space-y-4">
                {filteredAndSortedAnnotations.map((annotation) => {
                  const paper = annotation.paper;
                  const page = getAnnotationPage(annotation);
                  const isNote = annotation.type === 'note';

                  return (
                    <div
                      key={annotation.id}
                      onClick={() => handleAnnotationClick(annotation)}
                      className="border border-gray-200 rounded-sm p-4 sm:p-6 bg-white hover:bg-gray-50 cursor-pointer transition-all"
                    >
                      {/* Paper Info */}
                      <div className="mb-3 pb-3 border-b border-gray-200">
                        <Link
                          to={`/papers/${paper.id}`}
                          className="text-base sm:text-lg font-medium text-gray-900 hover:text-gray-700 transition-colors flex items-center gap-2"
                        >
                          <FileText className="h-4 w-4 flex-shrink-0" />
                          <span className="line-clamp-2">{paper.title}</span>
                        </Link>
                        <div className="mt-1 flex items-center gap-4 text-xs text-gray-500">
                          {isNote ? (
                            <span className="flex items-center gap-1">
                              <StickyNote className="h-3 w-3" />
                              Note
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <Highlighter className="h-3 w-3" />
                              Annotation
                            </span>
                          )}
                          {page && (
                            <span className="flex items-center gap-1">
                              <BookOpen className="h-3 w-3" />
                              Page {page}
                            </span>
                          )}
                          {isNote && annotation.note_scope && (
                            <span className="capitalize">{annotation.note_scope} note</span>
                          )}
                          <span>{format(new Date(annotation.created_at), 'MMM d, yyyy HH:mm')}</span>
                        </div>
                      </div>

                      {/* Highlighted Text (for annotations) */}
                      {annotation.highlighted_text && !isNote && (
                        <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-xs italic text-gray-700">
                          "{annotation.highlighted_text}"
                        </div>
                      )}

                      {/* Content */}
                      <div className="prose prose-sm max-w-none mb-3">
                        {/^<[a-z][\s\S]*>/i.test(annotation.content.trim()) ? (
                          <div
                            className="prose prose-sm max-w-none prose-headings:font-semibold prose-headings:text-gray-900 prose-headings:text-xs prose-h1:text-xs prose-p:text-xs prose-p:text-gray-700 prose-p:leading-relaxed prose-ul:text-xs prose-ul:text-gray-700 prose-ol:text-xs prose-ol:text-gray-700 prose-li:text-xs prose-li:text-gray-700 prose-code:text-xs prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-a:text-xs prose-a:text-gray-700 prose-a:no-underline hover:prose-a:underline prose-strong:text-xs prose-strong:text-gray-900 prose-strong:font-semibold prose-em:text-xs prose-em:text-gray-700 prose-blockquote:border-l-4 prose-blockquote:border-gray-300 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-xs"
                            dangerouslySetInnerHTML={{ __html: annotation.content }}
                          />
                        ) : (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                            components={{
                              h1: ({ node, ...props }) => <h1 className="text-xs font-semibold text-gray-900 mt-2 mb-2" {...props} />,
                              h2: ({ node, ...props }) => <h2 className="text-xs font-semibold text-gray-900 mt-2 mb-2" {...props} />,
                              h3: ({ node, ...props }) => <h3 className="text-xs font-semibold text-gray-900 mt-1 mb-1" {...props} />,
                              p: ({ node, ...props }) => <p className="text-xs text-gray-700 mb-2 leading-relaxed" {...props} />,
                              ul: ({ node, ...props }) => <ul className="text-xs text-gray-700 mb-2 ml-4 list-disc" {...props} />,
                              ol: ({ node, ...props }) => <ol className="text-xs text-gray-700 mb-2 ml-4 list-decimal" {...props} />,
                              li: ({ node, ...props }) => <li className="text-xs text-gray-700 mb-1" {...props} />,
                              code: ({ node, inline, ...props }: any) =>
                                inline ? (
                                  <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono text-gray-900" {...props} />
                                ) : (
                                  <code className="block text-xs bg-gray-900 text-gray-100 p-2 rounded overflow-x-auto" {...props} />
                                ),
                              pre: ({ node, ...props }) => <pre className="text-xs bg-gray-900 text-gray-100 p-2 rounded overflow-x-auto mb-2" {...props} />,
                              a: ({ node, ...props }) => <a className="text-xs text-gray-700 hover:underline" {...props} />,
                              blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-gray-300 pl-3 italic text-gray-600 mb-2 text-xs" {...props} />,
                              strong: ({ node, ...props }) => <strong className="font-semibold text-gray-900 text-xs" {...props} />,
                              em: ({ node, ...props }) => <em className="italic text-gray-700 text-xs" {...props} />,
                            }}
                          >
                            {annotation.content}
                          </ReactMarkdown>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-end pt-3 border-t border-gray-200" onClick={(e) => e.stopPropagation()}>
                        <Link to={`/papers/${paper.id}#annotation-${annotation.id}`}>
                          <Button variant="outline" size="sm" className="text-xs">
                            View in Paper
                          </Button>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 border border-gray-200 rounded-sm bg-gray-50">
                <p className="text-gray-600">
                  {searchQuery
                    ? `No ${filterType === 'all' ? 'annotations or notes' : filterType} found matching "${searchQuery}"`
                    : `No ${filterType === 'all' ? 'annotations or notes' : filterType} yet.`}
                </p>
                {!searchQuery && (
                  <p className="text-sm text-gray-500 mt-2">
                    Start creating annotations and notes while reading papers.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

