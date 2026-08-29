import { createIcon } from './create-icon';

export const UserIcon = createIcon({
  name: 'user',
  path: (
    <>
      <circle cx="12" cy="7.5" r="3.5" />
      <path d="M18.5 19.5v-1a3.75 3.75 0 0 0-3.75-3.75h-5.5A3.75 3.75 0 0 0 5.5 18.5v1" />
    </>
  ),
  secondaryPath: <circle cx="12" cy="7.5" r="2.4" />,
});
