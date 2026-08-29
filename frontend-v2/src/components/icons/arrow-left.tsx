import { createIcon } from './create-icon';

export const ArrowLeftIcon = createIcon({
  name: 'arrow-left',
  path: (
    <>
      <path d="M20 12H4" />
      <path d="M10 6l-6 6 6 6" />
    </>
  ),
  secondaryPath: <path d="M9.5 7 4.5 12l5 5v-3H20v-4H9.5z" />,
});
