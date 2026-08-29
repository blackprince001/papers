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
  secondaryPath: <path d="M12 4.5a7.5 7.5 0 0 1 5.8 2.7H6.2A7.5 7.5 0 0 1 12 4.5z" />,
});
