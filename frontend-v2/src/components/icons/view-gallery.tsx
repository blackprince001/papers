import { createIcon } from './create-icon';

export const ViewGalleryIcon = createIcon({
  name: 'view-gallery',
  path: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M13 5v14" />
      <path d="M13 12h7.5" />
    </>
  ),
  secondaryPath: <rect x="5" y="6.5" width="13" height="3" rx="1" />,
});
