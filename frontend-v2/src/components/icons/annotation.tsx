import { createIcon } from './create-icon';

export const AnnotationIcon = createIcon({
  name: 'annotation',
  path: (
    <>
      <path d="M12 20l-2.5-3.5H6.5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3z" />
      <path d="M8.5 10.5h7" />
    </>
  ),
  secondaryPath: <path d="M7 7h10v6H7z" />,
  filledPath: (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 21l-3-3.75H6.5a2.75 2.75 0 0 1-2.75-2.75v-8A2.75 2.75 0 0 1 6.5 3.75h11a2.75 2.75 0 0 1 2.75 2.75v8a2.75 2.75 0 0 1-2.75 2.75H15zM8.5 9.75a.75.75 0 0 0 0 1.5h7a.75.75 0 0 0 0-1.5z"
    />
  ),
});
