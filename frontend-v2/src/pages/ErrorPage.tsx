import { useRouteError, Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { HomeIcon } from '@/components/icons';

export default function ErrorPage() {
  const error = useRouteError() as { statusText?: string; message?: string };

  return (
    <div className="h-dvh flex flex-col items-center justify-center bg-(--background) px-4">
      <h1 className="mb-2">Something went wrong</h1>
      <p className="text-btn text-(--muted-foreground) mb-8">
        {error?.statusText || error?.message || 'An unexpected error occurred'}
      </p>
      <Link to="/">
        <Button variant="primary" icon={<HomeIcon size="sm" />}>Back to Home</Button>
      </Link>
    </div>
  );
}
