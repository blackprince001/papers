import { createIcon } from './create-icon';

export const BuildingIcon = createIcon({
  name: 'building',
  path: (
    <>
      <rect x="5.75" y="4.25" width="12.5" height="15.5" rx="2" />
      <path d="M3.75 19.75h16.5M10.75 19.75V17.5a1.25 1.25 0 0 1 2.5 0v2.25" />
      <circle cx="9.75" cy="8.75" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="14.25" cy="8.75" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="9.75" cy="13.25" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="14.25" cy="13.25" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  secondaryPath: <rect x="7.5" y="6" width="9" height="3" rx="1" />,
});
