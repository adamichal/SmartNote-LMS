export default function NotebookToc({ headings, activeId, onSelect }) {
  if (!headings.length) return null;

  const topLevel = headings.filter((heading) => heading.level <= 2);

  return (
    <>
      <div className="notebook-toc-mobile mb-3 lg:hidden">
        <label className="notebook-toc__label" htmlFor="notebook-toc-mobile">
          תוכן עניינים
        </label>
        <select
          id="notebook-toc-mobile"
          className="notebook-toc__select"
          defaultValue=""
          onChange={(event) => {
            if (event.target.value) onSelect?.(event.target.value);
            event.target.value = "";
          }}
        >
          <option value="">קפיצה לסעיף...</option>
          {topLevel.map((heading) => (
            <option key={heading.id} value={heading.id}>
              {heading.level > 1 ? "  " : ""}
              {heading.text}
            </option>
          ))}
        </select>
      </div>

      <aside className="notebook-toc hidden w-60 shrink-0 lg:block">
        <p className="notebook-toc__title">תוכן עניינים</p>
        <nav className="notebook-toc__nav">
          {topLevel.map((heading) => (
            <button
              key={heading.id}
              type="button"
              onClick={() => onSelect?.(heading.id)}
              className={`notebook-toc__item notebook-toc__item--level-${heading.level} ${
                activeId === heading.id ? "notebook-toc__item--active" : ""
              }`}
            >
              <span className="notebook-toc__bullet" aria-hidden="true" />
              <span className="notebook-toc__text">{heading.text}</span>
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
}
