import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Eye, EyeOff, Lock, Mail, ShieldAlert, User } from 'lucide-react';
import { motion } from 'framer-motion';

export const SignupPage = () => {
  const { signup, loginWithGoogle, error: authError, clearError } = useAuth();

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Field Validation Errors
  const [nameErr, setNameErr] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [passwordErr, setPasswordErr] = useState('');
  const [serverErr, setServerErr] = useState('');

  // Password strength calculation
  const getPasswordStrength = (pass) => {
    if (!pass) return 0;
    let score = 0;
    if (pass.length >= 8) score += 1;
    if (pass.length >= 12) score += 1;
    if (/[a-z]/.test(pass) && /[A-Z]/.test(pass)) score += 1;
    if (/\d/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    if (score <= 2) return 1; // Weak
    if (score === 3) return 2; // Medium
    return 3; // Strong
  };

  const strength = getPasswordStrength(password);

  // Client Validation Name (min 2 chars, letters, spaces, hyphens, apostrophes)
  const validateName = () => {
    const nameRegex = /^[a-zA-Z\s'-]{2,}$/;
    if (!name) {
      setNameErr('Name is required');
      return false;
    } else if (!nameRegex.test(name)) {
      setNameErr('Name must be at least 2 characters and contain no special characters except spaces, hyphens, and apostrophes');
      return false;
    }
    setNameErr('');
    return true;
  };

  // Client Validation Email (RFC 5322)
  const validateEmail = () => {
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!email) {
      setEmailErr('Email is required');
      return false;
    } else if (!emailRegex.test(email)) {
      setEmailErr('Please enter a valid email address');
      return false;
    }
    setEmailErr('');
    return true;
  };

  // Client Validation Password (min 8 chars, 1 number)
  const validatePassword = () => {
    if (!password) {
      setPasswordErr('Password is required');
      return false;
    } else if (password.length < 8) {
      setPasswordErr('Password must be at least 8 characters');
      return false;
    } else if (!/\d/.test(password)) {
      setPasswordErr('Password must contain at least one number');
      return false;
    }
    setPasswordErr('');
    return true;
  };

  const handleGoogleSignup = async () => {
    setLoading(true);
    clearError();
    setServerErr('');
    try {
      await loginWithGoogle();
      // GuestRoute handles redirect after auth state updates
    } catch (err) {
      setServerErr(authError || 'Google sign-up failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const isNameValid = validateName();
    const isEmailValid = validateEmail();
    const isPassValid = validatePassword();

    if (!isNameValid || !isEmailValid || !isPassValid) return;

    setLoading(true);
    clearError();
    setServerErr('');

    try {
      // signup() atomically creates Auth user + Firestore doc
      // If Firestore write fails, Auth user is deleted (no orphan accounts)
      await signup(name, email, password);
      // GuestRoute handles redirect after onAuthStateChanged fires
    } catch (err) {
      // err.message is already the human-readable mapped string from useAuth
      setServerErr(err.message || 'Failed to create account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = name && email && password && !nameErr && !emailErr && !passwordErr;
  const isSubmitDisabled = loading || !isFormValid;

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
          <p className="text-sm text-text-secondary">Create your athletic profile and begin today.</p>
        </div>

        {/* Signup Form */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Name Field */}
          <div className="space-y-1">
            <label htmlFor="name" className="block text-xs font-mono text-text-secondary uppercase tracking-wider">
              Full Name
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted">
                <User size={18} />
              </span>
              <input
                id="name"
                type="text"
                name="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameErr) setNameErr('');
                }}
                onBlur={validateName}
                autocomplete="name"
                required
                className={`w-full bg-bg-input border ${nameErr ? 'border-destructive' : 'border-border-base'} hover:border-border-bright focus:border-primary rounded-xl pl-11 pr-4 py-2.5 text-text-primary placeholder:text-text-muted focus:outline-none transition duration-150 text-sm`}
                placeholder="Priyanshu Sharma"
              />
            </div>
            {nameErr && (
              <p className="flex items-start gap-1 text-xs text-destructive mt-1 font-medium leading-tight">
                <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                <span>{nameErr}</span>
              </p>
            )}
          </div>

          {/* Email Field */}
          <div className="space-y-1">
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
                className={`w-full bg-bg-input border ${emailErr ? 'border-destructive' : 'border-border-base'} hover:border-border-bright focus:border-primary rounded-xl pl-11 pr-4 py-2.5 text-text-primary placeholder:text-text-muted focus:outline-none transition duration-150 text-sm`}
                placeholder="you@email.com"
              />
            </div>
            {emailErr && (
              <p className="flex items-start gap-1 text-xs text-destructive mt-1 font-medium leading-tight">
                <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                <span>{emailErr}</span>
              </p>
            )}
          </div>

          {/* Password Field */}
          <div className="space-y-1">
            <label htmlFor="password" className="block text-xs font-mono text-text-secondary uppercase tracking-wider">
              Password
            </label>
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
                autocomplete="new-password"
                required
                className={`w-full bg-bg-input border ${passwordErr ? 'border-destructive' : 'border-border-base'} hover:border-border-bright focus:border-primary rounded-xl pl-11 pr-11 py-2.5 text-text-primary placeholder:text-text-muted focus:outline-none transition duration-150 text-sm`}
                placeholder="Min. 8 characters + 1 number"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {/* Password Strength Indicator Visual Bar (no text labels) */}
            {password && (
              <div className="flex gap-1.5 h-1.5 mt-2">
                <div
                  className={`flex-1 rounded-full transition-all duration-300 ${
                    strength >= 1
                      ? strength === 1
                        ? 'bg-destructive'
                        : strength === 2
                        ? 'bg-warning'
                        : 'bg-success'
                      : 'bg-bg-elevated'
                  }`}
                />
                <div
                  className={`flex-1 rounded-full transition-all duration-300 ${
                    strength >= 2
                      ? strength === 2
                        ? 'bg-warning'
                        : 'bg-success'
                      : 'bg-bg-elevated'
                  }`}
                />
                <div
                  className={`flex-1 rounded-full transition-all duration-300 ${
                    strength === 3 ? 'bg-success' : 'bg-bg-elevated'
                  }`}
                />
              </div>
            )}

            {passwordErr && (
              <p className="flex items-start gap-1 text-xs text-destructive mt-1 font-medium leading-tight">
                <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                <span>{passwordErr}</span>
              </p>
            )}
          </div>

          {/* Server Errors */}
          {serverErr && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 flex gap-2 text-xs text-destructive font-medium items-center"
            >
              <ShieldAlert size={16} className="shrink-0" />
              <span>{serverErr}</span>
            </motion.div>
          )}

          {/* Terms Agreement (Plain Text) */}
          <p className="text-[11px] text-text-muted leading-snug">
            By signing up you agree to our terms.
          </p>

          {/* Sign Up Button */}
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className={`relative w-full py-3 px-4 rounded-xl text-white font-semibold flex items-center justify-center transition-all duration-200 select-none shadow-[0_0_20px_var(--primary-glow)] ${
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
              'Create Account'
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
          disabled={loading}
          onClick={handleGoogleSignup}
          className="w-full py-2.5 px-4 bg-bg-surface border border-border-base hover:border-border-bright hover:bg-bg-elevated text-text-primary rounded-xl font-semibold flex items-center justify-center gap-2.5 transition text-sm"
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
          Already have an account?{' '}
          <Link to="/login" className="text-primary hover:underline font-semibold transition">
            Log In
          </Link>
        </p>
      </motion.div>
    </div>
  );
};
