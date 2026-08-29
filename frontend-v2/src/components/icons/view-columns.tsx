import { createIcon } from './create-icon';

export const ViewColumnsIcon = createIcon({
  name: 'view-columns',
  path: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M9.17 5v14" />
      <path d="M14.83 5v14" />
    </>
  ),
  secondaryPath: <rect x="5" y="6.5" width="13" height="3" rx="1" />,
});
