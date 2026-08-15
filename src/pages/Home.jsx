import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../App';

const TINTS = {
  Design: '#1a3a5c', Technology: '#0d2137', Philosophy: '#2a1a4a',
  Science: '#0a2a1a', Literature: '#3a1a1a', Business: '#1a2a0a',
};

function guessCategory(subjects = []) {
  const s = subjects.join(' ').toLowerCase();
  if (s.includes('philosoph'))                            return 'Philosophy';
  if (s.includes('science') || s.includes('biology'))    return 'Science';
  if (s.includes('technolog') || s.includes('computer')) return 'Technology';
  if (s.includes('business') || s.includes('econom'))    return 'Business';
  if (s.includes('design') || s.includes('art'))         return 'Design';
  return 'Literature';
}

function gutToBook(g) {
  const formats   = g.formats || {};
  const file_url  = formats['application/pdf'] || formats['application/pdf; charset=utf-8'] || null;
  const cover_url = formats['image/jpeg'] || formats['image/png'] || null;
  return {
    id: `gut-${g.id}`, title: g.title,
    author: g.authors?.[0]?.name || 'Unknown',
    category: guessCategory(g.subjects),
    description: g.subjects?.slice(0, 3).join(', ') || '',
    cover_url, file_url,
    downloads: g.download_count || 0,
    rating: 0, pages: 0,
    year: g.authors?.[0]?.birth_year || null,
    _external: true,
  };
}

function olToBook(doc) {
  const cover_url = doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null;
  const olKey     = doc.key?.replace('/works/', '');
  const file_url  = olKey ? `https://openlibrary.org/works/${olKey}` : null;
  return {
    id: `ol-${doc.key}`, title: doc.title,
    author: Array.isArray(doc.author_name) ? doc.author_name[0] : 'Unknown',
    category: guessCategory(doc.subject || []),
    description: (doc.subject || []).slice(0, 3).join(', '),
    cover_url, file_url,
    downloads: doc.readinglog_count || 0,
    rating: doc.ratings_average ? +doc.ratings_average.toFixed(1) : 0,
    pages: doc.number_of_pages_median || 0,
    year: doc.first_publish_year || null,
    _external: true, _ol: true,
  };
}

async function fetchExternal(query) {
  const [gutRes, olRes] = await Promise.allSettled([
    fetch(`https://gutendex.com/books/?search=${encodeURIComponent(query)}&mime_type=application/pdf`)
      .then(r => r.json()).then(d => (d.results || []).map(gutToBook).filter(b => b.file_url)),
    fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&fields=key,title,author_name,cover_i,subject,first_publish_year,number_of_pages_median,ratings_average,readinglog_count&limit=16`)
      .then(r => r.json()).then(d => (d.docs || []).map(olToBook).filter(b => b.cover_url)),
  ]);
  const gut  = gutRes.status === 'fulfilled' ? gutRes.value : [];
  const ol   = olRes.status  === 'fulfilled' ? olRes.value  : [];
  const seen = new Set(gut.map(b => b.title.toLowerCase()));
  return [...gut, ...ol.filter(b => !seen.has(b.title.toLowerCase()))];
}

const NAV_SECTIONS = [
  { id: 'reading-now', label: 'Reading Now', icon: BookOpenIcon },
  { id: 'all',         label: 'All Books',   icon: GridIcon },
  { id: 'want-to-read',label: 'Want to Read',icon: BookmarkIcon },
  { id: 'finished',    label: 'Finished',    icon: CheckIcon },
];

const CATEGORIES = ['All', 'Design', 'Technology', 'Philosophy', 'Science', 'Literature', 'Business'];

export default function Home() {
  const { supabase, navigate, session } = useApp();

  const [dbBooks,      setDbBooks]      = useState([]);
  const [extBooks,     setExtBooks]     = useState([]);
  const [dbLoading,    setDbLoading]    = useState(true);
  const [extLoading,   setExtLoading]   = useState(false);
  const [query,        setQuery]        = useState('');
  const [activeSection,setActiveSection]= useState('all');
  const [activeCategory,setActiveCategory] = useState('All');
  const [sidebarOpen,  setSidebarOpen]  = useState(false);

  const searchTimer = useRef(null);

  useEffect(() => {
    async function fetchBooks() {
      setDbLoading(true);
      const { data, error } = await supabase
        .from('books').select('*').eq('status', 'approved')
        .order('created_at', { ascending: false });
      if (!error && data) setDbBooks(data);
      setDbLoading(false);
    }
    fetchBooks();
  }, [supabase]);

  const fetchFromExternal = useCallback(async (q) => {
    if (!q || q.length < 2) { setExtBooks([]); return; }
    setExtLoading(true);
    const results  = await fetchExternal(q);
    const dbTitles = new Set(dbBooks.map(b => b.title.toLowerCase()));
    setExtBooks(results.filter(b => !dbTitles.has(b.title.toLowerCase())));
    setExtLoading(false);
  }, [dbBooks]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!query || query.length < 2) { setExtBooks([]); return; }
    searchTimer.current = setTimeout(() => fetchFromExternal(query), 600);
    return () => clearTimeout(searchTimer.current);
  }, [query, fetchFromExternal]);

  const filteredDb = dbBooks.filter(book => {
    const matchCat   = activeCategory === 'All' || book.category === activeCategory;
    const matchQuery = !query ||
      book.title?.toLowerCase().includes(query.toLowerCase()) ||
      book.author?.toLowerCase().includes(query.toLowerCase());
    return matchCat && matchQuery;
  });

  const filteredExt = extBooks.filter(book =>
    activeCategory === 'All' || book.category === activeCategory
  );

  const filtered = [...filteredDb, ...filteredExt];

  const handleBookClick = (book) => {
    if (book._ol)       window.open(`https://openlibrary.org${book.id.replace('ol-', '')}`, '_blank');
    else if (book._external) window.open(book.file_url, '_blank');
    else                navigate(`/book/${book.id}`);
  };

  return (
    <div className="app-shell">
      {/* ── Sidebar ── */}
      <aside className={`sidebar${sidebarOpen ? ' sidebar--open' : ''}`}>
        <div className="sidebar-logo">LumioBooks</div>

        <div className="sidebar-search">
          <SearchIcon />
          <input
            className="sidebar-search-input"
            type="search"
            placeholder="Search"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {extLoading && <span className="sidebar-search-spinner" />}
        </div>

        <nav className="sidebar-nav">
          <p className="sidebar-section-label">Library</p>
          {NAV_SECTIONS.map(s => (
            <button
              key={s.id}
              className={`sidebar-nav-item${activeSection === s.id ? ' active' : ''}`}
              onClick={() => { setActiveSection(s.id); setSidebarOpen(false); }}
            >
              <s.icon />
              {s.label}
            </button>
          ))}

          <p className="sidebar-section-label" style={{ marginTop: 'var(--space-6)' }}>Categories</p>
          {CATEGORIES.filter(c => c !== 'All').map(cat => (
            <button
              key={cat}
              className={`sidebar-nav-item${activeCategory === cat && activeSection === 'all' ? ' active' : ''}`}
              onClick={() => { setActiveCategory(cat); setActiveSection('all'); setSidebarOpen(false); }}
            >
              <DotIcon />
              {cat}
            </button>
          ))}
        </nav>

        {session && (
          <div className="sidebar-user" onClick={() => navigate('/account')}>
            <div className="sidebar-avatar">
              {session.user.email.slice(0, 2).toUpperCase()}
            </div>
            <span className="sidebar-username">
              {session.user.email.split('@')[0]}
            </span>
          </div>
        )}
      </aside>

      {/* ── Main content ── */}
      <main className="shell-main">
        {/* Mobile top bar */}
        <div className="shell-topbar">
          <button className="shell-menu-btn" onClick={() => setSidebarOpen(s => !s)}>
            <MenuIcon />
          </button>
          <span className="shell-topbar-title">
            {NAV_SECTIONS.find(s => s.id === activeSection)?.label || activeCategory}
          </span>
          {!session && (
            <button className="btn btn-primary" style={{ padding: 'var(--space-2) var(--space-4)', fontSize: 'var(--text-sm)' }} onClick={() => navigate('/auth')}>
              Sign in
            </button>
          )}
        </div>

        {/* Content area */}
        <div className="shell-content">
          {/* Reading Now */}
          {activeSection === 'reading-now' && (
            <ReadingNow dbBooks={dbBooks} navigate={navigate} session={session} />
          )}

          {/* All Books / Category */}
          {activeSection === 'all' && (
            <>
              <div className="shell-header">
                <h1 className="shell-title">
                  {query ? `Results for "${query}"` : activeCategory === 'All' ? 'All Books' : activeCategory}
                </h1>
                {!dbLoading && (
                  <span className="shell-count">
                    {filtered.length} {filtered.length === 1 ? 'book' : 'books'}
                  </span>
                )}
              </div>

              {/* Category pills — horizontal scroll */}
              {!query && (
                <div className="shell-pills">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      className={`shell-pill${activeCategory === cat ? ' active' : ''}`}
                      onClick={() => setActiveCategory(cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}

              {dbLoading ? (
                <div className="book-grid">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="book-card-skeleton">
                      <div className="skeleton" style={{ aspectRatio: '2/3', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)' }} />
                      <div className="skeleton" style={{ height: 13, width: '75%', marginBottom: 6 }} />
                      <div className="skeleton" style={{ height: 11, width: '50%' }} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="book-grid">
                  {filtered.map((book, i) => (
                    <BookCard key={book.id} book={book} onClick={() => handleBookClick(book)} index={i} />
                  ))}
                  {extLoading && filtered.length === 0 && (
                    [...Array(4)].map((_, i) => (
                      <div key={`s${i}`} className="book-card-skeleton">
                        <div className="skeleton" style={{ aspectRatio: '2/3', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)' }} />
                        <div className="skeleton" style={{ height: 13, width: '75%', marginBottom: 6 }} />
                        <div className="skeleton" style={{ height: 11, width: '50%' }} />
                      </div>
                    ))
                  )}
                  {filtered.length === 0 && !extLoading && (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 'var(--space-20) 0', color: 'var(--text-tertiary)' }}>
                      <p style={{ marginBottom: 'var(--space-4)' }}>
                        {query ? `No results for "${query}"` : 'No books here yet.'}
                      </p>
                      {query && (
                        <button className="btn btn-ghost" onClick={() => setQuery('')}>Clear search</button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Want to Read */}
          {activeSection === 'want-to-read' && (
            <EmptySection
              icon={<BookmarkIcon />}
              title="Want to Read"
              sub="Books you save will appear here."
              action="Browse library"
              onAction={() => setActiveSection('all')}
            />
          )}

          {/* Finished */}
          {activeSection === 'finished' && (
            <EmptySection
              icon={<CheckIcon />}
              title="Finished"
              sub="Books you've completed will appear here."
              action="Browse library"
              onAction={() => setActiveSection('all')}
            />
          )}
        </div>
      </main>

      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}
    </div>
  );
}

// ─── Reading Now ─────────────────────────────────────────────────────────────
function ReadingNow({ dbBooks, navigate, session }) {
  if (!session) {
    return (
      <EmptySection
        icon={<BookOpenIcon />}
        title="Reading Now"
        sub="Sign in to track your reading progress."
        action="Sign in"
        onAction={() => navigate('/auth')}
      />
    );
  }
  return (
    <div>
      <div className="shell-header">
        <h1 className="shell-title">Reading Now</h1>
      </div>
      {dbBooks.length === 0 ? (
        <EmptySection
          icon={<BookOpenIcon />}
          title="Nothing yet"
          sub="Open a book to start reading."
        />
      ) : (
        <div className="reading-now-grid">
          {dbBooks.slice(0, 4).map(book => (
            <div key={book.id} className="reading-card" onClick={() => navigate(`/read/${book.id}`)}>
              <div className="reading-cover">
                {book.cover_url
                  ? <img src={book.cover_url} alt={book.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ width: '100%', height: '100%', background: TINTS[book.category] || '#1a3a5c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 48, color: 'rgba(255,255,255,0.3)' }}>{book.title?.[0]}</div>
                }
              </div>
              <p className="reading-title">{book.title}</p>
              <p className="reading-author">{book.author}</p>
              <div className="reading-progress-bar">
                <div className="reading-progress-fill" style={{ width: '2%' }} />
              </div>
              <p className="reading-progress-label">2%</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Book card ────────────────────────────────────────────────────────────────
function BookCard({ book, onClick, index }) {
  return (
    <article className="book-card" style={{ animationDelay: `${index * 30}ms` }} onClick={onClick}>
      <div className="book-cover">
        {book.cover_url
          ? <img src={book.cover_url} alt={book.title} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-md)' }} />
          : <div style={{
              width: '100%', height: '100%', borderRadius: 'var(--radius-md)',
              background: `linear-gradient(135deg, ${TINTS[book.category] || '#1a3a5c'}, #000f22)`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: 'var(--space-4)', textAlign: 'center',
            }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', color: 'rgba(255,255,255,0.9)', lineHeight: 1.2, marginBottom: 'var(--space-3)' }}>
                {book.title.split(' ').slice(0, 3).join(' ')}
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>
                {book.author}
              </span>
            </div>
          }
        }
      </div>
      <div className="book-info">
        <h3 className="book-title">{book.title}</h3>
        <p className="book-author">{book.author}</p>
        {book.rating > 0 && (
          <div className="book-meta">
            <span className="book-rating">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              {book.rating}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}

// ─── Empty section ────────────────────────────────────────────────────────────
function EmptySection({ icon, title, sub, action, onAction }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', textAlign: 'center', gap: 'var(--space-4)' }}>
      <div style={{ opacity: 0.2, transform: 'scale(1.5)' }}>{icon}</div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 600, marginTop: 'var(--space-4)' }}>{title}</h2>
      <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', maxWidth: 280 }}>{sub}</p>
      {action && <button className="btn btn-secondary" onClick={onAction} style={{ marginTop: 'var(--space-2)' }}>{action}</button>}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function BookOpenIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>;
}
function GridIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>;
}
function BookmarkIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>;
}
function CheckIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>;
}
function SearchIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function MenuIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;
}
function DotIcon() {
  return <svg width="6" height="6" viewBox="0 0 6 6" fill="currentColor"><circle cx="3" cy="3" r="3"/></svg>;
}