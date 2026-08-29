import { createIcon } from './create-icon';

export const CalendarIcon = createIcon({
  name: 'calendar',
  path: (
    <>
      <rect x="3.75" y="5.25" width="16.5" height="15" rx="2" />
      <path d="M8.25 3.25v3.5M15.75 3.25v3.5" />
      <circle cx="12" cy="13.5" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  secondaryPath: <rect x="5" y="6.5" width="14" height="3" rx="1" />,
});
