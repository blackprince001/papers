import { createIcon } from './create-icon';

export const LayersIcon = createIcon({
  name: 'layers',
  path: (
    <>
      <path d="M12 4.5l7.5 4-7.5 4-7.5-4z" />
      <path d="M4.5 12.25l7.5 4 7.5-4" />
      <path d="M4.5 15.75l7.5 4 7.5-4" />
    </>
  ),
  secondaryPath: <path d="m6.5 9 5.5 2.9L17.5 9 12 6.1z" />,
});
