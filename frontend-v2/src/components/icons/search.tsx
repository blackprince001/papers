import { createIcon } from './create-icon';

export const SearchIcon = createIcon({
  name: 'search',
  path: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M15.7 15.7l4.8 4.8" />
    </>
  ),
  secondaryPath: <circle cx="11" cy="11" r="5" />,
});
