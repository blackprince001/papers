import { createIcon } from './create-icon';

export const ArrowRightIcon = createIcon({
  name: 'arrow-right',
  path: (
    <>
      <path d="M4 12h16" />
      <path d="M14 6l6 6-6 6" />
    </>
  ),
  secondaryPath: <path d="M14.5 7 19.5 12l-5 5v-3H4v-4h10.5z" />,
});
