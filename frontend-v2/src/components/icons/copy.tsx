import { createIcon } from './create-icon';

export const CopyIcon = createIcon({
  name: 'copy',
  path: (
    <>
      <rect x="8.75" y="8.75" width="11.75" height="11.75" rx="2" />
      <path d="M5.5 15.25a2 2 0 0 1-2-2V5.75a2 2 0 0 1 2-2H13a2 2 0 0 1 2 2" />
    </>
  ),
  secondaryPath: <rect x="10.5" y="10.5" width="8.5" height="8.5" rx="1.3" />,
});
