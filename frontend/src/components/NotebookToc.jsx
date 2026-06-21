export default function NotebookToc({ headings, activeId, onSelect }) {
  if (!headings.length) return null;

  return (
    <>
      <div className="mb-3 lg:hidden">
        <label className="sr-only" htmlFor="notebook-toc-mobile">
          תוכן עניינים
        </label>
        <select
          id="notebook-toc-mobile"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          defaultValue=""
          onChange={(event) => {
            if (event.target.value) onSelect?.(event.target.value);
            event.target.value = "";
          }}
        >
          <option value="">קפוץ לסעיף...</option>
          {headings.map((heading) => (
            <option key={heading.id} value={heading.id}>
              {"\u00A0".repeat((heading.level - 1) * 2)}
              {heading.text}
            </option>
          ))}
        </select>
      </div>

      <aside className="notebook-toc hidden w-56 shrink-0 lg:block">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          תוכן עניינים
        </p>
        <nav className="space-y-1">
          {headings.map((heading) => (
            <button
              key={heading.id}
              type="button"
              onClick={() => onSelect?.(heading.id)}
              className={`block w-full rounded-lg px-2 py-1.5 text-right text-sm transition ${
                activeId === heading.id
                  ? "bg-indigo-100 font-medium text-indigo-800"
                  : "text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
              } ${heading.level === 1 ? "font-semibold" : ""}`}
              style={{ paddingRight: `${(heading.level - 1) * 0.75 + 0.5}rem` }}
            >
              {heading.text}
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
}
