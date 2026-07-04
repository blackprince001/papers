import { Toaster } from 'sonner';
import { useTheme } from '../lib/theme';

export function AppToaster() {
  const { theme } = useTheme();

  return (
    <Toaster
      theme={theme}
      position="top-right"
      gap={10}
      visibleToasts={3}
      duration={5000}
      expand
    />
  );
}
