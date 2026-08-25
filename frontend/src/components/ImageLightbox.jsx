import { useEffect } from "react";

export default function ImageLightbox({ src, alt, onClose }) {
  useEffect(() => {
    if (!src) return;
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div
      className="image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="תצוגת תמונה מוגדלת"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <button type="button" className="image-lightbox__close" onClick={onClose} aria-label="סגור">
        ✕
      </button>
      <div className="image-lightbox__content" onClick={(event) => event.stopPropagation()}>
        <img src={src} alt={alt || ""} className="image-lightbox__image" />
        {alt && <p className="image-lightbox__caption">{alt}</p>}
      </div>
    </div>
  );
}
