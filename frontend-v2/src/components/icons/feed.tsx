import { createIcon } from './create-icon';

export const FeedIcon = createIcon({
  name: 'feed',
  path: (
    <>
      <rect x="4.5" y="4" width="15" height="16" rx="2" />
      <rect x="7.5" y="7.25" width="9" height="3.25" rx="1" />
      <path d="M7.5 13.75h9M7.5 16.75h5.5" />
    </>
  ),
  secondaryPath: <rect x="7" y="7" width="10" height="2.3" rx="1" />,
});
