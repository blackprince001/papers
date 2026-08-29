import { createIcon } from './create-icon';

export const HashtagIcon = createIcon({
  name: 'hashtag',
  path: (
    <>
      <path d="M10 4.5l-1.5 15" />
      <path d="M15.5 4.5L14 19.5" />
      <path d="M5 9h14.5" />
      <path d="M4.5 15H19" />
    </>
  ),
  secondaryPath: (
    <>
      <path d="M8.5 9h2l-.5 6h-2z" />
      <path d="M14 9h2l-.5 6h-2z" />
    </>
  ),
});
