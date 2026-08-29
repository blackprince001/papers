import { createIcon } from './create-icon';

export const ChartBarsIcon = createIcon({
  name: 'chart-bars',
  path: <path d="M6 20v-6.5M12 20V5M18 20v-10" />,
  secondaryPath: (
    <>
      <rect x="4.5" y="14" width="3" height="5" rx="0.8" />
      <rect x="10.5" y="7" width="3" height="12" rx="0.8" />
      <rect x="16.5" y="11" width="3" height="8" rx="0.8" />
    </>
  ),
});
