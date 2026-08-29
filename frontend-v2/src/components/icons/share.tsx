import { createIcon } from './create-icon';

export const ShareIcon = createIcon({
  name: 'share',
  path: (
    <>
      <circle cx="6" cy="12" r="2.2" />
      <circle cx="17.5" cy="5.5" r="2.2" />
      <circle cx="17.5" cy="18.5" r="2.2" />
      <path d="M8.44 10.62L15.06 6.88M8.44 13.38L15.06 17.12" />
    </>
  ),
  secondaryPath: (
    <>
      <circle cx="6" cy="12" r="1.2" />
      <circle cx="17.5" cy="5.5" r="1.2" />
      <circle cx="17.5" cy="18.5" r="1.2" />
    </>
  ),
});
