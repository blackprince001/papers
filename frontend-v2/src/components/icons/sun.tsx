import { createIcon } from './create-icon';

export const SunIcon = createIcon({
  name: 'sun',
  path: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3.75v2.25M12 18v2.25M3.75 12h2.25M18 12h2.25M16.24 7.76l1.59-1.59M16.24 16.24l1.59 1.59M7.76 16.24l-1.59 1.59M7.76 7.76L6.17 6.17" />
    </>
  ),
  secondaryPath: <circle cx="12" cy="12" r="2.5" />,
});
