import { createIcon } from './create-icon';

export const BookOpenIcon = createIcon({
  name: 'book-open',
  path: (
    <>
      <path d="M12 6.6c-1.6-1.9-4-2.8-7.5-2.8v13.6c3.5 0 5.9.9 7.5 2.8 1.6-1.9 4-2.8 7.5-2.8V3.8c-3.5 0-5.9.9-7.5 2.8" />
      <path d="M12 6.6v13.6" />
    </>
  ),
  secondaryPath: <path d="M5.5 5.5c2.8.1 4.7.9 6.5 2.5v10.5c-1.8-1.3-3.7-1.8-6.5-1.9z" />,
});
