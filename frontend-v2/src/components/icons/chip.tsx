import { createIcon } from './create-icon';

export const ChipIcon = createIcon({
  name: 'chip',
  path: (
    <>
      <rect x="8" y="8" width="8" height="8" rx="2" />
      <rect x="10.75" y="10.75" width="2.5" height="2.5" />
      <path d="M10 8V5.5M14 8V5.5M10 16v2.5M14 16v2.5M8 10H5.5M8 14H5.5M16 10h2.5M16 14h2.5" />
    </>
  ),
});
