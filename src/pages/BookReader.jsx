import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../App';

let pdfjsLib = null;

async function getPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
  pdfjsLib = pdfjs;
  return pdfjs;
}

// Auto-scroll speeds in ms per page
const SPEEDS = [
  { label: 'Slow',   ms: 8000 },
  { label: 'Normal', ms: 5000 },
  { label: 'Fast',   ms: 2500 },
];

export default function BookReader({ bookId }) {
  const { navigate, supabase } = useApp();

  const [book,         setBook]         = useState(null);
  const [bookLoading,  setBookLoading]  = useState(true);
  const [pdfDoc,       setPdfDoc]       = useState(null);
  const [currentPage,  setCurrentPage]  = useState(1);
  const [totalPages,   setTotalPages]   = useState(0);
  const [scale,        setScale]        = useState(1.2);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [inputPage,    setInputPage]    = useState('1');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoScroll,   setAutoScroll]   = useState(false);
  const [speedIdx,     setSpeedIdx]     = useState(1); // Normal default

  const canvasRef      = useRef(null);
  const renderTask     = useRef(null);
  const containerRef   = useRef(null);
  const autoScrollRef  = useRef(null);
  const wheelDebounce  = useRef(null);

  // Fetch book
  useEffect(() => {
    async function fetchBook() {
      setBookLoading(true);
      const { data, error: err } = await supabase
        .from('books').select('*').eq('id', bookId).single();
      if (!err && data) setBook(data);
      setBookLoading(false);
    }
    fetchBook();
  }, [bookId, supabase]);

  // Load PDF
  useEffect(() => {
    if (!book?.file_url) return;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true); setError(null);
        const pdfjs    = await getPdfJs();
        const response = await fetch(book.file_url);
        if (!response.ok) throw new Error('Failed to fetch PDF');
        const arrayBuf = await response.arrayBuffer();
        if (cancelled) return;
        const doc = await pdfjs.getDocument({ data: arrayBuf }).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setCurrentPage(1);
      } catch {
        if (!cancelled) setError('Could not load PDF. The file may be unavailable.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [book?.file_url]);

  // Render page
  const renderPage = useCallback(async (doc, pageNum, pageScale) => {
    if (!canvasRef.current || !doc) return;
    if (renderTask.current) { renderTask.current.cancel(); renderTask.current = null; }

    try {
      const page     = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: pageScale });
      const canvas   = canvasRef.current;
      const ctx      = canvas.getContext('2d');

      canvas.width        = viewport.width;
      canvas.height       = viewport.height;
      canvas.style.width  = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const task = page.render({ canvasContext: ctx, viewport });
      renderTask.current = task;
      await task.promise;
      renderTask.current = null;
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') setError('Failed to render page.');
    }
  }, []);

  useEffect(() => {
    if (pdfDoc) renderPage(pdfDoc, currentPage, scale);
  }, [pdfDoc, currentPage, scale, renderPage]);

  // ─── Scroll wheel → page turn ────────────────────────────────────────────
  useEffect(() => {
    const wrap = document.querySelector('.reader-canvas-wrap');
    if (!wrap || !pdfDoc) return;

    const onWheel = (e) => {
      e.preventDefault();
      if (wheelDebounce.current) return;
      wheelDebounce.current = setTimeout(() => { wheelDebounce.current = null; }, 400);

      if (e.deltaY > 0) setCurrentPage(p => Math.min(totalPages, p + 1));
      else              setCurrentPage(p => Math.max(1, p - 1));
    };

    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, [pdfDoc, totalPages]);

  // ─── Keyboard nav ────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ')
        setCurrentPage(p => Math.min(totalPages, p + 1));
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
        setCurrentPage(p => Math.max(1, p - 1));
      if (e.key === 'Escape' && autoScroll) setAutoScroll(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [totalPages, autoScroll]);

  // ─── Auto-scroll ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (autoScrollRef.current) clearInterval(autoScrollRef.current);

    if (autoScroll && pdfDoc) {
      autoScrollRef.current = setInterval(() => {
        setCurrentPage(p => {
          if (p >= totalPages) { setAutoScroll(false); return p; }
          return p + 1;
        });
      }, SPEEDS[speedIdx].ms);
    }

    return () => { if (autoScrollRef.current) clearInterval(autoScrollRef.current); };
  }, [autoScroll, speedIdx, pdfDoc, totalPages]);

  // Stop auto-scroll when user manually turns page
  const goTo = (p) => {
    setAutoScroll(false);
    setCurrentPage(Math.max(1, Math.min(totalPages, p)));
  };

  // Fullscreen
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => { setInputPage(String(currentPage)); }, [currentPage]);

  const zoomIn  = () => setScale(s => Math.min(3,   +(s + 0.25).toFixed(2)));
  const zoomOut = () => setScale(s => Math.max(0.5, +(s - 0.25).toFixed(2)));

  const handlePageInput = (e) => {
    setInputPage(e.target.value);
    const n = parseInt(e.target.value, 10);
    if (n >= 1 && n <= totalPages) goTo(n);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  const handleDownload = () => {
    if (!book?.file_url) return;
    const a = document.createElement('a');
    a.href = book.file_url; a.download = `${book.title}.pdf`; a.target = '_blank'; a.click();
  };

  // ─── Loading / error states ───────────────────────────────────────────────
  if (bookLoading) return (
    <div className="reader-page">
      <div className="reader-toolbar">
        <button className="reader-btn" onClick={() => navigate('/')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span className="reader-title">Loading…</span>
      </div>
      <div className="reader-empty"><div className="loader-dot" /></div>
    </div>
  );

  if (!book) return (
    <div className="reader-page">
      <div className="reader-toolbar">
        <button className="reader-btn" onClick={() => navigate('/')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span className="reader-title">Reader</span>
      </div>
      <div className="reader-empty">
        <BookIcon />
        <p className="reader-empty-text">Book not found.</p>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>Back to library</button>
      </div>
    </div>
  );

  return (
    <div className="reader-page" ref={containerRef}>
      {/* Toolbar */}
      <div className="reader-toolbar">
        <button className="reader-btn" onClick={() => { setAutoScroll(false); navigate(`/book/${book.id}`); }} title="Back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>

        <span className="reader-title">{book.title}</span>

        {book.file_url && (
          <div className="reader-controls">
            {/* Prev */}
            <button className="reader-btn" onClick={() => goTo(currentPage - 1)} disabled={currentPage <= 1} title="Previous (←)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>

            {/* Page input */}
            <input className="reader-page-input" value={inputPage} onChange={handlePageInput} onFocus={e => e.target.select()} type="number" min={1} max={totalPages} />
            <span className="reader-page-sep">/ {totalPages}</span>

            {/* Next */}
            <button className="reader-btn" onClick={() => goTo(currentPage + 1)} disabled={currentPage >= totalPages} title="Next (→)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>

            <span style={{ width: 1, height: 20, background: 'var(--border-soft)', margin: '0 4px' }} />

            {/* Zoom */}
            <button className="reader-btn" onClick={zoomOut} title="Zoom out">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            </button>
            <button className="reader-btn" onClick={() => setScale(1.2)} style={{ fontSize: 'var(--text-xs)', width: 'auto', padding: '0 6px', fontFamily: 'var(--font-mono)' }}>
              {Math.round(scale * 100)}%
            </button>
            <button className="reader-btn" onClick={zoomIn} title="Zoom in">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            </button>

            <span style={{ width: 1, height: 20, background: 'var(--border-soft)', margin: '0 4px' }} />

            {/* Auto-scroll speed — only when active */}
            {autoScroll && (
              <button
                className="reader-btn"
                style={{ width: 'auto', padding: '0 8px', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}
                onClick={() => setSpeedIdx(i => (i + 1) % SPEEDS.length)}
                title="Change speed"
              >
                {SPEEDS[speedIdx].label}
              </button>
            )}

            {/* Auto-scroll toggle */}
            <button
              className="reader-btn"
              onClick={() => setAutoScroll(a => !a)}
              title={autoScroll ? 'Stop auto-scroll (Esc)' : 'Auto-scroll'}
              style={{ color: autoScroll ? '#34C759' : 'inherit' }}
            >
              {autoScroll
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              }
            </button>

            <span style={{ width: 1, height: 20, background: 'var(--border-soft)', margin: '0 4px' }} />

            {/* Fullscreen */}
            <button className="reader-btn" onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              {isFullscreen
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
              }
            </button>

            {/* Download */}
            <button className="reader-btn" onClick={handleDownload} title="Download PDF">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
          </div>
        )}
      </div>

      {/* Auto-scroll banner */}
      {autoScroll && (
        <div style={{
          position: 'fixed', top: 48, left: 0, right: 0, zIndex: 40,
          background: 'rgba(52,199,89,0.08)',
          borderBottom: '1px solid rgba(52,199,89,0.2)',
          padding: '6px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 12, fontSize: 'var(--text-xs)', color: '#34C759',
        }}>
          <span>Auto-scrolling · {SPEEDS[speedIdx].label}</span>
          <button onClick={() => setSpeedIdx(i => (i + 1) % SPEEDS.length)} style={{ color: '#34C759', fontWeight: 600, fontSize: 'var(--text-xs)' }}>
            Change speed
          </button>
          <span style={{ opacity: 0.6 }}>· Press Esc to stop</span>
        </div>
      )}

      {/* Canvas */}
      <div className="reader-canvas-wrap">
        {loading && (
          <div className="reader-empty">
            <div className="loader-dot" />
            <p className="reader-empty-text">Loading PDF…</p>
          </div>
        )}
        {error && (
          <div className="reader-empty">
            <BookIcon />
            <p className="reader-empty-text">{error}</p>
            <button className="btn btn-secondary" onClick={() => navigate(`/book/${book.id}`)}>Back to book</button>
          </div>
        )}
        {!book.file_url && !loading && (
          <div className="reader-empty">
            <BookIcon />
            <p className="reader-empty-text">No PDF available yet.</p>
            <button className="btn btn-secondary" onClick={() => navigate(`/book/${book.id}`)}>Back to book</button>
          </div>
        )}
        {book.file_url && !loading && !error && (
          <div className="reader-canvas-inner">
            <canvas ref={canvasRef} />
          </div>
        )}
      </div>

      {/* Progress bar */}
      {totalPages > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 2, zIndex: 50, background: 'var(--border-soft)' }}>
          <div style={{ height: '100%', background: autoScroll ? '#34C759' : 'var(--text-primary)', width: `${(currentPage / totalPages) * 100}%`, transition: 'width 0.4s ease' }} />
        </div>
      )}
    </div>
  );
}

function BookIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 'var(--space-4)', opacity: 0.3 }}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  );
}