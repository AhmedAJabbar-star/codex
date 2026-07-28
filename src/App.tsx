import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";

import NotFound from "./pages/NotFound";
import StatusBar from "./components/shared/StatusBar";
import CommandPalette from "./components/shared/CommandPalette";
import { getRuleByPath, syncRulesFromRemote, SYSTEM_ACCESS_RULES_UPDATED_EVENT } from "@/lib/systemAccess";
import TeacherAuthGate from "@/components/shared/TeacherAuthGate";


const Dashboard = lazy(() => import("./pages/Dashboard"));
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
const QuotaAudit = lazy(() => import("./pages/QuotaAudit"));
const SupervisionReport = lazy(() => import("./pages/SupervisionReport"));
const ExpiredSupervision = lazy(() => import("./pages/ExpiredSupervision"));
const StudentsWithoutSupervisor = lazy(() => import("./pages/StudentsWithoutSupervisor"));
const ResearchPhaseStudents = lazy(() => import("./pages/ResearchPhaseStudents"));
const SupervisionCap = lazy(() => import("./pages/SupervisionCap"));
const Projects = lazy(() => import("./pages/Projects"));
const FourthStageStudents = lazy(() => import("./pages/FourthStageStudents"));
const ProjectsAssignmentsAudit = lazy(() => import("./pages/ProjectsAssignmentsAudit"));
const SystemGroupPage = lazy(() => import("./pages/SystemGroup"));
const AuditSingle = lazy(() => import("./pages/AuditSingle"));
const SupervisionWorkload = lazy(() => import("./pages/SupervisionWorkload"));
const ProjectSupervisionExceeded = lazy(() => import("./pages/ProjectSupervisionExceeded"));
const TeachersWithoutTheory = lazy(() => import("./pages/TeachersWithoutTheory"));
const UnassignedSupervisors = lazy(() => import("./pages/UnassignedSupervisors"));
const GenericSystem = lazy(() => import("./pages/GenericSystem"));

const queryClient = new QueryClient();

const PROTECTED_OK_PREFIX = 'protected-ok:';
const sessionOk = (path: string) => {
  try { return sessionStorage.getItem(PROTECTED_OK_PREFIX + path) === '1'; } catch { return false; }
};
const markSessionOk = (path: string) => {
  try { sessionStorage.setItem(PROTECTED_OK_PREFIX + path, '1'); } catch { /* ignore */ }
};

const PasswordGate = ({ pathname, verify, onSuccess }: { pathname: string; verify: (pw: string) => Promise<boolean>; onSuccess: () => void }) => {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const ok = await verify(pw || '');
      if (ok) {
        markSessionOk(pathname);
        onSuccess();
      } else {
        setErr('كلمة المرور غير صحيحة');
      }
    } catch {
      setErr('تعذر التحقق من كلمة المرور، حاول مجدداً');
    } finally {
      setBusy(false);
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
  const gated = rule.require_teacher_auth ? <TeacherAuthGate>{children}</TeacherAuthGate> : children;
  if (!rule.protected || ok) return gated;

  return <PasswordGate pathname={pathname} expected={rule.password || ''} onSuccess={() => setOk(true)} />;
};


// Gate for /custom/:id routes — fetches the system def and checks its `protected/password`.
const CustomSystemGate = ({ children }: { children: JSX.Element }) => {
  const { pathname } = useLocation();
  const rawId = pathname.replace(/^\/custom\//, '').replace(/\/$/, '');
  let id = rawId;
  try { id = decodeURIComponent(rawId); } catch { /* keep raw */ }
  const [state, setState] = useState<{ loading: boolean; protected: boolean; password: string; visible: boolean; requireTeacherAuth: boolean }>(
    { loading: true, protected: false, password: '', visible: true, requireTeacherAuth: false },
  );
  const [ok, setOk] = useState(() => sessionOk(pathname));

  useEffect(() => {
    let alive = true;
    import('@/data/customSystemsRegistry').then(({ listCustomSystems }) => listCustomSystems())
      .then((all) => {
        if (!alive) return;
        const s = all.find((x) => x.id === id);
        if (!s) { setState({ loading: false, protected: false, password: '', visible: false, requireTeacherAuth: false }); return; }
        setState({ loading: false, protected: !!s.protected, password: s.password || '', visible: s.enabled !== false, requireTeacherAuth: !!s.require_teacher_auth });
      })
      .catch(() => alive && setState({ loading: false, protected: false, password: '', visible: false, requireTeacherAuth: false }));
    return () => { alive = false; };
  }, [id]);

  if (state.loading) return <Loading />;
  if (!state.visible) return <Navigate to="/" replace />;
  const gated = state.requireTeacherAuth ? <TeacherAuthGate>{children}</TeacherAuthGate> : children;
  if (!state.protected || ok || sessionOk(pathname)) return gated;
  return <PasswordGate pathname={pathname} expected={state.password} onSuccess={() => setOk(true)} />;
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
  useEffect(() => {
    void syncRulesFromRemote();
  }, []);

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
            <Route path="/audit-report" element={<ProtectedRoute><AuditSingle systemId="report" title="تدقيق الجدول الدراسي" /></ProtectedRoute>} />
            <Route path="/audit-hours" element={<ProtectedRoute><AuditSingle systemId="hours" title="تدقيق الساعات الدراسية" /></ProtectedRoute>} />
            <Route path="/audit-lecture-type" element={<ProtectedRoute><AuditSingle systemId="lectureTypeAudit" title="تدقيق نوع المحاضرة" /></ProtectedRoute>} />
            <Route path="/audit-assignments" element={<ProtectedRoute><AuditSingle systemId="assignmentsAudit" title="تدقيق تكليفات القسم" /></ProtectedRoute>} />
            <Route path="/tracking" element={<ProtectedRoute><Tracking /></ProtectedRoute>} />
            <Route path="/empty-rooms" element={<ProtectedRoute><EmptyRooms /></ProtectedRoute>} />
            <Route path="/assignments" element={<ProtectedRoute><Assignments /></ProtectedRoute>} />
            <Route path="/charts" element={<ProtectedRoute><Charts /></ProtectedRoute>} />
            <Route path="/errors" element={<ProtectedRoute><ErrorsSummary /></ProtectedRoute>} />
            <Route path="/individual-assignments" element={<ProtectedRoute><IndividualAssignments /></ProtectedRoute>} />
            <Route path="/quota-audit" element={<ProtectedRoute><QuotaAudit /></ProtectedRoute>} />
            <Route path="/supervision-report" element={<ProtectedRoute><SupervisionReport /></ProtectedRoute>} />
            <Route path="/expired-supervision" element={<ProtectedRoute><ExpiredSupervision /></ProtectedRoute>} />
            <Route path="/students-without-supervisor" element={<ProtectedRoute><StudentsWithoutSupervisor /></ProtectedRoute>} />
            <Route path="/research-phase-students" element={<ProtectedRoute><ResearchPhaseStudents /></ProtectedRoute>} />
            <Route path="/supervision-cap" element={<ProtectedRoute><SupervisionCap /></ProtectedRoute>} />
            <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
            <Route path="/fourth-stage-students" element={<ProtectedRoute><FourthStageStudents /></ProtectedRoute>} />
            <Route path="/projects-assignments-audit" element={<ProtectedRoute><ProjectsAssignmentsAudit /></ProtectedRoute>} />
            <Route path="/supervision-workload" element={<ProtectedRoute><SupervisionWorkload /></ProtectedRoute>} />
            <Route path="/project-supervision-exceeded" element={<ProtectedRoute><ProjectSupervisionExceeded /></ProtectedRoute>} />
            <Route path="/teachers-without-theory" element={<ProtectedRoute><TeachersWithoutTheory /></ProtectedRoute>} />
            <Route path="/unassigned-supervisors" element={<ProtectedRoute><UnassignedSupervisors /></ProtectedRoute>} />
            <Route path="/custom/:id" element={<CustomSystemGate><GenericSystem /></CustomSystemGate>} />
            <Route path="/group/:groupId" element={<SystemGroupPage />} />
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
