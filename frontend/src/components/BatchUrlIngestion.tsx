import { useState, useMemo } from 'react';
import { Link2, AlertCircle, CheckCircle, Loader2, X } from 'lucide-react';

// Site patterns for icon display
const SITE_PATTERNS: Array<{ pattern: RegExp; name: string; icon: string }> = [
  { pattern: /arxiv\.org/i, name: 'arXiv', icon: '📄' },
  { pattern: /dl\.acm\.org/i, name: 'ACM', icon: '🔬' },
  { pattern: /openreview\.net/i, name: 'OpenReview', icon: '📊' },
  { pattern: /ieeexplore\.ieee\.org/i, name: 'IEEE', icon: '⚡' },
  { pattern: /nature\.com/i, name: 'Nature', icon: '🌿' },
  { pattern: /biorxiv\.org|medrxiv\.org/i, name: 'bioRxiv', icon: '🧬' },
  { pattern: /proceedings\.mlr\.press/i, name: 'PMLR', icon: '📈' },
  { pattern: /papers\.nips\.cc|neurips\.cc/i, name: 'NeurIPS', icon: '🧠' },
  { pattern: /mdpi\.com/i, name: 'MDPI', icon: '📰' },
  { pattern: /\.pdf$/i, name: 'PDF', icon: '📎' },
];

const MAX_URLS = 20;

interface ParsedUrl {
  url: string;
  site: string;
  icon: string;
  isValid: boolean;
}

interface UrlResult {
  url: string;
  success: boolean;
  error?: string;
}

interface BatchUrlIngestionProps {
  onIngest: (urls: string[]) => Promise<{ paper_ids: number[]; errors: Array<{ url: string; error: string }>; message: string }>;
  disabled?: boolean;
}

function parseUrls(text: string): ParsedUrl[] {
  // Extract URLs from text (handles newlines, commas, spaces)
  const urlPattern = /https?:\/\/[^\s,\n]+/gi;
  const matches = text.match(urlPattern) || [];

  // Deduplicate
  const uniqueUrls = [...new Set(matches)];

  return uniqueUrls.map((url) => {
    const matchedSite = SITE_PATTERNS.find((site) => site.pattern.test(url));
    return {
      url,
      site: matchedSite?.name || 'Link',
      icon: matchedSite?.icon || '🔗',
      isValid: true,
    };
  });
}

export function BatchUrlIngestion({ onIngest, disabled = false }: BatchUrlIngestionProps) {
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<UrlResult[] | null>(null);

  const parsedUrls = useMemo(() => parseUrls(inputText), [inputText]);
  const isOverLimit = parsedUrls.length > MAX_URLS;
  const hasUrls = parsedUrls.length > 0;

  const handleSubmit = async () => {
    if (!hasUrls || isOverLimit || isProcessing) return;

    setIsProcessing(true);
    setResults(null);

    try
    {
      const urls = parsedUrls.map((p) => p.url);
      const response = await onIngest(urls);

      // Build results from response
      const urlResults: UrlResult[] = urls.map((url) => {
        const error = response.errors.find((e) => e.url === url);
        return {
          url,
          success: !error,
          error: error?.error,
        };
      });

      setResults(urlResults);

      // Clear input if all successful
      if (response.errors.length === 0)
      {
        setInputText('');
        setResults(null);
      }
    } catch (error)
    {
      // Show generic error
      setResults(
        parsedUrls.map((p) => ({
          url: p.url,
          success: false,
          error: error instanceof Error ? error.message : 'Failed to ingest',
        }))
      );
    } finally
    {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    setInputText('');
    setResults(null);
  };

  return (
    <div className="space-y-4">
      {/* Input Area */}
      <div>
        <label htmlFor="batch-urls" className="block text-sm font-medium text-gray-900 mb-2">
          Paste URLs <span className="text-gray-500 font-normal">(one per line, or comma/space separated)</span>
        </label>
        <div className="relative">
          <textarea
            id="batch-urls"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`https://arxiv.org/abs/2301.00001\nhttps://dl.acm.org/doi/10.1145/...\nhttps://openreview.net/forum?id=...`}
            rows={6}
            className="w-full px-4 py-3 border border-gray-300 rounded-md bg-white text-gray-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-corca-blue-medium focus:border-transparent resize-none"
            disabled={isProcessing || disabled}
          />
          {inputText && !isProcessing && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 rounded"
              aria-label="Clear input"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* URL Preview */}
      {hasUrls && !results && (
        <div className="border border-gray-200 rounded-md bg-gray-50 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-900">
              {parsedUrls.length} URL{parsedUrls.length !== 1 ? 's' : ''} detected
            </span>
            {isOverLimit && (
              <span className="text-sm text-red-600">
                Maximum {MAX_URLS} URLs allowed
              </span>
            )}
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {parsedUrls.slice(0, MAX_URLS + 5).map((parsed, index) => (
              <div
                key={index}
                className={`flex items-center gap-2 text-sm py-1 px-2 rounded ${index >= MAX_URLS ? 'opacity-50 bg-red-50' : 'bg-white'
                  }`}
              >
                <span className="flex-shrink-0">{parsed.icon}</span>
                <span className="text-gray-500 flex-shrink-0 w-20">{parsed.site}</span>
                <span className="text-gray-700 truncate flex-1 font-mono text-xs">
                  {parsed.url}
                </span>
              </div>
            ))}
            {parsedUrls.length > MAX_URLS + 5 && (
              <div className="text-sm text-gray-500 py-1 px-2">
                ...and {parsedUrls.length - MAX_URLS - 5} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="border border-gray-200 rounded-md bg-gray-50 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-900">
              Results
            </span>
            <span className="text-sm text-gray-600">
              {results.filter((r) => r.success).length}/{results.length} successful
            </span>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {results.map((result, index) => (
              <div
                key={index}
                className={`flex items-start gap-2 text-sm py-2 px-2 rounded ${result.success ? 'bg-green-50' : 'bg-red-50'
                  }`}
              >
                {result.success ? (
                  <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-gray-700 truncate font-mono text-xs">
                    {result.url}
                  </p>
                  {result.error && (
                    <p className="text-red-600 text-xs mt-0.5">{result.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Processing indicator */}
      {isProcessing && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Processing {parsedUrls.length} URL{parsedUrls.length !== 1 ? 's' : ''}...</span>
        </div>
      )}

      {/* Submit hint */}
      {!hasUrls && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link2 className="h-4 w-4" />
          <span>
            Supports arXiv, ACM, OpenReview, IEEE, Nature, bioRxiv, PMLR, NeurIPS, MDPI, and direct PDF links
          </span>
        </div>
      )}

      {/* Submit Button */}
      {hasUrls && !results && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isOverLimit || isProcessing || disabled}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isProcessing ? 'Ingesting...' : `Ingest ${parsedUrls.length} Paper${parsedUrls.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}
    </div>
  );
}
