import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { DownloadIcon, FileTextIcon, FileCodeIcon, FileSpreadsheetIcon } from '@/components/icons';
import { exportApi } from '@/lib/api/export';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { toastSuccess, toastError, toastWarning } from '@/lib/utils/toast';
import { cn } from '@/lib/utils';

const EXPORT_FORMATS = [
  { name: 'BibTeX', value: 'bibtex' as const, icon: FileTextIcon, ext: '.bib', desc: 'Standard citation format for LaTeX' },
  { name: 'JSON', value: 'json' as const, icon: FileCodeIcon, ext: '.json', desc: 'Full metadata with annotations' },
  { name: 'CSV', value: 'csv' as const, icon: FileSpreadsheetIcon, ext: '.csv', desc: 'Spreadsheet-compatible format' },
  { name: 'RIS', value: 'ris' as const, icon: FileTextIcon, ext: '.ris', desc: 'Reference Manager format' },
];

const CITATION_FORMATS = [
  { name: 'APA', value: 'apa' },
  { name: 'MLA', value: 'mla' },
  { name: 'BibTeX', value: 'bibtex' },
  { name: 'Chicago', value: 'chicago' },
  { name: 'IEEE', value: 'ieee' },
];

export default function Export() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { paperIds?: number[]; returnPath?: string } | null;

  const [exportType, setExportType] = useState<'papers' | 'citations' | 'bibliography'>('papers');
  const [format, setFormat] = useState<'bibtex' | 'json' | 'csv' | 'ris'>('bibtex');
  const [citationFormat, setCitationFormat] = useState('apa');
  const [includeAnnotations, setIncludeAnnotations] = useState(false);

  const paperIds = state?.paperIds || [];
  const returnPath = state?.returnPath || '/papers';

  useEffect(() => {
    if (paperIds.length === 0) {
      toastWarning('No papers selected for export');
      navigate(returnPath);
    }
  }, [paperIds, returnPath, navigate]);

  const exportMutation = useMutation({
    mutationFn: async () => {
      let blob: Blob;
      let filename: string;

      if (exportType === 'papers') {
        blob = await exportApi.exportPapers({
          paper_ids: paperIds,
          format,
          include_annotations: includeAnnotations,
        });
        filename = `papers${EXPORT_FORMATS.find(f => f.value === format)?.ext}`;
      } else if (exportType === 'citations') {
        blob = await exportApi.exportCitations({
          paper_ids: paperIds,
          format: citationFormat as any,
        });
        filename = `citations.${citationFormat}.txt`;
      } else {
        blob = await exportApi.generateBibliography(paperIds, citationFormat as any);
        filename = `bibliography.${citationFormat}.txt`;
      }

      return { blob, filename };
    },
    onSuccess: ({ blob, filename }) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toastSuccess('Export completed successfully');
      navigate(returnPath);
    },
    onError: (error: Error) => {
      toastError(`Export failed: ${error.message}`);
    },
  });

  if (paperIds.length === 0) return null;

  return (
    <div className="max-w-175 mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-page-title mb-1">Export Papers</h1>
        <p className="text-body text-(--muted-foreground)">
          Export {paperIds.length} paper{paperIds.length !== 1 ? 's' : ''} with your preferred format
        </p>
      </div>

      <div className="space-y-6">
        {/* Export Type */}
        <div className="bg-(--card) border border-(--border) rounded-xl p-6">
          <label className="block text-caption font-medium text-(--muted-foreground) uppercase tracking-wider mb-3">
            Export Type
          </label>
          <Select value={exportType} onChange={(e) => setExportType(e.target.value as any)} className="h-9">
            <option value="papers">Papers Collection</option>
            <option value="citations">Citations Only</option>
            <option value="bibliography">Bibliography</option>
          </Select>
        </div>

        {/* Format Selection */}
        {exportType === 'papers' && (
          <div className="bg-(--card) border border-(--border) rounded-xl p-6">
            <h4 className="text-caption font-medium text-(--muted-foreground) uppercase tracking-wider mb-4">
              Choose Format
            </h4>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {EXPORT_FORMATS.map((fmt) => {
                const Icon = fmt.icon;
                const selected = format === fmt.value;
                return (
                  <button
                    key={fmt.value}
                    onClick={() => setFormat(fmt.value)}
                    className={cn(
                      "p-4 rounded-lg border transition-all text-left",
                      selected 
                        ? 'border-(--foreground) bg-(--muted) border-2' 
                        : 'border-(--border) hover:border-(--muted-foreground) hover:bg-(--muted)/30'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon size="md" className="text-(--muted-foreground)" />
                      <span className="text-code font-bold">{fmt.name}</span>
                    </div>
                    <p className="text-caption text-(--muted-foreground) leading-snug">{fmt.desc}</p>
                  </button>
                );
              })}
            </div>

            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-(--muted) transition-colors">
              <input
                type="checkbox"
                checked={includeAnnotations}
                onChange={(e) => setIncludeAnnotations(e.target.checked)}
                className="w-4 h-4 rounded border-(--border)"
              />
              <span className="text-code font-medium">Include annotations</span>
            </label>
          </div>
        )}

        {(exportType === 'citations' || exportType === 'bibliography') && (
          <div className="bg-(--card) border border-(--border) rounded-xl p-6">
            <label className="block text-caption font-medium text-(--muted-foreground) uppercase tracking-wider mb-3">
              Citation Format
            </label>
            <Select value={citationFormat} onChange={(e) => setCitationFormat(e.target.value)} className="h-9">
              {CITATION_FORMATS.map(fmt => (
                <option key={fmt.value} value={fmt.value}>{fmt.name}</option>
              ))}
            </Select>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            icon={<DownloadIcon size="sm" />}
            onClick={() => exportMutation.mutate()}
            loading={exportMutation.isPending}
          >
            Export
          </Button>
          <Button 
            variant="ghost" 
            onClick={() => navigate(returnPath)}
            disabled={exportMutation.isPending}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
