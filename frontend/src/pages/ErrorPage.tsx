import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom';
import { Button } from '@/components/Button';
import { AlertTriangle } from 'lucide-react';

export default function ErrorPage() {
  const error = useRouteError();
  console.error(error);

  let errorMessage = 'An unexpected error has occurred.';
  let errorDetails = '';

  if (isRouteErrorResponse(error))
  {
    // error is type `ErrorResponse`
    errorMessage = error.statusText || error.data?.message || 'Page not found';
    if (error.status === 404)
    {
      errorMessage = "Page not found";
      errorDetails = "The page you are looking for doesn't exist or has been moved.";
    }
  } else if (error instanceof Error)
  {
    errorMessage = error.message;
    errorDetails = error.stack || '';
  } else if (typeof error === 'string')
  {
    errorMessage = error;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-6">
          <AlertTriangle className="h-8 w-8 text-red-600" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Oops!</h1>
        <p className="text-gray-600 mb-6">Sorry, an unexpected error has occurred.</p>

        <div className="bg-red-50 border border-red-100 rounded-md p-4 mb-6 text-left overflow-auto max-h-60">
          <p className="text-red-800 font-medium text-sm font-mono break-all">
            {errorMessage}
          </p>
          {errorDetails && (
            <pre className="mt-2 text-xs text-red-600 whitespace-pre-wrap font-mono">
              {errorDetails}
            </pre>
          )}
        </div>

        <Link to="/">
          <Button className="w-full">
            Return to Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
