import { createIcon } from './create-icon';

export const ZoomInIcon = createIcon({
  name: 'zoom-in',
  path: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M15.7 15.7l4.8 4.8" />
      <path d="M8.5 11h5M11 8.5v5" />
    </>
  ),
  secondaryPath: <circle cx="11" cy="11" r="5" />,
});
