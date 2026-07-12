import { createIcon } from './create-icon';

export const GlobeIcon = createIcon({
  name: 'globe',
  path: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a12.5 12.5 0 0 0 0 18 12.5 12.5 0 0 0 0-18" />
      <path d="M3 12h18" />
    </>
  ),
});
