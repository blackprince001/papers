import { createIcon } from './create-icon';

export const ArrowUpIcon = createIcon({
  name: 'arrow-up',
  path: (
    <>
      <path d="M12 20V4" />
      <path d="M6 10l6-6 6 6" />
    </>
  ),
  secondaryPath: <path d="m8 10 4-4 4 4V8l-4-4-4 4z" />,
});
