import { createIcon } from './create-icon';

export const BookmarkPlusIcon = createIcon({
  name: 'bookmark-plus',
  path: (
    <>
      <path d="M6.5 20V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v14l-5.5-3.2z" />
      <path d="M12 8v4" />
      <path d="M10 10h4" />
    </>
  ),
  secondaryPath: <path d="M8 5.5h6.5v9l-3.25-1.9L8 14.5z" />,
});
