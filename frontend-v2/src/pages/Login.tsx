import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';
import { useTheme } from '@/lib/theme';

export default function Login() {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const { theme } = useTheme();

  const [error, setError] = useState<string | null>(null);
  const [, setLoading] = useState(false);

  const handleGoogleCredential = async (credential: string) => {
    setError(null);
    setLoading(true);
    try {
      await loginWithGoogle(credential);
      navigate('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-(--background) px-4">
      <div className="w-full max-w-sm bg-(--white) border border-(--border) rounded-2xl p-8 shadow-sm">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-4">
            <Logo size={120} />
          </div>
          <h1 className="text-page-title font-bold tracking-tight text-(--foreground)">Lumen</h1>
          <p className="mt-1 text-body text-(--muted-foreground)">Your research library</p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg bg-(--danger-soft) border border-(--danger-border) px-3 py-2 text-body text-(--danger)">
            {error}
          </div>
        )}

        {/* Google Sign-In (returns an ID token credential) */}
        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={(credentialResponse) => {
              if (credentialResponse.credential) {
                handleGoogleCredential(credentialResponse.credential);
              } else {
                setError('Google returned no credential');
              }
            }}
            onError={() => setError('Google sign-in was cancelled or failed')}
            useOneTap={false}
            theme={theme === 'dark' ? 'filled_black' : 'outline'}
            shape="pill"
            size="large"
            width="300"
          />
        </div>

      </div>
    </div>
  );
}
