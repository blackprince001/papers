import { createIcon } from './create-icon';

export const UserPlusIcon = createIcon({
  name: 'user-plus',
  path: (
    <>
      <circle cx="9" cy="7.5" r="3.25" />
      <path d="M13.9 19.25v-.75a3.25 3.25 0 0 0-3.25-3.25h-3.3A3.25 3.25 0 0 0 4.1 18.5v.75" />
      <path d="M18.25 14.5v4M16.25 16.5h4" />
    </>
  ),
});
