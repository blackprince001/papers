import { createIcon } from './create-icon';

export const MinimizeIcon = createIcon({
  name: 'minimize',
  path: (
    <>
      <path d="M19.5 9H15V4.5" />
      <path d="M4.5 15H9v4.5" />
      <path d="M19.5 4.5L15 9M4.5 19.5L9 15" />
    </>
  ),
});
