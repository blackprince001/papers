import { createIcon } from './create-icon';

export const WarningIcon = createIcon({
  name: 'warning',
  path: (
    <>
      <path d="M13.3 6.3l5.93 10.46A1.5 1.5 0 0 1 17.92 19H6.08a1.5 1.5 0 0 1-1.31-2.24L10.7 6.3a1.5 1.5 0 0 1 2.6 0Z" />
      <path d="M12 9.5v4" />
      <circle cx="12" cy="16.2" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  secondaryPath: <path d="M12 7 18 18H6z" />,
  filledPath: (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M13.3 6.3l5.93 10.46A1.5 1.5 0 0 1 17.92 19H6.08a1.5 1.5 0 0 1-1.31-2.24L10.7 6.3a1.5 1.5 0 0 1 2.6 0ZM12.8 9.5v4a.8.8 0 0 1-1.6 0v-4a.8.8 0 0 1 1.6 0ZM13.1 16.2a1.1 1.1 0 1 0-2.2 0 1.1 1.1 0 0 0 2.2 0Z"
    />
  ),
});
