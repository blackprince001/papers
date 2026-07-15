import { createIcon } from './create-icon';

export const MaximizeIcon = createIcon({
  name: 'maximize',
  path: (
    <>
      <path d="M15 4.5h4.5V9" />
      <path d="M9 19.5H4.5V15" />
      <path d="M19.5 4.5l-5.1 5.1M4.5 19.5l5.1-5.1" />
    </>
  ),
});
