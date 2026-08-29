import { createIcon } from './create-icon';

export const CheckSquareIcon = createIcon({
  name: 'check-square',
  path: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8.5 12.3l2.4 2.4 4.6-5.2" />
    </>
  ),
  secondaryPath: <rect x="6" y="6" width="12" height="12" rx="2" />,
});
