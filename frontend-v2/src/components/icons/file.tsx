import { createIcon } from './create-icon';

export const FileIcon = createIcon({
  name: 'file',
  path: (
    <>
      <path d="M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" />
      <path d="M13.5 3.5V7a2 2 0 0 0 2 2H19" />
    </>
  ),
  secondaryPath: <path d="M7 5h6v3h4v10H7z" />,
});
