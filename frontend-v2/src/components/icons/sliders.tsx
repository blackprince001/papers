import { createIcon } from './create-icon';

export const SlidersIcon = createIcon({
  name: 'sliders',
  path: (
    <>
      <circle cx="8.5" cy="8" r="2.2" />
      <circle cx="15.5" cy="16" r="2.2" />
      <path d="M3.5 8h1.9M11.6 8h8.9" />
      <path d="M3.5 16h8.9M18.6 16h1.9" />
    </>
  ),
});
