import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../App';

const TINTS = {
  Design: '#E8E6DF', Technology: '#E4E5E8', Philosophy: '#EAE8E2',
  Science: '#E6E8E4', Literature: '#ECE9E3', Business: '#E9E7E2',
};

// ─── External sources (silent) ────────────────────────────────────────────────
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
    author:      g.authors?.[0]?.name || 'Unknown',
    category:    guessCategory(g.subjects),
    description: g.subjects?.slice(0, 3).join(', ') || '',
    cover_url, file_url,
    downloads:   g.download_count || 0,
    rating: 0, pages: 0,
    year:        g.authors?.[0]?.birth_year || null,
    _external: true,
  };
}

function olToBook(doc) {
  const cover_url = doc.cover_i
    ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null;
  const olKey    = doc.key?.replace('/works/', '');
  const file_url = olKey ? `https://openlibrary.org/works/${olKey}` : null;
  return {
    id: `ol-${doc.key}`,
    title:       doc.title,
    author:      Array.isArray(doc.author_name) ? doc.author_name[0] : 'Unknown',
    category:    guessCategory(doc.subject || []),
    description: (doc.subject || []).slice(0, 3).join(', '),
    cover_url, file_url,
    downloads:   doc.readinglog_count || 0,
    rating:      doc.ratings_average ? +doc.ratings_average.toFixed(1) : 0,
    pages:       doc.number_of_pages_median || 0,
    year:        doc.first_publish_year || null,
    _external: true, _ol: true,
  };
}

async function fetchExternal(query) {
  const [gutRes, olRes] = await Promise.allSettled([
    fetch(`https://gutendex.com/books/?search=${encodeURIComponent(query)}&mime_type=application/pdf`)
      .then(r => r.json())
      .then(d => (d.results || []).map(gutToBook).filter(b => b.file_url)),
    fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&fields=key,title,author_name,cover_i,subject,first_publish_year,number_of_pages_median,ratings_average,readinglog_count&limit=16`)
      .then(r => r.json())
      .then(d => (d.docs || []).map(olToBook).filter(b => b.cover_url)),
  ]);

  const gut = gutRes.status === 'fulfilled' ? gutRes.value : [];
  const ol  = olRes.status  === 'fulfilled' ? olRes.value  : [];

  // Merge, deduplicate by lowercase title
  const seen = new Set(gut.map(b => b.title.toLowerCase()));
  return [...gut, ...ol.filter(b => !seen.has(b.title.toLowerCase()))];
}

// ─── Home ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const { supabase, categories, navigate } = useApp();

  const [dbBooks,        setDbBooks]        = useState([]);
  const [extBooks,       setExtBooks]       = useState([]);
  const [dbLoading,      setDbLoading]      = useState(true);
  const [extLoading,     setExtLoading]     = useState(false);
  const [query,          setQuery]          = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  const searchTimer = useRef(null);

  // Load our DB books once
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

  // Fetch external sources silently when user types
  const fetchFromExternal = useCallback(async (q) => {
    if (!q || q.length < 2) { setExtBooks([]); return; }
    setExtLoading(true);
    const results = await fetchExternal(q);
    // Remove titles already in our DB
    const dbTitles = new Set(dbBooks.map(b => b.title.toLowerCase()));
    setExtBooks(results.filter(b => !dbTitles.has(b.title.toLowerCase())));
    setExtLoading(false);
  }, [dbBooks]);

  // Debounce 600ms
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!query || query.length < 2) { setExtBooks([]); return; }
    searchTimer.current = setTimeout(() => fetchFromExternal(query), 600);
    return () => clearTimeout(searchTimer.current);
  }, [query, fetchFromExternal]);

  // DB books filtered normally
  const filteredDb = dbBooks.filter(book => {
    const matchCat   = activeCategory === 'All' || book.category === activeCategory;
    const matchQuery = !query ||
      book.title?.toLowerCase().includes(query.toLowerCase()) ||
      book.author?.toLowerCase().includes(query.toLowerCase());
    return matchCat && matchQuery;
  });

  // External results already match query — just filter by category
  const filteredExt = extBooks.filter(book =>
    activeCategory === 'All' || book.category === activeCategory
  );

  const filtered = [...filteredDb, ...filteredExt];

  const stats = {
    books:      dbBooks.length,
    downloads:  dbBooks.reduce((s, b) => s + (b.downloads || 0), 0),
    categories: categories.filter(c => c !== 'All').length,
    avgRating:  dbBooks.length
      ? (dbBooks.reduce((s, b) => s + (b.rating || 0), 0) / dbBooks.length).toFixed(1)
      : '—',
  };

  return (
    <div className="page">
      <Hero stats={stats} navigate={navigate} />

      <section style={{ padding: '0 0 var(--space-24)' }}>
        <div className="container">

          {/* Search */}
          <div className="search-wrap reveal" data-reveal style={{ position: 'relative' }}>
            <span className="search-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </span>
            <input
              className="search-input"
              type="search"
              placeholder="Search any book or author…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            {extLoading && (
              <span style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text-tertiary)', pointerEvents: 'none' }}>
                Searching…
              </span>
            )}
          </div>

          {/* Category pills */}
          <div className="category-bar reveal" data-reveal>
            {categories.map(cat => (
              <button
                key={cat}
                className={`category-pill${activeCategory === cat ? ' category-pill--active' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Grid header */}
          <div className="section-header reveal" data-reveal>
            <h2 className="section-title">
              {activeCategory === 'All' ? 'All books' : activeCategory}
            </h2>
            {!dbLoading && (
              <span className="section-count">
                {filtered.length} {filtered.length === 1 ? 'book' : 'books'}
              </span>
            )}
          </div>

          {/* Loading skeletons */}
          {dbLoading && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 'var(--space-6)' }}>
              {[...Array(6)].map((_, i) => (
                <div key={i}>
                  <div className="skeleton" style={{ aspectRatio: '2/3', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' }} />
                  <div className="skeleton" style={{ height: 14, width: '80%', marginBottom: 8 }} />
                  <div className="skeleton" style={{ height: 11, width: '50%' }} />
                </div>
              ))}
            </div>
          )}

          {/* Book grid */}
          {!dbLoading && (
            <div className="book-grid">
              {filtered.map((book, i) => (
                <BookCard key={book.id} book={book} navigate={navigate} index={i} />
              ))}

              {filtered.length === 0 && !extLoading && (
                <div style={{ gridColumn: '1/-1', padding: 'var(--space-20) 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                  <p style={{ marginBottom: 'var(--space-3)', fontSize: 'var(--text-base)' }}>
                    {query ? `No results for "${query}"` : 'No books yet.'}
                  </p>
                  {query && (
                    <button className="btn btn-ghost" onClick={() => { setQuery(''); setActiveCategory('All'); }}>
                      Clear search
                    </button>
                  )}
                </div>
              )}

              {/* Loading placeholders while external results arrive */}
              {extLoading && filtered.length === 0 && (
                [...Array(4)].map((_, i) => (
                  <div key={`skel-${i}`}>
                    <div className="skeleton" style={{ aspectRatio: '2/3', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' }} />
                    <div className="skeleton" style={{ height: 14, width: '80%', marginBottom: 8 }} />
                    <div className="skeleton" style={{ height: 11, width: '50%' }} />
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </section>

      <RevealObserver />
    </div>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero({ stats, navigate }) {
  return (
    <section className="hero">
      <div className="container">
        <p className="hero-eyebrow reveal" data-reveal>Free knowledge for everyone</p>
        <h1 className="hero-title reveal" data-reveal>
          Read what <em>matters</em>,<br />whenever you want.
        </h1>
        <p className="hero-sub reveal" data-reveal>
          A curated library of PDF books. Read online, download freely, share generously.
        </p>
        <div className="hero-actions reveal" data-reveal>
          <button className="btn btn-primary" onClick={() => navigate('/auth')}>Get started free</button>
          <button className="btn btn-secondary" onClick={() => document.querySelector('.search-wrap')?.scrollIntoView({ behavior: 'smooth' })}>
            Browse library
          </button>
        </div>
      </div>
      <div className="container">
        <div className="stats-strip reveal" data-reveal>
          <StatItem value={stats.books} label="Books" />
          <StatItem value={stats.downloads > 0 ? `${(stats.downloads / 1000).toFixed(0)}k+` : '0'} label="Downloads" />
          <StatItem value={stats.categories} label="Categories" />
          <StatItem value={stats.avgRating} label="Avg rating" />
        </div>
      </div>
    </section>
  );
}

function StatItem({ value, label }) {
  return (
    <div className="stat-item">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

// ─── Book card ────────────────────────────────────────────────────────────────
function BookCard({ book, navigate, index }) {
  const handleClick = () => {
    if (book._ol) {
      window.open(`https://openlibrary.org${book.id.replace('ol-', '').replace(/^\/works/, '/works')}`, '_blank');
    } else if (book._external) {
      window.open(book.file_url, '_blank');
    } else {
      navigate(`/book/${book.id}`);
    }
  };

  return (
    <article className="book-card" style={{ animationDelay: `${index * 40}ms` }} onClick={handleClick}>
      <div className="book-cover">
        {book.cover_url
          ? <img src={book.cover_url} alt={book.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <BookCoverPlaceholder book={book} />
        }
      </div>
      <div className="book-info">
        <h3 className="book-title">{book.title}</h3>
        <p className="book-author">{book.author}</p>
        <div className="book-meta">
          {book.rating > 0 && (
            <span className="book-rating">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              {book.rating}
            </span>
          )}
          <span className="book-pages">{book.category}</span>
        </div>
      </div>
    </article>
  );
}

function BookCoverPlaceholder({ book }) {
  return (
    <div className="book-cover-placeholder" style={{ background: TINTS[book.category] || 'var(--bg-raised)' }}>
      <span className="book-cover-letter">{book.title?.[0] || '?'}</span>
      <span className="book-cover-line" />
      <span className="book-cover-cat">{book.category}</span>
    </div>
  );
}

// ─── Scroll reveal ────────────────────────────────────────────────────────────
function RevealObserver() {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]');
    const io  = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); }
      }),
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}