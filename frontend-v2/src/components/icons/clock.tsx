import { createIcon } from './create-icon';

export const ClockIcon = createIcon({
  name: 'clock',
  path: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
});
