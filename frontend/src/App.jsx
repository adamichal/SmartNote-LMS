import { BrowserRouter, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import LectureList from "./pages/LectureList";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50" dir="rtl">
        <header className="border-b border-gray-200 bg-white px-6 py-4">
          <h1 className="text-xl font-semibold text-gray-900">SmartNote LMS</h1>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/courses/:courseName" element={<LectureList />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
