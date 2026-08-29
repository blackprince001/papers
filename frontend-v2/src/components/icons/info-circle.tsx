import { createIcon } from './create-icon';

export const InfoCircleIcon = createIcon({
  name: 'info-circle',
  path: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11.5V16.5" />
      <circle cx="12" cy="8" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  secondaryPath: <circle cx="12" cy="12" r="7.25" />,
  filledPath: (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12.8 11.5v5a.8.8 0 0 1-1.6 0v-5a.8.8 0 0 1 1.6 0ZM13.1 8a1.1 1.1 0 1 0-2.2 0 1.1 1.1 0 0 0 2.2 0Z"
    />
  ),
});
