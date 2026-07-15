import { createIcon } from './create-icon';

export const BlockTableIcon = createIcon({
  name: 'block-table',
  path: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M3.5 10h17" />
      <path d="M12 10v9" />
    </>
  ),
});
