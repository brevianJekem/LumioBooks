import { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../App';

const CATEGORIES = ['Design', 'Technology', 'Philosophy', 'Science', 'Literature', 'Business'];

const EMPTY_FORM = {
  title: '', author: '', category: '', description: '', year: new Date().getFullYear(),
};

// ─── Gutenberg API ────────────────────────────────────────────────────────────
async function searchGutenberg(query) {
  const res  = await fetch(`https://gutendex.com/books/?search=${encodeURIComponent(query)}&mime_type=application/pdf`);
  const data = await res.json();
  return data.results || [];
}

function getGutenbergPdf(book) {
  const formats = book.formats || {};
  return (
    formats['application/pdf'] ||
    formats['application/pdf; charset=utf-8'] ||
    null
  );
}

function getGutenbergCover(book) {
  const formats = book.formats || {};
  return (
    formats['image/jpeg'] ||
    formats['image/png'] ||
    null
  );
}

function gutenbergCategory(subjects) {
  if (!subjects?.length) return 'Literature';
  const s = subjects.join(' ').toLowerCase();
  if (s.includes('philosoph'))           return 'Philosophy';
  if (s.includes('science') || s.includes('biology') || s.includes('physics')) return 'Science';
  if (s.includes('technolog') || s.includes('computer')) return 'Technology';
  if (s.includes('business') || s.includes('econom'))   return 'Business';
  if (s.includes('design') || s.includes('art'))        return 'Design';
  return 'Literature';
}

export default function PublisherDashboard() {
  const { session, navigate, supabase } = useApp();

  // Upload form
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [file,      setFile]      = useState(null);
  const [dragOver,  setDragOver]  = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress]  = useState(0);

  // My books
  const [myBooks,      setMyBooks]      = useState([]);
  const [loadingBooks, setLoadingBooks] = useState(false);

  // Gutenberg
  const [gutQuery,    setGutQuery]    = useState('');
  const [gutResults,  setGutResults]  = useState([]);
  const [gutLoading,  setGutLoading]  = useState(false);
  const [gutError,    setGutError]    = useState(null);
  const [importing,   setImporting]   = useState(null); // book id being imported

  // Toast
  const [toast, setToast] = useState(null);

  const fileInputRef = useRef(null);

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadBooks = useCallback(async () => {
    if (!session) return;
    setLoadingBooks(true);
    const { data, error } = await supabase
      .from('books').select('*')
      .eq('publisher_id', session.user.id)
      .order('created_at', { ascending: false });
    if (!error && data) setMyBooks(data);
    setLoadingBooks(false);
  }, [session, supabase]);

  useEffect(() => { loadBooks(); }, [loadBooks]);

  if (!session) {
    return (
      <div className="page publisher-page">
        <div className="container" style={{ maxWidth: 480, textAlign: 'center', padding: 'var(--space-32) var(--space-8)' }}>
          <p className="hero-eyebrow">Publisher access</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', fontWeight: 600, letterSpacing: '-0.03em', marginBottom: 'var(--space-4)' }}>
            Sign in to publish
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-8)', fontWeight: 300 }}>
            Upload books and reach thousands of readers.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/auth')}>Sign in</button>
        </div>
      </div>
    );
  }

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleFile = (f) => {
    if (!f) return;
    if (f.type !== 'application/pdf') { showToast('Only PDF files are supported.', 'error'); return; }
    if (f.size > 52428800)            { showToast('File too large. Maximum size is 50MB.', 'error'); return; }
    setFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  // ─── Manual upload ────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!file)              { showToast('Please select a PDF file.', 'error'); return; }
    if (!form.title.trim()) { showToast('Title is required.', 'error'); return; }
    if (!form.author.trim()){ showToast('Author is required.', 'error'); return; }
    if (!form.category)     { showToast('Please select a category.', 'error'); return; }

    setUploading(true); setProgress(10);

    try {
      const path = `${session.user.id}/${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('pdfs').upload(path, file, { contentType: 'application/pdf', upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      setProgress(60);

      const { data: urlData } = supabase.storage.from('pdfs').getPublicUrl(path);
      setProgress(75);

      const { data: book, error: dbError } = await supabase.from('books').insert({
        title:        form.title.trim(),
        author:       form.author.trim(),
        category:     form.category,
        description:  form.description.trim(),
        year:         Number(form.year) || new Date().getFullYear(),
        file_url:     urlData.publicUrl,
        publisher_id: session.user.id,
        status:       'approved',
        pages: 0, downloads: 0,
      }).select().single();

      if (dbError) throw new Error(dbError.message);
      setProgress(100);
      setMyBooks(prev => [book, ...prev]);
      setForm(EMPTY_FORM); setFile(null);
      showToast('Book published.', 'success');
    } catch (err) {
      showToast(err.message || 'Upload failed.', 'error');
    } finally {
      setUploading(false); setProgress(0);
    }
  };

  // ─── Gutenberg import ─────────────────────────────────────────────────────
  const handleGutSearch = async () => {
    if (!gutQuery.trim()) return;
    setGutLoading(true); setGutError(null); setGutResults([]);
    try {
      const results = await searchGutenberg(gutQuery);
      if (results.length === 0) setGutError('No results with a PDF available. Try a different title.');
      setGutResults(results);
    } catch {
      setGutError('Could not reach Gutenberg. Check your internet.');
    } finally {
      setGutLoading(false);
    }
  };

  const handleImport = async (gutBook) => {
    const pdfUrl = getGutenbergPdf(gutBook);
    if (!pdfUrl) { showToast('No PDF available for this book.', 'error'); return; }

    setImporting(gutBook.id);

    try {
      const author   = gutBook.authors?.[0]?.name || 'Unknown';
      const title    = gutBook.title || 'Untitled';
      const coverUrl = getGutenbergCover(gutBook);
      const category = gutenbergCategory(gutBook.subjects);
      const year     = gutBook.authors?.[0]?.birth_year || null;

      const { data: book, error: dbError } = await supabase.from('books').insert({
        title,
        author,
        category,
        description:  gutBook.subjects?.slice(0, 3).join(', ') || '',
        year,
        file_url:     pdfUrl,
        cover_url:    coverUrl,
        publisher_id: session.user.id,
        status:       'approved',
        pages:        0,
        downloads:    gutBook.download_count || 0,
      }).select().single();

      if (dbError) throw new Error(dbError.message);

      setMyBooks(prev => [book, ...prev]);
      showToast(`"${title}" imported successfully.`, 'success');

      // Remove from results
      setGutResults(prev => prev.filter(b => b.id !== gutBook.id));
    } catch (err) {
      showToast(err.message || 'Import failed.', 'error');
    } finally {
      setImporting(null);
    }
  };

  const handleDelete = async (book) => {
    if (!window.confirm(`Remove "${book.title}"?`)) return;
    const { error } = await supabase.from('books').delete().eq('id', book.id);
    if (error) { showToast('Could not remove book.', 'error'); return; }
    setMyBooks(prev => prev.filter(b => b.id !== book.id));
    showToast('Book removed.', 'info');
  };

  return (
    <div className="page publisher-page">
      <div className="container">

        {/* Header */}
        <div className="publisher-header">
          <p className="hero-eyebrow">Publisher</p>
          <h1 className="publisher-title">Your library</h1>
          <p className="publisher-sub">Upload your own books or import classics from Project Gutenberg.</p>
        </div>

        {/* ── Gutenberg Import ── */}
        <div className="gut-section">
          <div className="gut-header">
            <div>
              <h2 className="section-title">Import from Project Gutenberg</h2>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', marginTop: 4 }}>
                70,000+ free, legal, public domain books. Search and import in one click.
              </p>
            </div>
          </div>

          {/* Search bar */}
          <div className="gut-search">
            <div className="search-wrap" style={{ flex: 1, marginBottom: 0 }}>
              <span className="search-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </span>
              <input
                className="search-input"
                type="search"
                placeholder="Search by title or author… e.g. Sherlock Holmes, Plato"
                value={gutQuery}
                onChange={e => setGutQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleGutSearch()}
              />
            </div>
            <button className="btn btn-primary" onClick={handleGutSearch} disabled={gutLoading} style={{ flexShrink: 0 }}>
              {gutLoading ? '…' : 'Search'}
            </button>
          </div>

          {gutError && (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', marginTop: 'var(--space-4)' }}>
              {gutError}
            </p>
          )}

          {/* Results */}
          {gutResults.length > 0 && (
            <div className="gut-results">
              {gutResults.map(book => {
                const pdfUrl = getGutenbergPdf(book);
                const cover  = getGutenbergCover(book);
                const author = book.authors?.[0]?.name || 'Unknown';
                return (
                  <div key={book.id} className="gut-result-item">
                    {cover
                      ? <img src={cover} alt={book.title} className="gut-cover" />
                      : <div className="gut-cover gut-cover-placeholder">{book.title?.[0]}</div>
                    }
                    <div className="gut-result-info">
                      <p className="gut-result-title">{book.title}</p>
                      <p className="gut-result-author">{author}</p>
                      <p className="gut-result-meta">
                        {book.subjects?.slice(0, 2).join(' · ')}
                        {book.download_count ? ` · ${book.download_count.toLocaleString()} downloads` : ''}
                      </p>
                    </div>
                    <button
                      className="btn btn-secondary"
                      style={{ flexShrink: 0 }}
                      onClick={() => handleImport(book)}
                      disabled={importing === book.id || !pdfUrl}
                    >
                      {importing === book.id ? '…' : pdfUrl ? 'Import' : 'No PDF'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Manual Upload ── */}
        <div style={{ marginTop: 'var(--space-16)' }}>
          <h2 className="section-title" style={{ marginBottom: 'var(--space-6)' }}>Upload your own PDF</h2>

          {/* Drop zone */}
          <div
            className={`upload-zone${dragOver ? ' upload-zone--active' : ''}${file ? ' upload-zone--filled' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
            <div className="upload-icon">
              {file
                ? <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                : <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              }
            </div>
            {file
              ? <><p className="upload-label">{file.name}</p><p className="upload-hint">{(file.size / 1024 / 1024).toFixed(1)} MB · Click to change</p></>
              : <><p className="upload-label">Drop your PDF here</p><p className="upload-hint">or click to browse · max 50 MB</p></>
            }
            {uploading && (
              <div className="progress-bar-wrap" style={{ width: '60%', margin: 'var(--space-4) auto 0' }}>
                <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>

          <div className="upload-form">
            <div className="form-group">
              <label className="form-label">Title *</label>
              <input className="form-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Things Fall Apart" />
            </div>
            <div className="form-group">
              <label className="form-label">Author *</label>
              <input className="form-input" value={form.author} onChange={e => set('author', e.target.value)} placeholder="e.g. Chinua Achebe" />
            </div>
            <div className="form-group">
              <label className="form-label">Category *</label>
              <select className="form-select" value={form.category} onChange={e => set('category', e.target.value)}>
                <option value="">Select a category</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Year</label>
              <input className="form-input" type="number" value={form.year} onChange={e => set('year', e.target.value)} min="1800" max={new Date().getFullYear()} />
            </div>
            <div className="form-group full-span">
              <label className="form-label">Description</label>
              <textarea className="form-textarea" value={form.description} onChange={e => set('description', e.target.value)} placeholder="A short description…" />
            </div>
            <div className="full-span" style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
              <button className="btn btn-secondary" onClick={() => { setForm(EMPTY_FORM); setFile(null); }}>Clear</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={uploading}>
                {uploading ? `Uploading ${progress}%…` : 'Publish book'}
              </button>
            </div>
          </div>
        </div>

        {/* ── My Books ── */}
        <section style={{ marginTop: 'var(--space-20)' }}>
          <div className="section-header">
            <h2 className="section-title">Your books</h2>
            <span className="section-count">{myBooks.length}</span>
          </div>

          {loadingBooks && <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>Loading…</p>}

          {!loadingBooks && myBooks.length === 0 && (
            <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', padding: 'var(--space-8) 0' }}>
              No books yet. Upload or import one above.
            </p>
          )}

          {!loadingBooks && myBooks.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {myBooks.map(b => (
                <div key={b.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: 'var(--space-4) var(--space-5)',
                  background: 'var(--bg-raised)', border: '1px solid var(--border-soft)',
                  borderRadius: 'var(--radius-md)', gap: 'var(--space-4)',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 500, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title}</p>
                    <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{b.author} · {b.category}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexShrink: 0 }}>
                    <span style={{
                      fontSize: 'var(--text-xs)', padding: '3px 10px', borderRadius: 'var(--radius-full)',
                      background: b.status === 'approved' ? 'rgba(52,199,89,0.1)' : 'var(--bg-sunken)',
                      color: b.status === 'approved' ? '#34C759' : 'var(--text-tertiary)',
                      fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em',
                    }}>{b.status}</span>
                    <button style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}
                      onMouseEnter={e => e.target.style.color = 'var(--text-primary)'}
                      onMouseLeave={e => e.target.style.color = 'var(--text-tertiary)'}
                      onClick={() => navigate(`/book/${b.id}`)}>View</button>
                    <button style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}
                      onMouseEnter={e => e.target.style.color = '#C0392B'}
                      onMouseLeave={e => e.target.style.color = 'var(--text-tertiary)'}
                      onClick={() => handleDelete(b)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {toast && (
        <div className="toast toast--visible" style={{
          background: toast.type === 'error' ? '#8B4A4A' : toast.type === 'success' ? '#2D6A4F' : 'var(--ink)',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}