import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';

export default function AdminLogin() {
  const { loginAsAdmin } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginAsAdmin(username, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-(--background) px-4">
      <div className="w-full max-w-sm bg-(--white) border border-(--border) rounded-2xl p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-4">
            <Logo size={120} />
          </div>
          <h1 className="text-page-title font-bold tracking-tight text-(--foreground)">Administrator</h1>
          <p className="mt-1 text-body text-(--muted-foreground)">Sign in with admin credentials</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-body text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
            className="w-full h-9 rounded-lg border border-(--border) bg-(--background) px-3 text-body text-(--foreground) placeholder:text-(--muted-foreground) focus:outline-none focus:ring-2 focus:ring-(--ring)"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full h-9 rounded-lg border border-(--border) bg-(--background) px-3 text-body text-(--foreground) placeholder:text-(--muted-foreground) focus:outline-none focus:ring-2 focus:ring-(--ring)"
          />
          <Button type="submit" variant="primary" loading={loading} className="w-full">
            Admin Login
          </Button>
        </form>
      </div>
    </div>
  );
}
