import { useState } from 'react';
import { useApp } from '../App';

// ─── Error mapper ─────────────────────────────────────────────────────────────
function friendly(msg) {
  if (!msg) return 'Something went wrong. Try again.';
  if (msg.includes('Invalid login'))          return 'Incorrect email or password.';
  if (msg.includes('Email not confirmed'))    return 'Please confirm your email before signing in.';
  if (msg.includes('User not found'))         return 'No account found with that email.';
  if (msg.includes('already registered'))     return 'An account with this email already exists.';
  if (msg.includes('Password should be'))     return 'Password must be at least 6 characters.';
  if (msg.includes('rate limit'))             return 'Too many attempts. Please wait a moment.';
  if (msg.includes('network') ||
      msg.includes('fetch'))                  return 'Connection issue. Check your internet.';
  if (msg.includes('not connected'))          return 'Service unavailable. Try again shortly.';
  return 'Something went wrong. Try again.';
}

// ─── Reusable components ──────────────────────────────────────────────────────
function ErrorBox({ msg }) {
  if (!msg) return null;
  return (
    <div className="auth-error">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      {msg}
    </div>
  );
}

function Field({ id, label, type = 'text', value, onChange, onKeyDown, placeholder, autoFocus, autoComplete, hint }) {
  return (
    <div>
      <label className="form-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="form-input"
        type={type}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
      />
      {hint && <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 'var(--space-1)' }}>{hint}</p>}
    </div>
  );
}

function Switcher({ label, action, onClick }) {
  return (
    <p style={{ textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', marginTop: 'var(--space-2)' }}>
      {label}{' '}
      <button
        onClick={onClick}
        style={{ color: 'var(--text-primary)', fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: 3 }}
      >
        {action}
      </button>
    </p>
  );
}

// ─── Main Auth component ──────────────────────────────────────────────────────
export default function Auth() {
  const { supabase, navigate, session } = useApp();

  // view: 'signin' | 'signup' | 'reset' | 'reset-sent' | 'verify'
  const [view,      setView]      = useState('signin');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);

  const clear  = ()  => setError(null);
  const go     = (v) => { setView(v); clear(); };

  const setField = (setter) => (e) => { setter(e.target.value); clear(); };

  // ─── Already signed in ───────────────────────────────────────────────────
  if (session) {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <h1 className="auth-title">You're signed in.</h1>
          <p className="auth-sub" style={{ marginBottom: 'var(--space-6)' }}>{session.user.email}</p>
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate('/')}>
            Go to library
          </button>
          <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 'var(--space-2)' }} onClick={() => navigate('/account')}>
            My account
          </button>
        </div>
      </div>
    );
  }

  // ─── Reset link sent ─────────────────────────────────────────────────────
  if (view === 'reset-sent') {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--bg-sunken)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto var(--space-5)',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>
          <h2 className="auth-title">Check your email</h2>
          <p className="auth-sub" style={{ marginBottom: 'var(--space-6)' }}>
            A reset link was sent to <strong>{email}</strong>.<br />Open it on this device.
          </p>
          <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => go('signin')}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  // ─── Verify email notice ─────────────────────────────────────────────────
  if (view === 'verify') {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--bg-sunken)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto var(--space-5)',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 className="auth-title">Almost there.</h2>
          <p className="auth-sub" style={{ marginBottom: 'var(--space-6)' }}>
            We sent a confirmation link to <strong>{email}</strong>.<br />
            Click it to activate your account, then sign in.
          </p>
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => go('signin')}>
            Sign in
          </button>
        </div>
      </div>
    );
  }

  // ─── Handlers ────────────────────────────────────────────────────────────
  const validateEmail = () => {
    if (!email.trim())          { setError('Email is required.'); return false; }
    if (!email.includes('@') ||
        !email.includes('.'))   { setError('Enter a valid email address.'); return false; }
    return true;
  };

  const handleSignIn = async () => {
    if (!validateEmail()) return;
    if (!password)        { setError('Password is required.'); return; }
    setLoading(true); clear();

    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    err ? setError(friendly(err.message)) : navigate('/');
  };

  const handleSignUp = async () => {
    if (!validateEmail()) return;
    if (!password)              { setError('Password is required.'); return; }
    if (password.length < 6)    { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm)   { setError('Passwords do not match.'); return; }
    setLoading(true); clear();

    const { error: err } = await supabase.auth.signUp({
      email:    email.trim(),
      password,
      options:  { emailRedirectTo: window.location.origin },
    });

    setLoading(false);
    if (err) { setError(friendly(err.message)); return; }
    go('verify');
  };

  const handleReset = async () => {
    if (!validateEmail()) return;
    setLoading(true); clear();

    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/#/update-password`,
    });

    setLoading(false);
    err ? setError(friendly(err.message)) : go('reset-sent');
  };

  // ─── Forgot password view ─────────────────────────────────────────────────
  if (view === 'reset') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p className="auth-eyebrow">LumioBooks</p>
          <h1 className="auth-title">Forgot password?</h1>
          <p className="auth-sub">Enter your email and we'll send a reset link.</p>

          <div className="auth-form">
            <Field
              id="reset-email" label="Email" type="email"
              value={email} onChange={setField(setEmail)}
              onKeyDown={e => e.key === 'Enter' && handleReset()}
              placeholder="you@example.com"
              autoFocus autoComplete="email"
            />

            <ErrorBox msg={error} />

            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 'var(--space-4)' }}
              onClick={handleReset} disabled={loading}>
              {loading ? '…' : 'Send reset link'}
            </button>

            <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => go('signin')}>
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Create account view ──────────────────────────────────────────────────
  if (view === 'signup') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p className="auth-eyebrow">LumioBooks</p>
          <h1 className="auth-title">Create account</h1>
          <p className="auth-sub">Free forever. No credit card needed.</p>

          <div className="auth-form">
            <Field
              id="su-email" label="Email" type="email"
              value={email} onChange={setField(setEmail)}
              onKeyDown={e => e.key === 'Enter' && document.getElementById('su-password')?.focus()}
              placeholder="you@example.com"
              autoFocus autoComplete="email"
            />

            <Field
              id="su-password" label="Password" type="password"
              value={password} onChange={setField(setPassword)}
              onKeyDown={e => e.key === 'Enter' && document.getElementById('su-confirm')?.focus()}
              placeholder="At least 6 characters"
              autoComplete="new-password"
              hint="Minimum 6 characters"
            />

            <Field
              id="su-confirm" label="Confirm password" type="password"
              value={confirm} onChange={setField(setConfirm)}
              onKeyDown={e => e.key === 'Enter' && handleSignUp()}
              placeholder="Repeat your password"
              autoComplete="new-password"
            />

            <ErrorBox msg={error} />

            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 'var(--space-4)' }}
              onClick={handleSignUp} disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </button>

            <Switcher label="Already have an account?" action="Sign in" onClick={() => go('signin')} />
          </div>
        </div>
      </div>
    );
  }

  // ─── Sign in view (default) ───────────────────────────────────────────────
  return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="auth-eyebrow">LumioBooks</p>
        <h1 className="auth-title">Sign in</h1>

        <div className="auth-form">
          <Field
            id="si-email" label="Email" type="email"
            value={email} onChange={setField(setEmail)}
            onKeyDown={e => e.key === 'Enter' && document.getElementById('si-password')?.focus()}
            placeholder="you@example.com"
            autoFocus autoComplete="email"
          />

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--space-2)' }}>
              <label className="form-label" htmlFor="si-password" style={{ margin: 0 }}>Password</label>
              <button className="auth-forgot" onClick={() => go('reset')} type="button">
                Forgot password?
              </button>
            </div>
            <input
              id="si-password"
              className="form-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={setField(setPassword)}
              onKeyDown={e => e.key === 'Enter' && handleSignIn()}
              autoComplete="current-password"
            />
          </div>

          <ErrorBox msg={error} />

          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 'var(--space-4)' }}
            onClick={handleSignIn} disabled={loading}>
            {loading ? '…' : 'Sign in'}
          </button>

          <Switcher label="Don't have an account?" action="Create one" onClick={() => go('signup')} />
        </div>
      </div>
    </div>
  );
}