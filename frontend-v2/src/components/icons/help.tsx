import { createIcon } from './create-icon';

export const HelpIcon = createIcon({
  name: 'help',
  path: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.4 9.2a2.6 2.6 0 1 1 3.9 2.25c-.8.47-1.3.9-1.3 1.85v.2" />
      <circle cx="12" cy="16.4" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  secondaryPath: <circle cx="12" cy="12" r="7.25" />,
});
