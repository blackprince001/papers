import { createIcon } from './create-icon';

export const ShieldIcon = createIcon({
  name: 'shield',
  path: (
    <path d="M12 4c1.97 1.54 4.31 2.42 6.86 2.62.36.03.64.33.64.69v5.44c0 4.3-2.9 6.73-7.18 8.22a1 1 0 0 1-.64 0C7.4 19.48 4.5 17.05 4.5 12.75V7.31c0-.36.28-.66.64-.69C7.69 6.42 10.03 5.54 12 4z" />
  ),
  secondaryPath: <path d="M12 5.5c1.7 1.1 3.4 1.7 5.5 2v4.7c0 3-1.6 5-5.5 6.8-3.9-1.8-5.5-3.8-5.5-6.8V7.5c2.1-.3 3.8-.9 5.5-2z" />,
});
