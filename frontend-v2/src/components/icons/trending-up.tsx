import { createIcon } from './create-icon';

export const TrendingUpIcon = createIcon({
  name: 'trending-up',
  path: (
    <>
      <path d="M3.5 17l5.5-5.5 3.5 3.5 7-7.5" />
      <path d="M15 7.5h4.5V12" />
    </>
  ),
  secondaryPath: <path d="m4.5 16.5 4.5-4.5 3.5 3.5 6-6v3l-6 6-3.5-3.5-4.5 4.5z" />,
});
