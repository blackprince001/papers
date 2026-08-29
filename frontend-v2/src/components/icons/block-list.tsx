import { createIcon } from './create-icon';

export const BlockListIcon = createIcon({
  name: 'block-list',
  path: (
    <>
      <circle cx="5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
      <path d="M9.5 6.5h10.5" />
      <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <path d="M9.5 12h10.5" />
      <circle cx="5" cy="17.5" r="1.2" fill="currentColor" stroke="none" />
      <path d="M9.5 17.5h10.5" />
    </>
  ),
  secondaryPath: (
    <>
      <rect x="9.5" y="5.5" width="9.5" height="2" rx="1" />
      <rect x="9.5" y="11" width="9.5" height="2" rx="1" />
      <rect x="9.5" y="16.5" width="9.5" height="2" rx="1" />
    </>
  ),
});
