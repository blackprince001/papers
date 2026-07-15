import { createIcon } from './create-icon';

export const ZoomOutIcon = createIcon({
  name: 'zoom-out',
  path: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M15.7 15.7l4.8 4.8" />
      <path d="M8.5 11h5" />
    </>
  ),
});
