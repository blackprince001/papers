import { createIcon } from './create-icon';

export const CloseIcon = createIcon({
  name: 'close',
  path: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </>
  ),
});
