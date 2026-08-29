import { createIcon } from './create-icon';

export const TagIcon = createIcon({
  name: 'tag',
  path: (
    <>
      <path d="M12.5 4a1.7 1.7 0 0 0-1.2-.5H5.2a1.7 1.7 0 0 0-1.7 1.7v6.1a1.7 1.7 0 0 0 .5 1.2l7.4 7.4a2.06 2.06 0 0 0 2.91 0l5.59-5.59a2.06 2.06 0 0 0 0-2.91z" />
      <circle cx="8.2" cy="8.2" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  secondaryPath: <path d="M5.2 5.5H11l7 7-5.3 5.3-7.5-7.5z" />,
});
