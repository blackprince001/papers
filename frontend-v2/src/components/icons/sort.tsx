import { createIcon } from './create-icon';

export const SortIcon = createIcon({
  name: 'sort',
  path: (
    <>
      <path d="M8 18V6" />
      <path d="M4.5 9.5L8 6l3.5 3.5" />
      <path d="M16 6v12" />
      <path d="M12.5 14.5L16 18l3.5-3.5" />
    </>
  ),
  secondaryPath: <path d="m4.5 9.5 3.5-3.5 3.5 3.5v-2L8 4l-4 4zM12.5 14.5 16 18l3.5-3.5v2L16 20l-3.5-3.5z" />,
});
