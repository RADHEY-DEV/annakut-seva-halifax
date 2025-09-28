import React, { useEffect, useRef } from 'react'

export default function ConfirmModal({ open, onClose, name, email, items }) {
  const overlayRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const displayName = (name || '').trim()

  const onOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose?.()
  }

  return (
    <div
      className="modal-overlay fancy"
      role="dialog"
      aria-modal="true"
      ref={overlayRef}
      onClick={onOverlayClick}
    >
      {/* Gradient animated frame around the modal */}
      <div className="modal-frame">
        <div className="modal">
          <button
            aria-label="Close"
            className="modal-close"
            onClick={onClose}
          >×</button>

          <div className="check-icon" aria-hidden>✓</div>

          <h2 className="modal-title">
          Jay Swāminārāyan {displayName ? ', ' : '!'}
            {displayName ? <span className="name-accent">{displayName}</span> : null}
            {displayName ? '!' : ''}
          </h2>

          <p>
            Thank you for Annakut Vaangi Seva. We look forward to see you during Diwali-Annakut Celebrations with your friends & family. Happy Diwali and Happy New Year. Confirmation email is sent to{' '}
            <strong>{email}</strong>.
          </p>

          {Array.isArray(items) && items.length > 0 && (
            <div className="modal-items">
              <div className="label">Confirmed Annakut Vaangi:</div>
              <ul>
                {items.map((it, idx) => <li key={idx}>{it}</li>)}
              </ul>
            </div>
          )}

          <div className="modal-actions">
            <button className="btn success" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  )
}
