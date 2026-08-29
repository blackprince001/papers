import { createIcon } from './create-icon';

export const BlockHeadingIcon = createIcon({
  name: 'block-heading',
  path: (
    <>
      <path d="M6.5 5.5v13" />
      <path d="M17.5 5.5v13" />
      <path d="M6.5 12h11" />
    </>
  ),
  secondaryPath: <rect x="6.5" y="8.5" width="11" height="3" rx="1" />,
});
