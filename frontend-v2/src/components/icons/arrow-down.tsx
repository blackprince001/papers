import { createIcon } from './create-icon';

export const ArrowDownIcon = createIcon({
  name: 'arrow-down',
  path: (
    <>
      <path d="M12 4v16" />
      <path d="M6 14l6 6 6-6" />
    </>
  ),
  secondaryPath: <path d="m8 14 4 4 4-4v2l-4 4-4-4z" />,
});
