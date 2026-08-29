import { createIcon } from './create-icon';

export const ArrowDownLeftIcon = createIcon({
  name: 'arrow-down-left',
  path: (
    <>
      <path d="M18 6L6 18" />
      <path d="M15 18H6V9" />
    </>
  ),
  secondaryPath: <path d="M5.5 17.5h5v-5z" />,
});
