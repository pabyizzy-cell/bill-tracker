import { useState } from 'react';

const ROLE_LABELS = { editor: 'Full access', viewer: 'View only' };

// The owner's allowlist: emails that may open this dataset, each with a
// permission level. Only shown to a signed-in user viewing their own data.
export default function SharingPanel({ available, shares, onAdd, onUpdate, onRemove }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [message, setMessage] = useState(null); // { kind: 'ok' | 'error', text }
  const [busy, setBusy] = useState(false);

  if (!available) {
    return (
      <section className="card">
        <h2>Sharing</h2>
        <p className="empty-note">
          Sharing needs a database update: run{' '}
          <code>supabase/migrations/0002_sharing.sql</code> in the Supabase SQL Editor, then
          reload this page.
        </p>
      </section>
    );
  }

  async function handleAdd(e) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = await onAdd(email, role);
    setBusy(false);
    if (result.ok) {
      setMessage({
        kind: 'ok',
        text: `${email.trim().toLowerCase()} can now sign in and ${
          role === 'editor' ? 'manage' : 'view'
        } your data.`,
      });
      setEmail('');
    } else {
      setMessage({ kind: 'error', text: result.message });
    }
  }

  async function handleRoleChange(granteeEmail, nextRole) {
    setMessage(null);
    const result = await onUpdate(granteeEmail, nextRole);
    if (!result.ok) setMessage({ kind: 'error', text: result.message });
  }

  async function handleRemove(granteeEmail) {
    if (!window.confirm(`Remove access for ${granteeEmail}?`)) return;
    setMessage(null);
    const result = await onRemove(granteeEmail);
    if (!result.ok) setMessage({ kind: 'error', text: result.message });
  }

  return (
    <section className="card">
      <h2>Sharing</h2>
      <p className="share-intro">
        People on this list can sign in with their own email and open your data at the level you
        choose. Double-check the spelling — whoever owns that inbox gets the access.
      </p>

      <form className="share-form" onSubmit={handleAdd}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="their-email@example.com"
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Access level">
          <option value="viewer">View only</option>
          <option value="editor">Full access</option>
        </select>
        <button type="submit" className="btn primary" disabled={busy || !email.trim()}>
          {busy ? 'Adding…' : 'Share'}
        </button>
      </form>

      {message ? <p className={`share-message ${message.kind}`}>{message.text}</p> : null}

      {shares.length === 0 ? (
        <p className="empty-note slim">No one else has access right now.</p>
      ) : (
        <ul className="share-list">
          {shares.map((s) => (
            <li key={s.grantee_email}>
              <span className="share-email">{s.grantee_email}</span>
              <select
                value={s.role}
                onChange={(e) => handleRoleChange(s.grantee_email, e.target.value)}
                aria-label={`Access level for ${s.grantee_email}`}
              >
                <option value="viewer">{ROLE_LABELS.viewer}</option>
                <option value="editor">{ROLE_LABELS.editor}</option>
              </select>
              <button
                type="button"
                className="btn ghost danger"
                onClick={() => handleRemove(s.grantee_email)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
