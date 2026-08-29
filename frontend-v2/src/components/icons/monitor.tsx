import { createIcon } from './create-icon';

export const MonitorIcon = createIcon({
  name: 'monitor',
  path: (
    <>
      <rect x="3.5" y="5" width="17" height="11.5" rx="2" />
      <path d="M12 16.5v3" />
      <path d="M8.5 19.5h7" />
    </>
  ),
  secondaryPath: <rect x="5" y="7" width="14" height="7.5" rx="1" />,
});
