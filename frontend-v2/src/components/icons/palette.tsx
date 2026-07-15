import { createIcon } from './create-icon';

export const PaletteIcon = createIcon({
  name: 'palette',
  path: (
    <>
      <path d="M19.7 8.4A8.5 8.5 0 1 0 19.7 15.6A3.6 3.6 0 0 1 19.7 8.4z" />
      <circle cx="13.5" cy="7" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="7.7" cy="9" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="7.7" cy="15" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
});
