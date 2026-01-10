import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Download, FileText, FileJson } from 'lucide-react';
import { Button } from '@/components/Button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { exportApi } from '@/lib/api/export';
import { toastError, toastWarning } from '@/lib/utils/toast';

interface ExportState {
  paperIds: number[];
  returnPath?: string;
  context?: string;
}

export default function ExportPapers() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as ExportState | null;

  const [exportType, setExportType] = useState<'papers' | 'citations' | 'bibliography'>('papers');
  const [format, setFormat] = useState<string>('csv');
  const [citationFormat, setCitationFormat] = useState<string>('apa');
  const [includeAnnotations, setIncludeAnnotations] = useState(false);
  const [loading, setLoading] = useState(false);

  const paperIds = state?.paperIds || [];
  const returnPath = state?.returnPath || '/';

  // Redirect if no paperIds provided
  useEffect(() => {
    if (!paperIds || paperIds.length === 0) {
      toastWarning('No papers selected for export');
      navigate(returnPath);
    }
  }, [paperIds, returnPath, navigate]);

  const handleExport = async () => {
    if (paperIds.length === 0)
    {
      toastWarning('Please select at least one paper');
      return;
    }

    setLoading(true);
    try
    {
      let blob: Blob;
      let filename: string;

      if (exportType === 'papers')
      {
        blob = await exportApi.exportPapers({
          paper_ids: paperIds,
          format: format as 'csv' | 'json' | 'ris' | 'endnote',
          include_annotations: includeAnnotations,
        });
        const extensions = { csv: 'csv', json: 'json', ris: 'ris', endnote: 'enw' };
        filename = `papers.${extensions[format as keyof typeof extensions]}`;
      } else if (exportType === 'citations')
      {
        blob = await exportApi.exportCitations({
          paper_ids: paperIds,
          format: citationFormat as 'apa' | 'mla' | 'bibtex',
        });
        filename = `citations.${citationFormat}.txt`;
      } else
      {
        blob = await exportApi.generateBibliography(
          paperIds,
          citationFormat as 'apa' | 'mla' | 'bibtex' | 'chicago' | 'ieee'
        );
        filename = `bibliography.${citationFormat}.txt`;
      }

      // Download file
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Navigate back after successful export
      navigate(returnPath);
    } catch (error)
    {
      console.error('Export failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Export failed. Please try again.';
      toastError(errorMessage);
    } finally
    {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate(returnPath);
  };

  if (!paperIds || paperIds.length === 0) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Export Papers</h1>
        <p className="text-gray-600">
          Configure your export options and download your papers.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="space-y-6">
          <div>
            <Label>Export Type</Label>
            <Select
              value={exportType}
              onValueChange={(value: string | null) => {
                if (value && ['papers', 'citations', 'bibliography'].includes(value))
                {
                  setExportType(value as 'papers' | 'citations' | 'bibliography');
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="papers">Papers Collection</SelectItem>
                <SelectItem value="citations">Citations Only</SelectItem>
                <SelectItem value="bibliography">Bibliography</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {exportType === 'papers' && (
            <>
              <div>
                <Label>Format</Label>
                <Select value={format} onValueChange={(value: string | null) => value && setFormat(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        CSV
                      </div>
                    </SelectItem>
                    <SelectItem value="json">
                      <div className="flex items-center gap-2">
                        <FileJson className="h-4 w-4" />
                        JSON
                      </div>
                    </SelectItem>
                    <SelectItem value="ris">RIS</SelectItem>
                    <SelectItem value="endnote">EndNote</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="checkbox"
                  id="include-annotations"
                  checked={includeAnnotations}
                  onChange={(e) => setIncludeAnnotations(e.target.checked)}
                  className="w-4 h-4"
                />
                <Label htmlFor="include-annotations" className="cursor-pointer">
                  Include annotations
                </Label>
              </div>
            </>
          )}

          {(exportType === 'citations' || exportType === 'bibliography') && (
            <div>
              <Label>Citation Format</Label>
              <Select value={citationFormat} onValueChange={(value: string | null) => value && setCitationFormat(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="apa">APA</SelectItem>
                  <SelectItem value="mla">MLA</SelectItem>
                  <SelectItem value="bibtex">BibTeX</SelectItem>
                  {exportType === 'bibliography' && (
                    <>
                      <SelectItem value="chicago">Chicago</SelectItem>
                      <SelectItem value="ieee">IEEE</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md">
            Exporting {paperIds.length} paper{paperIds.length !== 1 ? 's' : ''}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleExport}
              disabled={loading || paperIds.length === 0}
            >
              {loading ? (
                'Exporting...'
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

