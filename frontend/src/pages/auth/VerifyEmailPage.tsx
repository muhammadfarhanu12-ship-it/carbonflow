import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { CheckCircle2, Leaf, Loader2, Mail, XCircle } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { authService } from '@/src/services/authService';

type VerificationStatus = 'loading' | 'success' | 'error';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = String(searchParams.get('token') || '').trim();
  const initialEmail = String(searchParams.get('email') || '').trim();

  const [status, setStatus] = useState<VerificationStatus>(token ? 'loading' : 'error');
  const [message, setMessage] = useState(token ? 'Verifying your email...' : 'Invalid or expired link');
  const [email, setEmail] = useState(initialEmail);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [resendError, setResendError] = useState('');

  useEffect(() => {
    setEmail(initialEmail);
  }, [initialEmail]);

  useEffect(() => {
    let cancelled = false;

    if (!token) {
      setStatus('error');
      setMessage('Invalid or expired link');
      return () => {
        cancelled = true;
      };
    }

    setStatus('loading');
    setMessage('Verifying your email...');

    authService.verifyEmail(token)
      .then(() => {
        if (cancelled) {
          return;
        }

        setStatus('success');
        setMessage('Email verified successfully');
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Invalid or expired link');
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleResendVerification = async (event: FormEvent) => {
    event.preventDefault();
    setResendError('');
    setResendMessage('');

    const normalizedEmail = String(email || '').trim();

    if (!normalizedEmail) {
      setResendError('Enter your email to resend the verification link');
      return;
    }

    setResendLoading(true);
    try {
      const response = await authService.resendVerification(normalizedEmail);
      setEmail(response.email);
      setResendMessage('Verification email sent. Please check your inbox.');
    } catch (error) {
      setResendError(error instanceof Error ? error.message : 'Failed to resend verification email');
    } finally {
      setResendLoading(false);
    }
  };

  const icon = status === 'success'
    ? <CheckCircle2 className="h-6 w-6 text-green-600" />
    : status === 'error'
      ? <XCircle className="h-6 w-6 text-destructive" />
      : <Loader2 className="h-6 w-6 animate-spin text-primary" />;

  const iconBg = status === 'success'
    ? 'bg-green-100'
    : status === 'error'
      ? 'bg-destructive/10'
      : 'bg-primary/10';

  return (
    <div className="min-h-screen flex flex-col justify-center bg-muted/30 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <Leaf className="h-10 w-10 text-primary" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-foreground">
          Verify your email
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-card py-8 px-4 shadow-xl sm:rounded-xl sm:px-10 border space-y-6"
        >
          <div className="text-center">
            <div className={`mx-auto flex items-center justify-center h-12 w-12 rounded-full mb-4 ${iconBg}`}>
              {icon}
            </div>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>

          {status === 'success' ? (
            <Button asChild className="w-full">
              <Link to="/auth/signin">Continue to Sign In</Link>
            </Button>
          ) : (
            <Button asChild variant="outline" className="w-full">
              <Link to="/auth/signup">Create a new account</Link>
            </Button>
          )}

          <div className="border-t pt-6">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
              <Mail className="h-4 w-4" />
              <span>Resend verification email</span>
            </div>
            <form className="space-y-3" onSubmit={handleResendVerification}>
              <div>
                <Label htmlFor="resend-email">Email address</Label>
                <Input
                  id="resend-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="mt-1.5"
                />
              </div>
              <Button type="submit" className="w-full" disabled={resendLoading}>
                {resendLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Resend verification email'
                )}
              </Button>
            </form>

            {resendMessage && (
              <p className="mt-3 text-sm text-green-700">{resendMessage}</p>
            )}
            {resendError && (
              <p className="mt-3 text-sm text-destructive">{resendError}</p>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
