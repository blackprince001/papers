import { createIcon } from './create-icon';

export const RefreshIcon = createIcon({
  name: 'refresh',
  path: (
    <>
      <path d="M4 12a8 8 0 0 1 8-8c2.4 0 4.6 1.06 6.1 2.86L20 8.7" />
      <path d="M20 4.2v4.5h-4.5" />
      <path d="M20 12a8 8 0 0 1-8 8c-2.4 0-4.6-1.06-6.1-2.86L4 15.3" />
      <path d="M4 19.8v-4.5h4.5" />
    </>
  ),
  secondaryPath: <path d="M16.5 4.5 20 8l-3.5 3.5V9.5H13v-2h3.5z" />,
});
