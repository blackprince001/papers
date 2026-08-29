import { createIcon } from './create-icon';

export const RotateIcon = createIcon({
  name: 'rotate',
  path: (
    <>
      <path d="M19.39 13.3A7.5 7.5 0 1 1 16.3 5.86L19.1 8.6" />
      <path d="M19.1 4.1v4.5h-4.5" />
    </>
  ),
  secondaryPath: <path d="m15.5 4.5 4 3.7-4 3.7V9.7h-3v-2h3z" />,
});
