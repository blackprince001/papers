import { createIcon } from './create-icon';

export const ViewGridIcon = createIcon({
  name: 'view-grid',
  path: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </>
  ),
  secondaryPath: (
    <>
      <rect x="5.5" y="5.5" width="4.5" height="4.5" rx="1" />
      <rect x="14" y="5.5" width="4.5" height="4.5" rx="1" />
    </>
  ),
});
