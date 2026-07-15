import { forwardRef, type InputHTMLAttributes } from 'react';
import { InputGroupInput, InputGroupPrefix, InputGroupRoot } from '@heroui/react';
import { cn } from '@/lib/utils';
import { SearchIcon } from '../icons';

/* Lumen facade over the HeroUI v3 InputGroup with a leading search glyph.
 * Historical API kept: standard input props + onSearch fired on Enter. */

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onSearch?: (value: string) => void;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ onSearch, className, ...props }, ref) => {
    return (
      <InputGroupRoot className={cn('w-full', className)}>
        <InputGroupPrefix>
          <SearchIcon size="md" className="text-(--muted-foreground)" />
        </InputGroupPrefix>
        <InputGroupInput
          ref={ref}
          type="text"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && onSearch) {
              onSearch((e.target as HTMLInputElement).value);
            }
          }}
          {...props}
        />
      </InputGroupRoot>
    );
  },
);

SearchInput.displayName = 'SearchInput';
