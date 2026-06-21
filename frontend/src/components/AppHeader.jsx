import { Link } from "react-router-dom";

export default function AppHeader() {
  return (
    <header className="app-header border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <Link to="/" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-lg text-white shadow-sm">
            📓
          </span>
          <div>
            <p className="text-base font-bold text-slate-900">SmartNote</p>
            <p className="text-xs text-slate-500">מחברות לימוד מהרצאות</p>
          </div>
        </Link>
        <Link
          to="/"
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          כל הקורסים
        </Link>
      </div>
    </header>
  );
}
