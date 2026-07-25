import { useState } from 'react';
import { X, Loader2, LogIn, UserPlus, Mail, Lock, AlertCircle } from 'lucide-react';
import { signIn, signUp } from '@/lib/supabase';

interface Props {
  onClose: () => void;
  onAuthed: () => void;
}

export default function AuthModal({ onClose, onAuthed }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setErr('Please enter email and password.'); return; }
    setLoading(true);
    setErr(null);
    try {
      if (mode === 'signup') {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
      onAuthed();
      onClose();
    } catch (e: any) {
      const msg = e?.message || 'Authentication failed';
      if (msg.toLowerCase().includes('already registered')) {
        setErr('That email is already registered. Try signing in instead.');
      } else if (msg.toLowerCase().includes('invalid login')) {
        setErr('Wrong email or password. Please try again.');
      } else {
        setErr(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-sm bg-slate-900 rounded-2xl border border-slate-700 p-6 text-white shadow-2xl">
        <button onClick={onClose} className="absolute top-3 right-3 text-slate-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 mb-1">
          {mode === 'signin' ? <LogIn className="w-5 h-5 text-cyan-400" /> : <UserPlus className="w-5 h-5 text-cyan-400" />}
          <h2 className="text-lg font-semibold">{mode === 'signin' ? 'Sign in' : 'Create account'}</h2>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          {mode === 'signin'
            ? 'Sign in to save and manage your planner scenarios.'
            : 'Create an account to save and manage your planner scenarios.'}
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 flex items-center gap-1 mb-1"><Mail className="w-3 h-3" /> Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="email"
              className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none" />
          </div>
          <div>
            <label className="text-xs text-slate-400 flex items-center gap-1 mb-1"><Lock className="w-3 h-3" /> Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none" />
          </div>
          {err && (
            <div className="flex items-start gap-1.5 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> <span>{err}</span>
            </div>
          )}
          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg transition-colors">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'signin' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <div className="mt-4 text-center text-xs text-slate-400">
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setErr(null); }}
            className="text-cyan-400 hover:text-cyan-300 font-medium">
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
