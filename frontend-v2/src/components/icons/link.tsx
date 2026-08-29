import { createIcon } from './create-icon';

export const LinkIcon = createIcon({
  name: 'link',
  path: (
    <>
      <path d="M15.71 12.17l3.18-3.18a2.75 2.75 0 0 0-3.88-3.88l-3.18 3.18" />
      <path d="M8.29 11.83l-3.18 3.18a2.75 2.75 0 0 0 3.88 3.88l3.18-3.18" />
      <path d="M9.95 14.05l4.1-4.1" />
    </>
  ),
  secondaryPath: <path d="M13 8.5 15 6.5a2 2 0 0 1 2.8 2.8l-2 2z" />,
});
