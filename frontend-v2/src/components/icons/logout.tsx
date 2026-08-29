import { createIcon } from './create-icon';

export const LogoutIcon = createIcon({
  name: 'logout',
  path: (
    <>
      <path d="M10 20.25H6.25a2 2 0 0 1-2-2V5.75a2 2 0 0 1 2-2H10" />
      <path d="M9.5 12H20" />
      <path d="M15.5 7.5L20 12l-4.5 4.5" />
    </>
  ),
  secondaryPath: <path d="M12 10h7l-3-3v2.2h-4z" />,
});
