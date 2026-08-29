import { createIcon } from './create-icon';

export const BlockTitleIcon = createIcon({
  name: 'block-title',
  path: (
    <>
      <path d="M5 6h14" />
      <path d="M12 6v12" />
    </>
  ),
  secondaryPath: <rect x="5" y="5" width="14" height="2.5" rx="1" />,
});
