'use client';

import { useEffect, useState } from 'react';
import CampaignsPanel from '../../components/CampaignsPanel';

export default function AdminDashboard() {
  // globals.css locks html AND body to overflow:hidden + position:fixed +
  // height:100% for the game's full-screen mobile view — this is an
  // ordinary content page, so undo that lock on both elements while
  // mounted and restore it on unmount.
  useEffect(() => {
    const elements = [document.documentElement, document.body];
    const prev = elements.map((el) => ({
      overflow: el.style.overflow,
      position: el.style.position,
      height: el.style.height,
    }));
    elements.forEach((el) => {
      el.style.overflow = 'auto';
      el.style.position = 'static';
      el.style.height = 'auto';
    });
    return () => {
      elements.forEach((el, i) => {
        el.style.overflow = prev[i].overflow;
        el.style.position = prev[i].position;
        el.style.height = prev[i].height;
      });
    };
  }, []);

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // The only signal this page has of whether the admin session cookie is valid is
  // whether an admin-gated route accepts it — /api/admin/campaigns is as good a
  // probe as any, and it's a route this page needs to load anyway.
  async function checkAuth() {
    const res = await fetch('/api/admin/campaigns');
    setAuthed(res.status !== 401);
  }

  useEffect(() => {
    checkAuth();
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setLoginError(body.error || 'Login failed');
      return;
    }
    setPassword('');
    setAuthed(true);
  }

  async function handleLogout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    setAuthed(false);
  }

  if (authed === null) {
    return (
      <div style={styles.centerPage}>
        <span style={{ color: '#898781' }}>Loading…</span>
      </div>
    );
  }

  if (authed === false) {
    return (
      <div style={styles.centerPage}>
        <form onSubmit={handleLogin} style={styles.loginCard}>
          <h1 style={styles.loginTitle}>Fable Admin</h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            autoFocus
            style={styles.input}
          />
          {loginError && <div style={styles.errorText}>{loginError}</div>}
          <button type="submit" style={styles.primaryButton}>Sign in</button>
        </form>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Fable Admin Dashboard</h1>
        <button onClick={handleLogout} style={styles.secondaryButton}>Sign out</button>
      </div>

      <CampaignsPanel />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  centerPage: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#f9f9f7', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  loginCard: {
    background: '#fcfcfb', border: '1px solid rgba(11,11,11,0.10)', borderRadius: 12,
    padding: 32, width: 320, display: 'flex', flexDirection: 'column', gap: 12,
  },
  loginTitle: { margin: 0, marginBottom: 8, fontSize: 20, color: '#0b0b0b' },
  input: {
    padding: '10px 12px', borderRadius: 8, border: '1px solid #c3c2b7', fontSize: 14,
  },
  primaryButton: {
    padding: '10px 12px', borderRadius: 8, border: 'none', background: '#2a78d6',
    color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  secondaryButton: {
    padding: '8px 14px', borderRadius: 8, border: '1px solid #c3c2b7', background: 'transparent',
    color: '#52514e', fontSize: 13, cursor: 'pointer',
  },
  errorText: { color: '#d03b3b', fontSize: 13 },
  page: {
    minHeight: '100vh', background: '#f9f9f7', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 24,
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 1000, margin: '0 auto', width: '100%' },
  title: { margin: 0, fontSize: 22, color: '#0b0b0b' },
};
