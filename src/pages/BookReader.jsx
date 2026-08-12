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

export default function BookReader({ bookId }) {
  const { navigate, supabase } = useApp();

  const [book,        setBook]        = useState(null);
  const [bookLoading, setBookLoading] = useState(true);
  const [pdfDoc,      setPdfDoc]      = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages,  setTotalPages]  = useState(0);
  const [scale,       setScale]       = useState(1.2);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [inputPage,   setInputPage]   = useState('1');
  const [isFullscreen,setIsFullscreen]= useState(false);

  const canvasRef    = useRef(null);
  const renderTask   = useRef(null);
  const containerRef = useRef(null);

  // Fetch book from Supabase
  useEffect(() => {
    async function fetchBook() {
      setBookLoading(true);
      const { data, error: err } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookId)
        .single();
      if (!err && data) setBook(data);
      setBookLoading(false);
    }
    fetchBook();
  }, [bookId, supabase]);

  // Load PDF once book is fetched
  useEffect(() => {
    if (!book?.file_url) return;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const pdfjs = await getPdfJs();

        // Fetch as blob to avoid CORS issues with Supabase storage
        const response = await fetch(book.file_url);
        if (!response.ok) throw new Error('Failed to fetch PDF');
        const blob      = await response.blob();
        const arrayBuf  = await blob.arrayBuffer();

        if (cancelled) return;
        const doc = await pdfjs.getDocument({ data: arrayBuf }).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setCurrentPage(1);
      } catch (err) {
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

  // Keyboard nav
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setCurrentPage(p => Math.min(totalPages, p + 1));
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   setCurrentPage(p => Math.max(1, p - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [totalPages]);

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
    if (n >= 1 && n <= totalPages) setCurrentPage(n);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  const handleDownload = () => {
    if (!book?.file_url) return;
    const a    = document.createElement('a');
    a.href     = book.file_url;
    a.download = `${book.title}.pdf`;
    a.target   = '_blank';
    a.click();
  };

  // ─── States ───────────────────────────────────────────────────────────────
  if (bookLoading) {
    return (
      <div className="reader-page">
        <div className="reader-toolbar">
          <button className="reader-btn" onClick={() => navigate('/')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span className="reader-title">Loading…</span>
        </div>
        <div className="reader-empty">
          <div className="loader-dot" />
        </div>
      </div>
    );
  }

  if (!book) {
    return (
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
  }

  return (
    <div className="reader-page" ref={containerRef}>
      {/* Toolbar */}
      <div className="reader-toolbar">
        <button className="reader-btn" onClick={() => navigate(`/book/${book.id}`)} title="Back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>

        <span className="reader-title">{book.title}</span>

        {book.file_url && (
          <div className="reader-controls">
            <button className="reader-btn" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} title="Previous">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>

            <input className="reader-page-input" value={inputPage} onChange={handlePageInput} onFocus={e => e.target.select()} type="number" min={1} max={totalPages} />
            <span className="reader-page-sep">/ {totalPages}</span>

            <button className="reader-btn" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} title="Next">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>

            <span style={{ width: 1, height: 20, background: 'var(--border-soft)', margin: '0 4px' }} />

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

            <button className="reader-btn" onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              {isFullscreen
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
              }
            </button>

            <button className="reader-btn" onClick={handleDownload} title="Download PDF">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
          </div>
        )}
      </div>

      {/* Canvas area */}
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
            <p className="reader-empty-text">No PDF available for this book yet.</p>
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
        <div className="progress-bar-wrap" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 2, zIndex: 50 }}>
          <div className="progress-bar-fill" style={{ width: `${(currentPage / totalPages) * 100}%` }} />
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