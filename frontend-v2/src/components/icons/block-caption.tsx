import { createIcon } from './create-icon';

export const BlockCaptionIcon = createIcon({
  name: 'block-caption',
  path: (
    <>
      <rect x="6" y="4.5" width="12" height="9" rx="2" />
      <path d="M7.5 16.5h9" />
      <path d="M9.5 19.5h5" />
    </>
  ),
  secondaryPath: <rect x="7.5" y="6" width="9" height="5" rx="1" />,
});
