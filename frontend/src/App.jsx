import { BrowserRouter, Route, Routes } from "react-router-dom";
import AppHeader from "./components/AppHeader";
import Dashboard from "./pages/Dashboard";
import LectureList from "./pages/LectureList";
import NotebookEditor from "./pages/NotebookEditor";
import ProcessingProgress from "./pages/ProcessingProgress";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen" dir="rtl">
        <AppHeader />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/courses/:courseName" element={<LectureList />} />
            <Route
              path="/courses/:courseName/lectures/:lectureId/progress"
              element={<ProcessingProgress />}
            />
            <Route
              path="/courses/:courseName/lectures/:lectureId/notebook"
              element={<NotebookEditor />}
            />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
