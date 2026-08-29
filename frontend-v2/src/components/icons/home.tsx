import { createIcon } from './create-icon';

export const HomeIcon = createIcon({
  name: 'home',
  path: (
    <>
      <path d="M4 10.5L12 4l8 6.5" />
      <path d="M5.5 9.3V18a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V9.3" />
      <path d="M10 20v-4.25a2 2 0 0 1 4 0V20" />
    </>
  ),
  secondaryPath: <path d="m6 10.8 6-4.9 6 4.9v6.5H6z" />,
});
