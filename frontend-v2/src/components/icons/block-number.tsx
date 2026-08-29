import { createIcon } from './create-icon';

export const BlockNumberIcon = createIcon({
  name: 'block-number',
  path: (
    <>
      <path d="M5.5 5.5v3" />
      <path d="M9.5 7h11" />
      <path d="M5 14.5c1-.2 1.5.3 1.5 1 0 .8-1.5 1.2-1.5 2h2" />
      <path d="M9.5 16h11" />
    </>
  ),
  secondaryPath: (
    <>
      <rect x="9.5" y="5.5" width="10.5" height="2" rx="1" />
      <rect x="9.5" y="15" width="10.5" height="2" rx="1" />
    </>
  ),
});
