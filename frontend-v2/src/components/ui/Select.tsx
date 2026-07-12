import { Children, isValidElement, type OptionHTMLAttributes, type ReactNode } from 'react';
import {
  ListBox,
  ListBoxItem,
  SelectIndicator,
  SelectPopover,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from '@heroui/react';
import { cn } from '@/lib/utils';

/* Lumen facade over the HeroUI v3 Select (React Aria). Keeps the historical
 * native-select-like API: <option> children and onChange({target:{value}}).
 * Keyboard nav, typeahead, and focus management come from React Aria. */

interface SelectProps {
  value?: string | number | readonly string[];
  defaultValue?: string | number | readonly string[];
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  className?: string;
  children?: ReactNode;
  error?: boolean;
  placeholder?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  onChange?: (event: { target: { value: string } }) => void;
}

type OptionNodeProps = OptionHTMLAttributes<HTMLOptionElement> & { children?: ReactNode };

interface SelectItem {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

function collectItems(children: ReactNode): SelectItem[] {
  const items: SelectItem[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<OptionNodeProps>(child)) return;
    const { value, children: label, disabled } = child.props;
    if (value === undefined) return;
    items.push({ value: String(value), label, disabled });
  });
  return items;
}

export function Select({
  error,
  className,
  children,
  value,
  defaultValue,
  disabled,
  onChange,
  placeholder,
  name,
  id,
  required,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: SelectProps) {
  const items = collectItems(children);
  const selectedKey = value === undefined ? undefined : value === '' ? null : String(value);
  const defaultKey = defaultValue === undefined ? undefined : String(defaultValue);

  return (
    <SelectRoot
      selectedKey={selectedKey}
      defaultSelectedKey={defaultKey}
      onSelectionChange={(key) => {
        if (key != null) onChange?.({ target: { value: String(key) } });
      }}
      isDisabled={disabled}
      isRequired={required}
      placeholder={placeholder}
      name={name}
      id={id}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className="w-full"
    >
      <SelectTrigger
        className={cn('w-full min-w-0 overflow-hidden', error && 'border-(--danger)', className)}
      >
        <SelectValue className="truncate whitespace-nowrap text-left" />
        <SelectIndicator className="shrink-0" />
      </SelectTrigger>
      <SelectPopover>
        <ListBox>
          {items.length === 0 ? (
            <ListBoxItem id="__empty" isDisabled textValue="No options">
              No options
            </ListBoxItem>
          ) : (
            items.map((it) => (
              <ListBoxItem
                key={it.value}
                id={it.value}
                isDisabled={it.disabled}
                textValue={typeof it.label === 'string' ? it.label : it.value}
              >
                {it.label}
              </ListBoxItem>
            ))
          )}
        </ListBox>
      </SelectPopover>
    </SelectRoot>
  );
}

Select.displayName = 'Select';
