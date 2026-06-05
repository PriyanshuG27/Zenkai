import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Eye, EyeOff, Lock, Mail, ShieldAlert } from 'lucide-react';
import { motion } from 'framer-motion';

export const LoginPage = () => {
  const { login, loginWithGoogle, error: authError, clearError } = useAuth();

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Field Validation Errors
  const [emailErr, setEmailErr] = useState('');
  const [passwordErr, setPasswordErr] = useState('');
  // serverErr shows both form errors and auth errors
  const [serverErr, setServerErr] = useState('');

  // Rate Limiting Cooldown State
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldown, setCooldown] = useState(0);

  // Cooldown interval reference
  const timerRef = useRef(null);

  // Hydrate lock from localStorage on mount
  useEffect(() => {
    const storedLock = localStorage.getItem('fitdesi_lockout_until');
    if (storedLock) {
      const remainingMs = parseInt(storedLock, 10) - Date.now();
      if (remainingMs > 0) {
        const remainingSecs = Math.ceil(remainingMs / 1000);
        setCooldown(remainingSecs);
        setServerErr('Too many failed attempts. 30-second cooldown active.');
      } else {
        localStorage.removeItem('fitdesi_lockout_until');
      }
    }
  }, []);

  // Track failed attempts & start timer if needed
  useEffect(() => {
    if (cooldown > 0) {
      timerRef.current = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            setFailedAttempts(0);
            localStorage.removeItem('fitdesi_lockout_until');
            setServerErr('');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [cooldown]);

  // Client Validation Email (RFC 5322)
  const validateEmail = (e) => {
    const val = (e && e.target) ? e.target.value : email;
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!val) {
      setEmailErr('Email is required');
      return false;
    } else if (!emailRegex.test(val)) {
      setEmailErr('Please enter a valid email address');
      return false;
    }
    setEmailErr('');
    return true;
  };

  // Client Validation Password (min 8 chars, 1 number)
  const validatePassword = (e) => {
    const val = (e && e.target) ? e.target.value : password;
    if (!val) {
      setPasswordErr('Password is required');
      return false;
    } else if (val.length < 8) {
      setPasswordErr('Password must be at least 8 characters');
      return false;
    } else if (!/\d/.test(val)) {
      setPasswordErr('Password must contain at least one number');
      return false;
    }
    setPasswordErr('');
    return true;
  };

  const handleGoogleLogin = async () => {
    if (cooldown > 0) return;
    setLoading(true);
    clearError();
    setServerErr('');
    try {
      await loginWithGoogle();
      // GuestRoute will redirect on successful auth
    } catch (err) {
      setServerErr(authError || 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (cooldown > 0) return;

    const isEmailValid = validateEmail();
    const isPassValid = validatePassword();

    if (!isEmailValid || !isPassValid) return;

    setLoading(true);
    clearError();
    setServerErr('');

    try {
      await login(email, password);
      // GuestRoute will redirect on successful auth
    } catch (err) {
      // Clear password field on failed login for security
      setPassword('');

      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);

      if (newAttempts >= 3) {
        const lockoutUntil = Date.now() + 30 * 1000;
        localStorage.setItem('fitdesi_lockout_until', lockoutUntil.toString());
        setCooldown(30);
        setServerErr('Too many failed attempts. 30-second cooldown active.');
      } else {
        setServerErr(err.message || `Incorrect credentials. ${3 - newAttempts} attempt(s) left.`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Determine if submit is disabled
  const isFormValid = email && password && !emailErr && !passwordErr;
  const isSubmitDisabled = loading || cooldown > 0 || !isFormValid;

  return (
    <div className="relative min-h-screen bg-bg-base flex items-center justify-center p-4 selection:bg-primary/30 selection:text-primary overflow-hidden">
      {/* Background Radial Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-radial-gradient from-primary/10 via-primary-glow to-transparent blur-[100px] pointer-events-none z-0" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md bg-bg-surface border border-border-base/80 p-8 rounded-2xl shadow-[0_10px_50px_rgba(0,0,0,0.5)] z-10"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-block font-display text-3xl font-extrabold uppercase tracking-wide mb-2 hover:scale-105 transition-transform">
            FIT<span className="text-primary">DESI</span>
          </Link>
          <p className="text-sm text-text-secondary">Welcome back. Let's finish the mission.</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {/* Email field */}
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-xs font-mono text-text-secondary uppercase tracking-wider">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted">
                <Mail size={18} />
              </span>
              <input
                id="email"
                type="email"
                name="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailErr) setEmailErr('');
                }}
                onBlur={validateEmail}
                autocomplete="email"
                required
                className={`w-full bg-bg-input border ${emailErr ? 'border-destructive' : 'border-border-base'} hover:border-border-bright focus:border-primary rounded-xl pl-11 pr-4 py-3 text-text-primary placeholder:text-text-muted focus:outline-none transition duration-150 text-sm`}
                placeholder="you@email.com"
              />
            </div>
            {emailErr && (
              <p className="flex items-center gap-1 text-xs text-destructive mt-1 font-medium">
                <ShieldAlert size={14} />
                {emailErr}
              </p>
            )}
          </div>

          {/* Password field */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label htmlFor="password" className="block text-xs font-mono text-text-secondary uppercase tracking-wider">
                Password
              </label>
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted">
                <Lock size={18} />
              </span>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordErr) setPasswordErr('');
                }}
                onBlur={validatePassword}
                autocomplete="current-password"
                required
                className={`w-full bg-bg-input border ${passwordErr ? 'border-destructive' : 'border-border-base'} hover:border-border-bright focus:border-primary rounded-xl pl-11 pr-11 py-3 text-text-primary placeholder:text-text-muted focus:outline-none transition duration-150 text-sm`}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {passwordErr && (
              <p className="flex items-center gap-1 text-xs text-destructive mt-1 font-medium">
                <ShieldAlert size={14} />
                {passwordErr}
              </p>
            )}
          </div>

          {/* Server / Cooldown Errors */}
          {serverErr && (
            <motion.div 
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 flex gap-2 text-xs text-destructive font-medium items-start"
            >
              <ShieldAlert size={16} className="shrink-0 mt-0.5" />
              <div>
                <span>{serverErr}</span>
                {cooldown > 0 && (
                  <span className="block mt-1 text-[10px] uppercase tracking-wider font-mono">
                    Time remaining: <span className="text-destructive font-bold">{cooldown}s</span>
                  </span>
                )}
              </div>
            </motion.div>
          )}

          {/* Log In Button */}
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className={`relative w-full py-3.5 px-4 rounded-xl text-white font-semibold flex items-center justify-center transition-all duration-200 select-none shadow-[0_0_20px_var(--primary-glow)] ${
              isSubmitDisabled
                ? 'bg-bg-input border border-border-base text-text-muted shadow-none cursor-not-allowed'
                : 'bg-primary hover:brightness-110 active:scale-[0.98]'
            }`}
          >
            {loading ? (
              <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              'Log In'
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-6 flex items-center">
          <div className="flex-grow border-t border-border-base/50"></div>
          <span className="flex-shrink mx-4 text-xs font-mono text-text-muted uppercase tracking-wider">or</span>
          <div className="flex-grow border-t border-border-base/50"></div>
        </div>

        {/* Social Authentication */}
        <button
          type="button"
          disabled={loading || cooldown > 0}
          onClick={handleGoogleLogin}
          className={`w-full py-3 px-4 bg-bg-surface border border-border-base hover:border-border-bright hover:bg-bg-elevated text-text-primary rounded-xl font-semibold flex items-center justify-center gap-2.5 transition text-sm ${
            cooldown > 0 ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {/* Custom Google SVG Icon */}
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#FF5C00"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#00D4FF"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#B5FF2D"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#FF5C00"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          Continue with Google
        </button>

        {/* Footer Link */}
        <p className="mt-8 text-center text-sm text-text-secondary">
          New to FitDesi?{' '}
          <Link to="/signup" className="text-primary hover:underline font-semibold transition">
            Create an Account
          </Link>
        </p>
      </motion.div>
    </div>
  );
};
