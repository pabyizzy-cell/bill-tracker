import { useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

// Magic-link sign-in plus, once signed in, a switcher between your own data
// and any datasets shared with you. Renders nothing when cloud sync isn't
// configured, and hides on file:// (magic links can't redirect to a file).
export default function AuthPanel({ session, contexts, activeOwnerId, onSwitch }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);

  if (!supabase || window.location.protocol === 'file:') return null;

  if (session) {
    return (
      <div className="auth-bar signed-in">
        <span className="auth-status">
          <span className="auth-dot" /> Signed in as <strong>{session.user.email}</strong>
        </span>
        {contexts.length > 1 ? (
          <label className="context-switcher">
            Viewing
            <select value={activeOwnerId} onChange={(e) => onSwitch(e.target.value)}>
              {contexts.map((c) => (
                <option key={c.ownerId} value={c.ownerId}>
                  {c.role === 'owner'
                    ? 'My data'
                    : `${c.ownerEmail} (${c.role === 'editor' ? 'full access' : 'view only'})`}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button type="button" className="btn ghost" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    );
  }

  async function sendLink(e) {
    e.preventDefault();
    const address = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(address)) {
      setStatus('error');
      setMessage('Enter a valid email address.');
      return;
    }
    setStatus('sending');
    setMessage('');
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: {
        emailRedirectTo: window.location.origin + window.location.pathname,
      },
    });
    if (error) {
      setStatus('error');
      setMessage(error.message);
    } else {
      setStatus('sent');
      setMessage(`Sign-in link sent to ${address} — open it on this device.`);
    }
  }

  return (
    <div className="auth-bar">
      {open ? (
        <form className="auth-form" onSubmit={sendLink}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoFocus
          />
          <button type="submit" className="btn primary" disabled={status === 'sending'}>
            {status === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
          </button>
          <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
            Not now
          </button>
        </form>
      ) : (
        <>
          <span className="auth-status">
            Working locally on this device only. Sign in to sync your data across devices.
          </span>
          <button type="button" className="btn primary" onClick={() => setOpen(true)}>
            Sign in to sync
          </button>
        </>
      )}
      {message ? <p className={`auth-message ${status}`}>{message}</p> : null}
    </div>
  );
}
