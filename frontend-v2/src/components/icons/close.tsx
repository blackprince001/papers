import { createIcon } from './create-icon';

export const CloseIcon = createIcon({
  name: 'close',
  path: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </>
  ),
  secondaryPath: <path d="M7.5 6.1 12 10.6l4.5-4.5 1.4 1.4-4.5 4.5 4.5 4.5-1.4 1.4-4.5-4.5-4.5 4.5-1.4-1.4 4.5-4.5-4.5-4.5z" />,
});
