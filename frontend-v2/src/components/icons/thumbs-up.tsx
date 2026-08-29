import { createIcon } from './create-icon';

export const ThumbsUpIcon = createIcon({
  name: 'thumbs-up',
  path: (
    <>
      <rect x="3.25" y="10.75" width="4" height="9.45" rx="1.75" />
      <path d="M14.46 6.98l-.82 3.38h4.78a1.64 1.64 0 0 1 1.57 2.1l-1.91 6.56a1.64 1.64 0 0 1-1.57 1.18h-4.86a1.75 1.75 0 0 1-1.75-1.75V8l2.1-4.2a2.57 2.57 0 0 1 2.46 3.18Z" />
    </>
  ),
  secondaryPath: <path d="M11 8.5 13 4.5a1.6 1.6 0 0 1 2 1.7l-.8 4.3h3a1.3 1.3 0 0 1 1.3 1.6l-1.8 6.2a1.3 1.3 0 0 1-1.3 1H11z" />,
});
