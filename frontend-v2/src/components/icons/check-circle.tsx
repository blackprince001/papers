import { createIcon } from './create-icon';

export const CheckCircleIcon = createIcon({
  name: 'check-circle',
  path: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.25l2.7 2.7 5.3-5.9" />
    </>
  ),
  secondaryPath: <circle cx="12" cy="12" r="7.25" />,
  filledPath: (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM7.43 12.82l2.7 2.7a.8.8 0 0 0 1.17-.03l5.3-5.9a.8.8 0 0 0-1.19-1.07l-4.73 5.27-2.12-2.1a.8.8 0 0 0-1.13 1.13Z"
    />
  ),
});
