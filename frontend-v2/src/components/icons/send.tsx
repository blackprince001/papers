import { createIcon } from './create-icon';

export const SendIcon = createIcon({
  name: 'send',
  path: (
    <>
      <path d="M20.5 3.5L3.25 10.1l7.65 2.8 3 7.85Z" />
      <path d="M10.9 12.9L20.5 3.5" />
    </>
  ),
  secondaryPath: <path d="m5.2 10.5 12.8-5-4.9 6.7-4.3 1.2z" />,
});
