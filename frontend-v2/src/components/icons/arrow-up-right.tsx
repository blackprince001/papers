import { createIcon } from './create-icon';

export const ArrowUpRightIcon = createIcon({
  name: 'arrow-up-right',
  path: (
    <>
      <path d="M6 18L18 6" />
      <path d="M9 6h9v9" />
    </>
  ),
  secondaryPath: <path d="M8 16h3.5l5-5V14h2V7h-7v2h3.5l-7 7z" />,
});
