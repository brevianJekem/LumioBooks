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

const SPEEDS = [
  { label: 'Slow',   px: 0.4 },
  { label: 'Normal', px: 0.9 },
  { label: 'Fast',   px: 1.8 },
];

export default function BookReader({ bookId }) {
  const { navigate, supabase } = useApp();

  const [book,        setBook]        = useState(null);
  const [bookLoading, setBookLoading] = useState(true);
  const [pdfDoc,      setPdfDoc]      = useState(null);
  const [totalPages,  setTotalPages]  = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [autoScroll,  setAutoScroll]  = useState(false);
  const [speedIdx,    setSpeedIdx]    = useState(1);
  const [scale,       setScale]       = useState(1);
  const [inputPage,   setInputPage]   = useState('1');

  const wrapRef       = useRef(null);
  const canvasRefs    = useRef([]);
  const rafRef        = useRef(null);
  const renderedPages = useRef(new Set());
  const observerRef   = useRef(null);

  // Hide main nav while in reader
  useEffect(() => {
    const nav = document.querySelector('.nav');
    const footer = document.querySelector('.footer');
    if (nav) nav.style.display = 'none';
    if (footer) footer.style.display = 'none';
    return () => {
      if (nav) nav.style.display = '';
      if (footer) footer.style.display = '';
    };
  }, []);

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

  // Compute scale to fit width
  const computeScale = useCallback(async (doc) => {
    if (!doc || !wrapRef.current) return 1;
    const page    = await doc.getPage(1);
    const vp      = page.getViewport({ scale: 1 });
    const padding = 48;
    return Math.min((wrapRef.current.clientWidth - padding) / vp.width, 2.5);
  }, []);

  // Load PDF
  useEffect(() => {
    if (!book?.file_url) return;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true); setError(null);
        renderedPages.current.clear();
        const pdfjs    = await getPdfJs();
        const response = await fetch(book.file_url);
        if (!response.ok) throw new Error('Failed to fetch');
        const arrayBuf = await response.arrayBuffer();
        if (cancelled) return;
        const doc = await pdfjs.getDocument({ data: arrayBuf }).promise;
        if (cancelled) return;
        const s = await computeScale(doc);
        setScale(s);
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
  }, [book?.file_url, computeScale]);

  // Render a single page onto its canvas
  const renderPage = useCallback(async (doc, pageNum, s) => {
    if (renderedPages.current.has(pageNum)) return;
    const canvas = canvasRefs.current[pageNum - 1];
    if (!canvas || !doc) return;

    renderedPages.current.add(pageNum);
    try {
      const page     = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: s });
      canvas.width   = viewport.width;
      canvas.height  = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    } catch {
      renderedPages.current.delete(pageNum);
    }
  }, []);

  // Intersection observer — render pages as they scroll into view
  useEffect(() => {
    if (!pdfDoc || !totalPages) return;

    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const idx = Number(entry.target.dataset.page);
          renderPage(pdfDoc, idx, scale);
          // Pre-render adjacent pages
          if (idx > 1)           renderPage(pdfDoc, idx - 1, scale);
          if (idx < totalPages)  renderPage(pdfDoc, idx + 1, scale);
          setCurrentPage(idx);
          setInputPage(String(idx));
        }
      });
    }, { threshold: 0.3, root: wrapRef.current });

    canvasRefs.current.forEach((canvas, i) => {
      if (canvas) observerRef.current.observe(canvas.parentElement);
    });

    return () => observerRef.current?.disconnect();
  }, [pdfDoc, totalPages, scale, renderPage]);

  // Re-render on scale change
  useEffect(() => {
    renderedPages.current.clear();
  }, [scale]);

  // Auto-scroll — smooth pixel-by-pixel
  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (!autoScroll || !wrapRef.current) return;

    const speed = SPEEDS[speedIdx].px;
    let last = performance.now();

    const tick = (now) => {
      const dt = now - last;
      last = now;
      if (wrapRef.current) {
        wrapRef.current.scrollTop += speed * dt * 0.1;
        // Stop at bottom
        const { scrollTop, scrollHeight, clientHeight } = wrapRef.current;
        if (scrollTop + clientHeight >= scrollHeight - 10) {
          setAutoScroll(false);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [autoScroll, speedIdx]);

  // Jump to page
  const goToPage = useCallback((n) => {
    const canvas = canvasRefs.current[n - 1];
    if (canvas?.parentElement && wrapRef.current) {
      wrapRef.current.scrollTo({ top: canvas.parentElement.offsetTop - 16, behavior: 'smooth' });
    }
    setCurrentPage(n);
    setInputPage(String(n));
  }, []);

  // Keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowDown' || e.key === ' ')  goToPage(Math.min(totalPages, currentPage + 1));
      if (e.key === 'ArrowUp')                      goToPage(Math.max(1, currentPage - 1));
      if (e.key === 'Escape')                       setAutoScroll(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentPage, totalPages, goToPage]);

  // Resize → recompute scale
  useEffect(() => {
    if (!pdfDoc) return;
    const onResize = async () => {
      const s = await computeScale(pdfDoc);
      renderedPages.current.clear();
      setScale(s);
    };
    const debounced = setTimeout(onResize, 200);
    window.addEventListener('resize', onResize);
    return () => { clearTimeout(debounced); window.removeEventListener('resize', onResize); };
  }, [pdfDoc, computeScale]);

  const handleDownload = () => {
    if (!book?.file_url) return;
    const a = document.createElement('a');
    a.href = book.file_url; a.download = `${book.title}.pdf`; a.target = '_blank'; a.click();
  };

  // ─── Loading states ───────────────────────────────────────────────────────
  if (bookLoading) return (
    <div className="reader-page">
      <div className="reader-toolbar">
        <button className="reader-btn" onClick={() => navigate('/')}>
          <ChevronLeft />
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
          <ChevronLeft />
        </button>
        <span className="reader-title">Reader</span>
      </div>
      <div className="reader-empty">
        <p className="reader-empty-text">Book not found.</p>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>Back to library</button>
      </div>
    </div>
  );

  // ─── Reader ───────────────────────────────────────────────────────────────
  return (
    <div className="reader-page">
      {/* Toolbar */}
      <div className="reader-toolbar">
        <button className="reader-btn" title="Back" onClick={() => { setAutoScroll(false); navigate(`/book/${book.id}`); }}>
          <ChevronLeft />
        </button>

        <span className="reader-title">{book.title}</span>

        <div className="reader-controls">
          {/* Prev / Page / Next */}
          <button className="reader-btn" onClick={() => goToPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <input
            className="reader-page-input"
            value={inputPage}
            type="number" min={1} max={totalPages}
            onChange={e => setInputPage(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && goToPage(Math.max(1, Math.min(totalPages, Number(inputPage))))}
            onBlur={() => goToPage(Math.max(1, Math.min(totalPages, Number(inputPage))))}
            onFocus={e => e.target.select()}
          />
          <span className="reader-page-sep">/ {totalPages}</span>
          <button className="reader-btn" onClick={() => goToPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>

          <Divider />

          {/* Zoom */}
          <button className="reader-btn" title="Zoom out" onClick={() => { renderedPages.current.clear(); setScale(s => Math.max(0.5, +(s - 0.15).toFixed(2))); }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          </button>
          <button className="reader-btn" title="Fit to screen" style={{ fontSize: 11, width: 'auto', padding: '0 6px', fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.5)' }}
            onClick={async () => { const s = await computeScale(pdfDoc); renderedPages.current.clear(); setScale(s); }}>
            {Math.round(scale * 100)}%
          </button>
          <button className="reader-btn" title="Zoom in" onClick={() => { renderedPages.current.clear(); setScale(s => Math.min(3, +(s + 0.15).toFixed(2))); }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          </button>

          <Divider />

          {/* Auto-scroll speed */}
          {autoScroll && (
            <button className="reader-btn" style={{ width: 'auto', padding: '0 8px', fontSize: 11, fontFamily: 'var(--font-mono)', color: '#34C759' }}
              onClick={() => setSpeedIdx(i => (i + 1) % SPEEDS.length)}>
              {SPEEDS[speedIdx].label}
            </button>
          )}

          {/* Auto-scroll toggle */}
          <button className="reader-btn" title={autoScroll ? 'Pause (Esc)' : 'Auto-scroll'}
            style={{ color: autoScroll ? '#34C759' : undefined }}
            onClick={() => setAutoScroll(a => !a)}>
            {autoScroll
              ? <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              : <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            }
          </button>

          <Divider />

          {/* Download */}
          <button className="reader-btn" title="Download" onClick={handleDownload}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
        </div>
      </div>

      {/* Auto-scroll banner */}
      {autoScroll && (
        <div style={{
          position: 'fixed', top: 48, left: 0, right: 0, zIndex: 40,
          background: 'rgba(52,199,89,0.07)',
          borderBottom: '1px solid rgba(52,199,89,0.15)',
          padding: '5px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 16, fontSize: 12, color: '#34C759',
        }}>
          <span>Auto-scrolling · {SPEEDS[speedIdx].label}</span>
          <button onClick={() => setSpeedIdx(i => (i + 1) % SPEEDS.length)} style={{ color: '#34C759', fontWeight: 600, fontSize: 11 }}>
            Change speed
          </button>
          <span style={{ opacity: 0.5 }}>· Esc to stop</span>
        </div>
      )}

      {/* Pages */}
      <div className="reader-canvas-wrap" ref={wrapRef}>
        {loading && (
          <div className="reader-empty">
            <div className="loader-dot" />
            <p className="reader-empty-text" style={{ marginTop: 16 }}>Loading PDF…</p>
          </div>
        )}

        {error && (
          <div className="reader-empty">
            <p className="reader-empty-text">{error}</p>
            <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => navigate(`/book/${book.id}`)}>Back to book</button>
          </div>
        )}

        {!loading && !error && pdfDoc && (
          <div className="reader-pages">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
              <div key={pageNum} className="reader-page-wrap" data-page={pageNum}>
                <canvas
                  ref={el => { canvasRefs.current[pageNum - 1] = el; }}
                  data-page={pageNum}
                  style={{ display: 'block', maxWidth: '100%' }}
                />
                <div className="reader-page-num">{pageNum}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Progress bar */}
      {totalPages > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 2, zIndex: 50, background: 'rgba(255,255,255,0.05)' }}>
          <div style={{ height: '100%', background: autoScroll ? '#34C759' : 'rgba(255,255,255,0.3)', width: `${(currentPage / totalPages) * 100}%`, transition: 'width 0.3s' }} />
        </div>
      )}
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────
function ChevronLeft() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>;
}
function Divider() {
  return <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.08)', margin: '0 2px', flexShrink: 0 }} />;
}