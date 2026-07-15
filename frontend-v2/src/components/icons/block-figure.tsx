import { createIcon } from './create-icon';

export const BlockFigureIcon = createIcon({
  name: 'block-figure',
  path: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M3.5 15.5l4.5-4.5 3.5 3.5 4-4.5 5 5.5" />
      <circle cx="16.5" cy="9" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
});
