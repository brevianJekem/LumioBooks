import { useState, useEffect } from 'react';
import { useApp } from '../App';
import { getRecommendations, generateSummary } from '../ai.js';

const TINTS = {
  Design: '#E8E6DF', Technology: '#E4E5E8',
  Philosophy: '#EAE8E2', Science: '#E6E8E4',
  Literature: '#ECE9E3', Business: '#E9E7E2',
};

export default function BookDetail({ bookId }) {
  const { navigate, session, supabase } = useApp();

  const [book,         setBook]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [reviews,      setReviews]      = useState([]);
  const [newReview,    setNewReview]    = useState('');
  const [starRating,   setStarRating]   = useState(0);
  const [hoverStar,    setHoverStar]    = useState(0);
  const [submitting,   setSubmitting]   = useState(false);
  const [toast,        setToast]        = useState(null);
  const [aiSummary,    setAiSummary]    = useState('');
  const [recommended,  setRecommended]  = useState([]);
  const [aiLoading,    setAiLoading]    = useState(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // Fetch book from Supabase
  useEffect(() => {
    async function fetchBook() {
      setLoading(true);
      const { data, error } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookId)
        .single();

      if (!error && data) setBook(data);
      setLoading(false);
    }
    fetchBook();
  }, [bookId, supabase]);

  // Fetch reviews
  useEffect(() => {
    async function fetchReviews() {
      const { data } = await supabase
        .from('reviews').select('*').eq('book_id', bookId)
        .order('created_at', { ascending: false });
      if (data) setReviews(data);
    }
    fetchReviews();
  }, [bookId, supabase]);

  // AI — summary + recommendations (fires after book loads)
  useEffect(() => {
    if (!book) return;
    async function runAI() {
      setAiLoading(true);
      try {
        // Generate summary if description is missing or short
        if (!book.description || book.description.length < 80) {
          const summary = await generateSummary(book);
          setAiSummary(summary);
        }
        // Get recommendations from other books
        const { data: allBooks } = await supabase
          .from('books').select('id,title,author,category,description').eq('status', 'approved');
        if (allBooks?.length > 1) {
          const recs = await getRecommendations(book, allBooks);
          setRecommended(recs);
        }
      } catch { /* silent fail */ }
      setAiLoading(false);
    }
    runAI();
  }, [book, supabase]);

  const handleDownload = () => {
    if (!book?.file_url) { showToast('No file available yet.'); return; }
    const a = document.createElement('a');
    a.href = book.file_url;
    a.download = `${book.title}.pdf`;
    a.click();
    showToast('Download started.');
  };

  const handleReviewSubmit = async () => {
    if (!session) { navigate('/auth'); return; }
    if (!newReview.trim() || starRating === 0) {
      showToast('Please add a rating and comment.');
      return;
    }
    setSubmitting(true);

    const { data, error } = await supabase.from('reviews').insert({
      book_id:  bookId,
      user_id:  session.user.id,
      rating:   starRating,
      comment:  newReview.trim(),
    }).select().single();

    if (!error && data) {
      setReviews(prev => [data, ...prev]);
      setNewReview('');
      setStarRating(0);
      showToast('Review submitted.');
    } else {
      showToast('Could not submit review. Try again.');
    }
    setSubmitting(false);
  };

  // Loading
  if (loading) {
    return (
      <div className="page book-detail">
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 'var(--space-16)', paddingTop: 'var(--space-12)' }}>
            <div className="skeleton" style={{ aspectRatio: '2/3', borderRadius: 'var(--radius-md)' }} />
            <div>
              <div className="skeleton" style={{ height: 14, width: '30%', marginBottom: 'var(--space-4)' }} />
              <div className="skeleton" style={{ height: 36, width: '70%', marginBottom: 'var(--space-3)' }} />
              <div className="skeleton" style={{ height: 16, width: '40%', marginBottom: 'var(--space-8)' }} />
              <div className="skeleton" style={{ height: 80, marginBottom: 'var(--space-8)' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Not found
  if (!book) {
    return (
      <div className="page book-detail">
        <div className="container" style={{ paddingTop: 'var(--space-20)', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-tertiary)', marginBottom: 'var(--space-6)' }}>Book not found.</p>
          <button className="btn btn-secondary" onClick={() => navigate('/')}>Back to library</button>
        </div>
      </div>
    );
  }

  const avgRating = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : book.rating || '—';

  return (
    <div className="page book-detail">
      <div className="container">
        {/* Back */}
        <button className="btn btn-ghost" style={{ marginBottom: 'var(--space-8)', paddingLeft: 0 }} onClick={() => navigate('/')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          Library
        </button>

        <div className="book-detail-grid">
          {/* Cover */}
          <div>
            <div className="book-detail-cover">
              {book.cover_url
                ? <img src={book.cover_url} alt={book.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <DetailCoverPlaceholder book={book} />
              }
            </div>
          </div>

          {/* Info */}
          <div>
            <p className="book-detail-eyebrow">{book.category}{book.year ? ` · ${book.year}` : ''}</p>
            <h1 className="book-detail-title">{book.title}</h1>
            <p className="book-detail-author">by {book.author}</p>

            <div className="book-detail-stats">
              <div className="book-detail-stat">
                <div className="book-detail-stat-val">{avgRating}</div>
                <div className="book-detail-stat-label">Rating</div>
              </div>
              {book.pages > 0 && (
                <div className="book-detail-stat">
                  <div className="book-detail-stat-val">{book.pages}</div>
                  <div className="book-detail-stat-label">Pages</div>
                </div>
              )}
              <div className="book-detail-stat">
                <div className="book-detail-stat-val">{book.downloads || 0}</div>
                <div className="book-detail-stat-label">Downloads</div>
              </div>
              <div className="book-detail-stat">
                <div className="book-detail-stat-val">{reviews.length}</div>
                <div className="book-detail-stat-label">Reviews</div>
              </div>
            </div>

            {/* Description — AI-enhanced */}
            {(book.description || aiSummary) && (
              <p className="book-detail-desc">
                {aiSummary || book.description}
                {aiSummary && (
                  <span style={{ display: 'block', fontSize: 10, color: 'var(--gold)', marginTop: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    ✦ AI Summary
                  </span>
                )}
              </p>
            )}

            <div className="book-detail-actions">
              <button className="btn btn-primary" onClick={() => navigate(`/read/${book.id}`)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                Read now
              </button>
              <button className="btn btn-secondary" onClick={handleDownload}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download
              </button>
            </div>
          </div>
        </div>

        {/* AI Recommendations */}
        {(recommended.length > 0 || aiLoading) && (
          <div className="reviews-section">
            <h2 className="reviews-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--gold)"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
              You might also like
            </h2>
            {aiLoading && (
              <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                {[...Array(3)].map((_, i) => (
                  <div key={i} style={{ flex: 1 }}>
                    <div className="skeleton" style={{ aspectRatio: '2/3', borderRadius: 'var(--radius-md)', marginBottom: 8 }} />
                    <div className="skeleton" style={{ height: 12, width: '80%', marginBottom: 4 }} />
                    <div className="skeleton" style={{ height: 10, width: '60%' }} />
                  </div>
                ))}
              </div>
            )}
            {!aiLoading && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 'var(--space-5)' }}>
                {recommended.map(rec => (
                  <div key={rec.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/book/${rec.id}`)}>
                    <div style={{
                      aspectRatio: '2/3', borderRadius: 'var(--radius-md)', overflow: 'hidden',
                      background: 'var(--bg-sunken)', marginBottom: 'var(--space-2)',
                      boxShadow: 'var(--shadow-md)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--font-display)', fontSize: 32, color: 'var(--text-tertiary)',
                    }}>
                      {rec.title?.[0]}
                    </div>
                    <p style={{ fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.title}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.author}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Reviews */}
        <div className="reviews-section">
          <h2 className="reviews-title">Reviews</h2>

          <div className="review-form">
            <p style={{ fontSize: 'var(--text-sm)', fontWeight: 500, marginBottom: 'var(--space-3)', color: 'var(--text-secondary)' }}>
              {session ? 'Share your thoughts' : 'Sign in to leave a review'}
            </p>

            <div className="star-rating">
              {[1,2,3,4,5].map(star => (
                <button
                  key={star}
                  className={`star-btn${(hoverStar || starRating) >= star ? ' active' : ''}`}
                  onMouseEnter={() => setHoverStar(star)}
                  onMouseLeave={() => setHoverStar(0)}
                  onClick={() => session && setStarRating(star)}
                  disabled={!session}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill={(hoverStar || starRating) >= star ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                </button>
              ))}
            </div>

            <textarea
              className="review-textarea"
              placeholder={session ? 'What did you think?' : 'Sign in to write a review…'}
              value={newReview}
              onChange={e => setNewReview(e.target.value)}
              disabled={!session}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-primary"
                onClick={session ? handleReviewSubmit : () => navigate('/auth')}
                disabled={submitting}
              >
                {session ? (submitting ? 'Submitting…' : 'Submit review') : 'Sign in to review'}
              </button>
            </div>
          </div>

          <div className="review-list">
            {reviews.length === 0 && (
              <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', padding: 'var(--space-8) 0' }}>
                No reviews yet. Be the first.
              </p>
            )}
            {reviews.map(r => <ReviewItem key={r.id} review={r} />)}
          </div>
        </div>
      </div>

      <div className={`toast${toast ? ' toast--visible' : ''}`}>{toast}</div>
    </div>
  );
}

function ReviewItem({ review }) {
  const name = review.user || review.user_id?.slice(0, 8) || 'Reader';
  const date = review.created_at
    ? new Date(review.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
  return (
    <div className="review-item">
      <div className="review-header">
        <div className="review-meta">
          <div className="review-avatar">{name[0].toUpperCase()}</div>
          <div>
            <div className="review-name">{name}</div>
            <div className="review-date">{date}</div>
          </div>
        </div>
        <div className="review-stars">
          {[1,2,3,4,5].map(s => (
            <svg key={s} width="12" height="12" viewBox="0 0 24 24" fill={review.rating >= s ? 'var(--ink-muted)' : 'none'} stroke="var(--ink-muted)" strokeWidth="1.5">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          ))}
        </div>
      </div>
      <p className="review-body">{review.comment}</p>
    </div>
  );
}

function DetailCoverPlaceholder({ book }) {
  return (
    <div className="book-cover-placeholder" style={{ background: TINTS[book.category] || 'var(--bg-raised)', height: '100%' }}>
      <span className="book-cover-letter" style={{ fontSize: 'clamp(4rem, 10vw, 8rem)' }}>{book.title?.[0] || '?'}</span>
      <span className="book-cover-line" style={{ width: 48 }} />
      <span className="book-cover-cat">{book.category}</span>
    </div>
  );
}