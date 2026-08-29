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
  secondaryPath: <path d="M12 5a7 7 0 1 0 0 14h1.5a1.5 1.5 0 0 0 0-3h-.8a1.5 1.5 0 0 1 0-3h3.8A3.5 3.5 0 0 0 19 9.5 7 7 0 0 0 12 5z" />,
});
