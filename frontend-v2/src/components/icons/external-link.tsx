import { createIcon } from './create-icon';

export const ExternalLinkIcon = createIcon({
  name: 'external-link',
  path: (
    <>
      <path d="M13 5h6v6" />
      <path d="M19 5l-8.5 8.5" />
      <path d="M19 13.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4.5" />
    </>
  ),
  secondaryPath: <path d="M12 5h7v7h-2V8.4l-6.7 6.7-1.4-1.4L15.6 7H12z" />,
});
