import { createIcon } from './create-icon';

export const PanelLeftCloseIcon = createIcon({
  name: 'panel-left-close',
  path: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M9 5v14" />
      <path d="M16 9.5L13.5 12l2.5 2.5" />
    </>
  ),
  secondaryPath: <rect x="5" y="6.5" width="13" height="11" rx="1.5" />,
});
