import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { StatCard } from '@/components/shared/ScheduleHelpers';
import { useNavigate } from 'react-router-dom';
import { useLiveScheduleData } from '@/hooks/useLiveSchedule';
import { fetchIndividualAssignmentRows } from '@/data/individualAssignments';
import { LiveLoadingShell } from '@/components/shared/LiveLoadingShell';

const CHART_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#be185d', '#65a30d', '#ea580c', '#6366f1'];

const ChartsPage = () => {
  const navigate = useNavigate();
  const { data: liveData, error: liveError, isLoading: liveLoading } = useLiveScheduleData();
  const { data: assignmentsRows } = useQuery({
    queryKey: ['individual-assignments'],
    queryFn: () => fetchIndividualAssignmentRows(),
    staleTime: 0,
    refetchOnMount: 'always',
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const chartData = useMemo(() => {
    const teacherRowsLive = liveData?.teacher || [];
    const studentRowsLive = liveData?.student || [];
    const reportRowsLive = liveData?.report || [];
    const hoursRowsLive = liveData?.hours || [];
    const emptyRoomsLive = liveData?.emptyRooms || [];
    const assignmentsLive = assignmentsRows || [];
    const teacherSys = { rows: teacherRowsLive };
    const studentSys = { rows: studentRowsLive };
    const reportSys = { rows: reportRowsLive };
    const hoursSys = { rows: hoursRowsLive };
    const emptyRoomsSys = { rows: emptyRoomsLive };
    const assignmentsSys = { rows: assignmentsLive };

    const dayCount: Record<string, number> = {};
    (teacherSys?.rows || []).forEach(r => { const d = r['اليوم'] || ''; if (d) dayCount[d] = (dayCount[d] || 0) + 1; });
    const byDay = Object.entries(dayCount).map(([name, value]) => ({ name, value }));

    const typeCount: Record<string, number> = {};
    (teacherSys?.rows || []).forEach(r => { const t = r['نوع المحاضرة'] || ''; if (t) typeCount[t] = (typeCount[t] || 0) + 1; });
    const byType = Object.entries(typeCount).map(([name, value]) => ({ name, value }));

    const deptCount: Record<string, number> = {};
    (teacherSys?.rows || []).forEach(r => { const d = r['القسم'] || ''; if (d) deptCount[d] = (deptCount[d] || 0) + 1; });
    const byDept = Object.entries(deptCount).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name: name.length > 25 ? name.slice(0, 25) + '...' : name, value }));

    const emptyByDay: Record<string, number> = {};
    (emptyRoomsSys?.rows || []).forEach(r => { const d = r['اليوم'] || ''; if (d) emptyByDay[d] = (emptyByDay[d] || 0) + 1; });
    const emptyDayData = Object.entries(emptyByDay).map(([name, value]) => ({ name, value }));

    const auditCount: Record<string, number> = {};
    (reportSys?.rows || []).forEach(r => {
      const hasDeficiency = r['نقص البيانات'] && r['نقص البيانات'] !== 'سليم';
      const hasConflict = r['التضارب'] && r['التضارب'] !== '';
      if (hasConflict) auditCount['تضارب'] = (auditCount['تضارب'] || 0) + 1;
      else if (hasDeficiency) auditCount['نقص بيانات'] = (auditCount['نقص بيانات'] || 0) + 1;
      else auditCount['سليم'] = (auditCount['سليم'] || 0) + 1;
    });
    const auditData = Object.entries(auditCount).map(([name, value]) => ({ name, value }));

    const hoursData = (() => {
      const deptHours: Record<string, { schedule: number; program: number }> = {};
      (hoursSys?.rows || []).forEach(r => {
        const dept = r['القسم'] || 'غير محدد';
        if (!deptHours[dept]) deptHours[dept] = { schedule: 0, program: 0 };
        deptHours[dept].schedule += parseFloat(r['الساعات حسب الجدول الدراسي'] || '0') || 0;
        deptHours[dept].program += parseFloat(r['الساعات حسب البرنامج الدراسي'] || '0') || 0;
      });
      return Object.entries(deptHours).map(([name, v]) => ({ name: name.length > 20 ? name.slice(0, 20) + '...' : name, 'ساعات الجدول': v.schedule, 'ساعات البرنامج': v.program }));
    })();

    const summary = {
      teachers: new Set((teacherSys?.rows || []).map(r => r['اسم التدريسي']).filter(Boolean)).size,
      students: studentSys?.rows.length || 0,
      rooms: new Set((teacherSys?.rows || []).map(r => r['القاعة أو المختبر']).filter(Boolean)).size,
      subjects: new Set((teacherSys?.rows || []).map(r => r['المادة']).filter(Boolean)).size,
      emptySlots: emptyRoomsSys?.rows.length || 0,
      assignments: assignmentsSys?.rows.length || 0,
    };

    return { byDay, byType, byDept, emptyDayData, auditData, hoursData, summary };
  }, [liveData, assignmentsRows]);

  const { byDay, byType, byDept, emptyDayData, auditData, hoursData, summary } = chartData;

  if (liveLoading && !liveData) return <LiveLoadingShell />;
  if (liveError && !liveData) return <LiveLoadingShell error={liveError} />;

  const ChartCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="schedule-card" style={{ padding: '20px', marginBottom: '16px' }}>
      <h3 className="text-lg font-black text-[var(--schedule-text)] mb-4 text-center">{title}</h3>
      {children}
    </div>
  );

  return (
    <div className="schedule-body" dir="rtl">
      <div className="relative z-[1] w-full mx-auto my-4 px-3 sm:px-5 pb-7">
        <div className="schedule-card p-4">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-black text-[var(--schedule-text)]">📈 الإحصائيات العامة</h1>
            <button onClick={() => navigate('/')} className="schedule-btn" style={{ minHeight: 38, padding: '8px 16px', borderRadius: 999 }}>🏠 الرئيسية</button>
          </div>

          <div className="schedule-stats-grid mb-6">
            <StatCard label="التدريسيون" value={summary.teachers} icon="👨‍🏫" color="#7c3aed" />
            <StatCard label="المحاضرات" value={summary.students} icon="📚" color="#2563eb" />
            <StatCard label="القاعات" value={summary.rooms} icon="🏛️" color="#d97706" />
            <StatCard label="المواد" value={summary.subjects} icon="📖" color="#059669" />
            <StatCard label="فترات شاغرة" value={summary.emptySlots} icon="🚪" color="#22c55e" />
            <StatCard label="التكليفات" value={summary.assignments} icon="📑" color="#be185d" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="📅 توزيع المحاضرات حسب الأيام">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={byDay}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fontFamily: 'Cairo' }} />
                  <YAxis />
                  <Tooltip contentStyle={{ fontFamily: 'Cairo', direction: 'rtl' }} />
                  <Bar dataKey="value" name="عدد المحاضرات" radius={[8, 8, 0, 0]}>
                    {byDay.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="📊 توزيع المحاضرات حسب النوع">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={byType} cx="50%" cy="50%" outerRadius={100} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                    {byType.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontFamily: 'Cairo', direction: 'rtl' }} />
                  <Legend wrapperStyle={{ fontFamily: 'Cairo' }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="🏢 المحاضرات حسب القسم (أعلى 8)">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={byDept} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={180} tick={{ fontSize: 10, fontFamily: 'Cairo' }} />
                  <Tooltip contentStyle={{ fontFamily: 'Cairo', direction: 'rtl' }} />
                  <Bar dataKey="value" name="عدد المحاضرات" radius={[0, 8, 8, 0]}>
                    {byDept.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="🏛️ القاعات الشاغرة حسب الأيام">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={emptyDayData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fontFamily: 'Cairo' }} />
                  <YAxis />
                  <Tooltip contentStyle={{ fontFamily: 'Cairo', direction: 'rtl' }} />
                  <Bar dataKey="value" name="فترات شاغرة" fill="#22c55e" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="📋 حالة تدقيق الجدول">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={auditData} cx="50%" cy="50%" outerRadius={100} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                    {auditData.map((entry, i) => {
                      const colorMap: Record<string, string> = { 'سليم': '#22c55e', 'نقص بيانات': '#f59e0b', 'تضارب': '#ef4444' };
                      return <Cell key={i} fill={colorMap[entry.name] || CHART_COLORS[i]} />;
                    })}
                  </Pie>
                  <Tooltip contentStyle={{ fontFamily: 'Cairo', direction: 'rtl' }} />
                  <Legend wrapperStyle={{ fontFamily: 'Cairo' }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="⏰ مقارنة الساعات الدراسية حسب القسم">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={hoursData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fontFamily: 'Cairo' }} angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip contentStyle={{ fontFamily: 'Cairo', direction: 'rtl' }} />
                  <Legend wrapperStyle={{ fontFamily: 'Cairo' }} />
                  <Bar dataKey="ساعات الجدول" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="ساعات البرنامج" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChartsPage;
