import { createIcon } from './create-icon';

export const TrashIcon = createIcon({
  name: 'trash',
  path: (
    <>
      <path d="M4.5 7h15" />
      <path d="M9.5 7V5.75A1.75 1.75 0 0 1 11.25 4h1.5a1.75 1.75 0 0 1 1.75 1.75V7" />
      <path d="M6.5 7l.7 11.2A2 2 0 0 0 9.2 20h5.6a2 2 0 0 0 2-1.8L17.5 7" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </>
  ),
  secondaryPath: <path d="M7.5 8.5h9l-.7 9.5a1.4 1.4 0 0 1-1.4 1.3h-4.4a1.4 1.4 0 0 1-1.4-1.3z" />,
});
