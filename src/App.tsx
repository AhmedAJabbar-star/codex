import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense, useState, type ReactNode } from "react";

import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import StatusBar from "./components/shared/StatusBar";
import CommandPalette from "./components/shared/CommandPalette";
import { getRuleByPath } from "@/lib/systemAccess";

const TeacherSchedule = lazy(() => import("./pages/TeacherSchedule"));
const StudentSchedule = lazy(() => import("./pages/StudentSchedule"));
const AuditSystems = lazy(() => import("./pages/AuditSystems"));
const Tracking = lazy(() => import("./pages/Tracking"));
const EmptyRooms = lazy(() => import("./pages/EmptyRooms"));
const Assignments = lazy(() => import("./pages/Assignments"));
const Charts = lazy(() => import("./pages/Charts"));
const ErrorsSummary = lazy(() => import("./pages/ErrorsSummary"));
const IndividualAssignments = lazy(() => import("./pages/IndividualAssignments"));
const ControlPanel = lazy(() => import("./pages/ControlPanel"));

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { pathname } = useLocation();
  const rule = getRuleByPath(pathname);
  const [ok, setOk] = useState(!rule?.protected);

  if (!rule) return children;
  if (rule.visible === false) return <Navigate to="/" replace />;
  if (!rule.protected || ok) return children;

  return (
    <div className="schedule-body min-h-screen flex items-center justify-center" dir="rtl">
      <div className="schedule-card p-6 w-full max-w-md text-center">
        <h2 className="text-xl font-black mb-4">النظام محمي بكلمة مرور</h2>
        <button className="schedule-btn schedule-btn-primary" onClick={() => {
          const v = window.prompt('أدخل كلمة المرور');
          if ((v || '') === (rule.password || '')) setOk(true);
          else alert('كلمة المرور غير صحيحة');
        }}>إدخال كلمة المرور</button>
      </div>
    </div>
  );
};


const ControlPanelGate = ({ children }: { children: ReactNode }) => {
  const [ok, setOk] = useState(false);
  if (ok) return children;
  return (
    <div className="schedule-body min-h-screen flex items-center justify-center" dir="rtl">
      <div className="schedule-card p-6 w-full max-w-md text-center">
        <h2 className="text-xl font-black mb-4">لوحة التحكم محمية</h2>
        <button className="schedule-btn schedule-btn-primary" onClick={() => {
          const v = window.prompt('أدخل كلمة مرور لوحة التحكم');
          if ((v || '') === '2021') setOk(true);
          else alert('كلمة المرور غير صحيحة');
        }}>إدخال كلمة المرور</button>
      </div>
    </div>
  );
};

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
        <CommandPalette />
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/control-panel" element={<ControlPanelGate><ControlPanel /></ControlPanelGate>} />
            <Route path="/teacher" element={<ProtectedRoute><TeacherSchedule /></ProtectedRoute>} />
            <Route path="/student" element={<ProtectedRoute><StudentSchedule /></ProtectedRoute>} />
            <Route path="/audit" element={<ProtectedRoute><AuditSystems /></ProtectedRoute>} />
            <Route path="/tracking" element={<ProtectedRoute><Tracking /></ProtectedRoute>} />
            <Route path="/empty-rooms" element={<ProtectedRoute><EmptyRooms /></ProtectedRoute>} />
            <Route path="/assignments" element={<ProtectedRoute><Assignments /></ProtectedRoute>} />
            <Route path="/charts" element={<ProtectedRoute><Charts /></ProtectedRoute>} />
            <Route path="/errors" element={<ProtectedRoute><ErrorsSummary /></ProtectedRoute>} />
            <Route path="/individual-assignments" element={<ProtectedRoute><IndividualAssignments /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        <StatusBar />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
