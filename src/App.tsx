import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";

import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import StatusBar from "./components/shared/StatusBar";
import CommandPalette from "./components/shared/CommandPalette";
import { getRuleByPath, syncRulesFromRemote, SYSTEM_ACCESS_RULES_UPDATED_EVENT } from "@/lib/systemAccess";

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

const PROTECTED_OK_PREFIX = 'protected-ok:';
const sessionOk = (path: string) => {
  try { return sessionStorage.getItem(PROTECTED_OK_PREFIX + path) === '1'; } catch { return false; }
};
const markSessionOk = (path: string) => {
  try { sessionStorage.setItem(PROTECTED_OK_PREFIX + path, '1'); } catch { /* ignore */ }
};

const PasswordGate = ({ pathname, expected, onSuccess }: { pathname: string; expected: string; onSuccess: () => void }) => {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const navigate = useNavigate();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((pw || '') === (expected || '')) {
      markSessionOk(pathname);
      onSuccess();
    } else {
      setErr('كلمة المرور غير صحيحة');
    }
  };
  return (
    <div className="schedule-body min-h-screen flex items-center justify-center px-4" dir="rtl">
      <form onSubmit={submit} className="schedule-card p-8 w-full max-w-md text-center">
        <div className="text-5xl mb-3">🔐</div>
        <h2 className="text-2xl font-black mb-1 text-[var(--schedule-text)]">النظام محمي</h2>
        <p className="text-sm font-semibold text-[var(--schedule-muted)] mb-6">يرجى إدخال كلمة المرور للوصول إلى هذا النظام</p>
        <input
          type="password"
          autoFocus
          value={pw}
          onChange={(e) => { setPw(e.target.value); setErr(''); }}
          placeholder="كلمة المرور"
          className="schedule-select w-full text-center mb-3"
          style={{ minHeight: 50, letterSpacing: 4, fontSize: 18 }}
        />
        {err && <div className="text-sm font-bold text-red-600 mb-3">{err}</div>}
        <div className="flex gap-2">
          <button type="button" className="schedule-btn flex-1" onClick={() => navigate('/')} style={{ minHeight: 46 }}>
            🏠 الرئيسية
          </button>
          <button type="submit" className="schedule-btn schedule-btn-primary flex-1" style={{ minHeight: 46 }}>
            🔓 دخول
          </button>
        </div>
      </form>
    </div>
  );
};

const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  const { pathname } = useLocation();
  const [rule, setRule] = useState(() => getRuleByPath(pathname));
  const [ok, setOk] = useState(() => sessionOk(pathname) || !rule?.protected);

  useEffect(() => {
    const refresh = () => {
      const next = getRuleByPath(pathname);
      setRule(next);
      if (sessionOk(pathname) || !next?.protected) setOk(true);
    };
    window.addEventListener(SYSTEM_ACCESS_RULES_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(SYSTEM_ACCESS_RULES_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [pathname]);

  if (!rule) return children;
  if (rule.visible === false) return <Navigate to="/" replace />;
  if (!rule.protected || ok) return children;

  return <PasswordGate pathname={pathname} expected={rule.password || ''} onSuccess={() => setOk(true)} />;
};

const Loading = () => (
  <div className="schedule-body flex items-center justify-center min-h-screen" dir="rtl">
    <div className="text-center">
      <div className="text-4xl mb-4 animate-pulse">⏳</div>
      <p className="text-lg font-bold text-[var(--schedule-muted)]">جاري التحميل...</p>
    </div>
  </div>
);


const AccessRulesBootstrap = ({ children }: { children: ReactNode }) => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void syncRulesFromRemote().finally(() => setReady(true));
  }, []);

  if (!ready) return <Loading />;
  return children;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AccessRulesBootstrap>
        <CommandPalette />
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/control-panel" element={<ProtectedRoute><ControlPanel /></ProtectedRoute>} />
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
        </AccessRulesBootstrap>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
