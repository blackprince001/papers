import { createIcon } from './create-icon';

export const FingerprintIcon = createIcon({
  name: 'fingerprint',
  path: (
    <>
      <path d="M4.5 13a7.5 7.5 0 0 1 15 0" />
      <path d="M7.5 13a4.5 4.5 0 0 1 9 0v3.5" />
      <path d="M10.5 13a1.5 1.5 0 0 1 3 0v5.25" />
    </>
  ),
  secondaryPath: <path d="M9.5 13a2.5 2.5 0 0 1 5 0v4h-2v-4a.5.5 0 0 0-1 0v2h-2z" />,
});
