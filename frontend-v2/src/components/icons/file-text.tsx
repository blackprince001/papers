import { createIcon } from './create-icon';

export const FileTextIcon = createIcon({
  name: 'file-text',
  path: (
    <>
      <path d="M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" />
      <path d="M13.5 3.5V7a2 2 0 0 0 2 2H19" />
      <path d="M8.5 13h7" />
      <path d="M8.5 16.5h5" />
    </>
  ),
  secondaryPath: <path d="M7 5.5h6v3h3.5v10H7z" />,
});
