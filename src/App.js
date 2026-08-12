import { useState, useEffect, createContext, useContext } from 'react';
import { createClient } from '@supabase/supabase-js';
import Home from './pages/Home';
import BookReader from './pages/BookReader';
import Auth from './pages/Auth';
import PublisherDashboard from './pages/PublisherDashboard';
import BookDetail from './pages/BookDetail';
import './App.css';

// ─── Supabase ─────────────────────────────────────────────────────────────────
const supabase = process.env.REACT_APP_SUPABASE_URL
  ? createClient(
      process.env.REACT_APP_SUPABASE_URL,
      process.env.REACT_APP_SUPABASE_ANON_KEY
    )
  : {
      auth: {
        getSession:         async () => ({ data: { session: null } }),
        onAuthStateChange:  () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithOtp:      async () => ({ error: null }),
        signInWithPassword: async () => ({ error: { message: 'Supabase not connected.' } }),
        signOut:            async () => ({}),
      },
    };

// ─── Context ──────────────────────────────────────────────────────────────────
export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

// ─── Data ─────────────────────────────────────────────────────────────────────
const CATEGORIES = ['All', 'Design', 'Technology', 'Philosophy', 'Science', 'Literature', 'Business'];

const BOOKS = [
  {
    id: '1', title: 'The Laws of Simplicity', author: 'John Maeda',
    category: 'Design', year: 2006, pages: 128, downloads: 4200, rating: 4.7,
    description: 'Ten laws for balancing simplicity and complexity in business, technology, and design.',
    cover: null, file_url: null,
  },
  {
    id: '2', title: 'The Design of Everyday Things', author: 'Don Norman',
    category: 'Design', year: 1988, pages: 368, downloads: 8100, rating: 4.8,
    description: 'A powerful primer on how — and why — some products satisfy customers while others frustrate them.',
    cover: null, file_url: null,
  },
  {
    id: '3', title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman',
    category: 'Science', year: 2011, pages: 499, downloads: 12300, rating: 4.6,
    description: 'A tour of the mind and explains the two systems that drive the way we think.',
    cover: null, file_url: null,
  },
  {
    id: '4', title: 'Meditations', author: 'Marcus Aurelius',
    category: 'Philosophy', year: 180, pages: 254, downloads: 9800, rating: 4.9,
    description: 'A series of personal writings by the Roman Emperor — a source of guidance and self-improvement.',
    cover: null, file_url: null,
  },
  {
    id: '5', title: 'Zero to One', author: 'Peter Thiel',
    category: 'Business', year: 2014, pages: 224, downloads: 7600, rating: 4.5,
    description: 'Notes on startups, or how to build the future. Original thinking about what it takes.',
    cover: null, file_url: null,
  },
  {
    id: '6', title: 'Clean Code', author: 'Robert C. Martin',
    category: 'Technology', year: 2008, pages: 431, downloads: 15400, rating: 4.7,
    description: 'A handbook of agile software craftsmanship for developers who care about their work.',
    cover: null, file_url: null,
  },
];

const STATS = {
  books:      BOOKS.length,
  downloads:  BOOKS.reduce((s, b) => s + b.downloads, 0),
  categories: CATEGORIES.filter(c => c !== 'All').length,
  avgRating:  (BOOKS.reduce((s, b) => s + b.rating, 0) / BOOKS.length).toFixed(1),
};

// ─── Router ───────────────────────────────────────────────────────────────────
function getRoute() {
  return window.location.hash.replace('#', '') || '/';
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [theme, setTheme]     = useState(() => localStorage.getItem('lb-theme') || 'light');
  const [route, setRoute]     = useState(getRoute);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('lb-theme', theme);
  }, [theme]);

  useEffect(() => {
    const sync = () => setRoute(getRoute());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const navigate = (path) => {
    window.location.hash = path;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const ctx = {
    supabase, session, navigate, theme,
    books: BOOKS, categories: CATEGORIES, stats: STATS,
  };

  if (loading) return (
    <div className="app-loader"><span className="loader-dot" /></div>
  );

  const renderRoute = () => {
    if (route === '/' || route === '')  return <Home />;
    if (route === '/auth')              return <Auth />;
    if (route === '/account')           return <Account />;
    if (route === '/publish')           return <PublisherDashboard />;
    if (route.startsWith('/read/'))     return <BookReader bookId={route.split('/read/')[1]} />;
    if (route.startsWith('/book/'))     return <BookDetail bookId={route.split('/book/')[1]} />;
    return <Home />;
  };

  return (
    <AppContext.Provider value={ctx}>
      <div className="app">
        <Nav
          theme={theme}
          session={session}
          navigate={navigate}
          onToggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
        />
        <main className="app-main">{renderRoute()}</main>
        <Footer navigate={navigate} />
      </div>
    </AppContext.Provider>
  );
}

// ─── Account ──────────────────────────────────────────────────────────────────
function Account() {
  const { session, supabase, navigate } = useApp();

  if (!session) {
    navigate('/auth');
    return null;
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const email    = session.user.email;
  const joined   = new Date(session.user.created_at).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Avatar */}
        <div style={{
          width: 56, height: 56,
          borderRadius: '50%',
          background: 'var(--bg-sunken)',
          border: '1px solid var(--border-soft)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-lg)',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          margin: '0 auto var(--space-6)',
        }}>
          {initials}
        </div>

        <p className="auth-eyebrow">Account</p>
        <h1 className="auth-title" style={{ fontSize: 'var(--text-xl)' }}>
          {email.split('@')[0]}
        </h1>
        <p className="auth-sub" style={{ marginBottom: 'var(--space-8)' }}>
          {email}<br />
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
            Member since {joined}
          </span>
        </p>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <button
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => navigate('/')}
          >
            Browse library
          </button>
          <button
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => navigate('/publish')}
          >
            Publish a book
          </button>
          <button
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'center', color: 'var(--text-tertiary)', marginTop: 'var(--space-2)' }}
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
function Nav({ theme, session, navigate, onToggleTheme }) {
  const [scrolled,  setScrolled]  = useState(false);
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [route,     setRoute]     = useState(getRoute());

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const sync = () => { setRoute(getRoute()); setMenuOpen(false); };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const go       = (path) => { navigate(path); setMenuOpen(false); };
  const isActive = (path) => path === '/'
    ? route === '/' || route === ''
    : route.startsWith(path);

  return (
    <header className={`nav${scrolled ? ' nav--scrolled' : ''}`}>
      <button className="nav-logo" onClick={() => go('/')}>
        LumioBooks
      </button>

      <nav className={`nav-links${menuOpen ? ' nav-links--open' : ''}`}>
        <button className={isActive('/')        ? 'nav-link-active' : ''} onClick={() => go('/')}>Browse</button>
        <button className={isActive('/publish') ? 'nav-link-active' : ''} onClick={() => go('/publish')}>Publish</button>
        {session
          ? <button className={isActive('/account') ? 'nav-link-active' : ''} onClick={() => go('/account')}>Account</button>
          : <button className={`nav-cta${isActive('/auth') ? ' nav-cta--on' : ''}`} onClick={() => go('/auth')}>Sign in</button>
        }
      </nav>

      <div className="nav-controls">
        <button
          className={`theme-toggle${theme === 'dark' ? ' theme-toggle--dark' : ''}`}
          onClick={onToggleTheme}
          aria-label="Toggle theme"
        >
          <span className="toggle-track">
            <span className="toggle-thumb">
              {theme === 'light'
                ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              }
            </span>
          </span>
        </button>

        <button
          className={`hamburger${menuOpen ? ' hamburger--open' : ''}`}
          onClick={() => setMenuOpen(m => !m)}
          aria-label="Menu"
        >
          <span /><span /><span />
        </button>
      </div>
    </header>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer({ navigate }) {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <span className="footer-logo">LumioBooks</span>
        <nav className="footer-links">
          <button onClick={() => navigate('/')}>Browse</button>
          <button onClick={() => navigate('/publish')}>Publish</button>
          <button onClick={() => navigate('/auth')}>Sign in</button>
        </nav>
        <p className="footer-copy">© {new Date().getFullYear()} LumioBooks</p>
      </div>
    </footer>
  );
}