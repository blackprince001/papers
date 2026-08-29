import { createIcon } from './create-icon';

export const PlusIcon = createIcon({
  name: 'plus',
  path: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  secondaryPath: <rect x="9.25" y="9.25" width="5.5" height="5.5" rx="1" />,
});
