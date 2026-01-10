import { Search, FileText, Sparkles } from 'lucide-react';
import { Button } from './Button';

type SearchMode = 'semantic' | 'fulltext' | 'hybrid';

interface SearchModeToggleProps {
  mode: SearchMode;
  onChange: (mode: SearchMode) => void;
}

export function SearchModeToggle({ mode, onChange }: SearchModeToggleProps) {
  return (
    <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-lg">
      <Button
        variant={mode === 'semantic' ? 'primary' : 'ghost'}
        size="sm"
        onClick={() => onChange('semantic')}
        className="flex items-center gap-2"
      >
        <Sparkles className="h-4 w-4" />
        Semantic
      </Button>
      <Button
        variant={mode === 'fulltext' ? 'primary' : 'ghost'}
        size="sm"
        onClick={() => onChange('fulltext')}
        className="flex items-center gap-2"
      >
        <FileText className="h-4 w-4" />
        Full-Text
      </Button>
      <Button
        variant={mode === 'hybrid' ? 'primary' : 'ghost'}
        size="sm"
        onClick={() => onChange('hybrid')}
        className="flex items-center gap-2"
      >
        <Search className="h-4 w-4" />
        Hybrid
      </Button>
    </div>
  );
}

