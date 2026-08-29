import { createIcon } from './create-icon';

export const XCircleIcon = createIcon({
  name: 'x-circle',
  path: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.8 8.8l6.4 6.4M15.2 8.8l-6.4 6.4" />
    </>
  ),
  secondaryPath: <circle cx="12" cy="12" r="7.25" />,
  filledPath: (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 10.87l2.63-2.64a.8.8 0 0 1 1.14 1.14l-2.64 2.63 2.64 2.63a.8.8 0 0 1-1.14 1.14l-2.63-2.64-2.63 2.64a.8.8 0 0 1-1.14-1.14l2.64-2.63-2.64-2.63a.8.8 0 0 1 1.14-1.14l2.63 2.64Z"
    />
  ),
});
