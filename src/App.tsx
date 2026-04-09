import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";

import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";

const TeacherSchedule = lazy(() => import("./pages/TeacherSchedule"));
const StudentSchedule = lazy(() => import("./pages/StudentSchedule"));
const AuditSystems = lazy(() => import("./pages/AuditSystems"));
const Tracking = lazy(() => import("./pages/Tracking"));
const EmptyRooms = lazy(() => import("./pages/EmptyRooms"));
const Assignments = lazy(() => import("./pages/Assignments"));
const Charts = lazy(() => import("./pages/Charts"));

const queryClient = new QueryClient();

const Loading = () => (
  <div className="schedule-body flex items-center justify-center min-h-screen" dir="rtl">
    <div className="text-center">
      <div className="text-4xl mb-4 animate-pulse">⏳</div>
      <p className="text-lg font-bold text-[var(--schedule-muted)]">جاري التحميل...</p>
    </div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/teacher" element={<TeacherSchedule />} />
            <Route path="/student" element={<StudentSchedule />} />
            <Route path="/audit" element={<AuditSystems />} />
            <Route path="/tracking" element={<Tracking />} />
            <Route path="/empty-rooms" element={<EmptyRooms />} />
            <Route path="/assignments" element={<Assignments />} />
            <Route path="/charts" element={<Charts />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
