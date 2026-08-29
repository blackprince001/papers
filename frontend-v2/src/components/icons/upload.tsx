import { createIcon } from './create-icon';

export const UploadIcon = createIcon({
  name: 'upload',
  path: (
    <>
      <path d="M12 13.5V5" />
      <path d="M7.5 9.5L12 5l4.5 4.5" />
      <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" />
    </>
  ),
  secondaryPath: <path d="m8 9.5 4-4 4 4v2l-4-4-4 4z" />,
});
