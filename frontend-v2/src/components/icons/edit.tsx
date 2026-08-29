import { createIcon } from './create-icon';

export const EditIcon = createIcon({
  name: 'edit',
  path: (
    <>
      <path d="M4 20l1.06-3.89L18.09 3.09l2.82 2.82L7.89 18.94Z" />
      <path d="M15.25 5.93l2.82 2.82" />
    </>
  ),
  secondaryPath: <path d="m5.8 16.5 10.7-10.7 1.7 1.7L7.5 18z" />,
});
