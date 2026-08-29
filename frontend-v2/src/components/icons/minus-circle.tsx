import { createIcon } from './create-icon';

export const MinusCircleIcon = createIcon({
  name: 'minus-circle',
  path: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12h7" />
    </>
  ),
  secondaryPath: <circle cx="12" cy="12" r="7.25" />,
  filledPath: (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM8.5 11.2h7a.8.8 0 0 1 0 1.6h-7a.8.8 0 0 1 0-1.6Z"
    />
  ),
});
