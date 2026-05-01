import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useLiveScheduleData } from '@/hooks/useLiveSchedule';
import { LiveLoadingShell } from '@/components/shared/LiveLoadingShell';
import { LECTURE_TYPE_PLACEHOLDER } from '@/data/liveScheduleData';
import RefreshButton from '@/components/shared/RefreshButton';
import { exportToExcel, exportToPDF } from '@/components/shared/ScheduleHelpers';
import type { ScheduleRow } from '@/data/scheduleData';

type ErrorRecord = {
  source: string;          // اسم نظام التدقيق
  sourceColor: string;
  department: string;
  day: string;
  reason: string;          // وصف الخطأ
  raw: ScheduleRow;
};

const SOURCE_META: Record<string, { label: string; color: string }> = {
  report: { label: 'تدقيق الجدول الدراسي', color: '#dc2626' },
  hours: { label: 'تدقيق الساعات الدراسية', color: '#d97706' },
  lectureType: { label: 'تدقيق نوع المحاضرة', color: '#7c3aed' },
  assignments: { label: 'تدقيق تكليفات القسم', color: '#0891b2' },
};

const DAY_ORDER = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'غير محدد'];

function isInvalid(value: string): boolean {
  const v = (value || '').trim();
  if (!v) return false;
  // قيم تعتبر "سليمة" — نتجاهلها
  return !['سليم', 'مطابق', 'صحيح', 'لا يوجد', '✓', 'ok', 'OK'].includes(v);
}

const ErrorsSummaryPage = () => {
  const navigate = useNavigate();
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [selectedDay, setSelectedDay] = useState<string>('all');

  const { data: liveData, error: liveError, isLoading: liveLoading } = useLiveScheduleData();

  const allErrors = useMemo<ErrorRecord[]>(() => {
    if (!liveData) return [];
    const errors: ErrorRecord[] = [];

    // 1) تدقيق الجدول الدراسي — صفوف فيها "نقص البيانات" غير سليم أو "التضارب" غير فارغ
    liveData.report.forEach((r) => {
      const deficiency = r['نقص البيانات'] || '';
      const conflict = r['التضارب'] || '';
      const reasons: string[] = [];
      if (isInvalid(deficiency)) reasons.push(`نقص بيانات: ${deficiency}`);
      if (conflict.trim()) reasons.push(`تضارب: ${conflict}`);
      if (reasons.length > 0) {
        errors.push({
          source: 'report',
          sourceColor: SOURCE_META.report.color,
          department: r['القسم'] || 'غير محدد',
          day: r['اليوم'] || 'غير محدد',
          reason: reasons.join(' | '),
          raw: r,
        });
      }
    });

    // 2) تدقيق الساعات — صفوف فيها "التدقيق حسب الاسبوع" غير سليم
    liveData.hours.forEach((r) => {
      const audit = r['التدقيق حسب الاسبوع'] || '';
      if (isInvalid(audit)) {
        errors.push({
          source: 'hours',
          sourceColor: SOURCE_META.hours.color,
          department: r['القسم'] || 'غير محدد',
          day: r['اليوم'] || 'غير محدد',
          reason: `الساعات: ${audit}`,
          raw: r,
        });
      }
    });

    // 3) تدقيق نوع المحاضرة — جميع الصفوف الموجودة هي أخطاء بطبيعتها
    liveData.lectureTypeAudit.forEach((r) => {
      errors.push({
        source: 'lectureType',
        sourceColor: SOURCE_META.lectureType.color,
        department: r['القسم'] || 'غير محدد',
        day: r['اليوم'] || 'غير محدد',
        reason: LECTURE_TYPE_PLACEHOLDER,
        raw: r,
      });
    });

    // 4) تدقيق تكليفات القسم — صفوف فيها "نتيجة التدقيق الاول" غير سليم
    liveData.assignmentsAudit.forEach((r) => {
      const audit = r['نتيجة التدقيق الاول'] || '';
      if (isInvalid(audit)) {
        errors.push({
          source: 'assignments',
          sourceColor: SOURCE_META.assignments.color,
          department: r['القسم'] || r['القسم الذي تنتمي اليه'] || 'غير محدد',
          day: r['اليوم'] || 'غير محدد',
          reason: `تكليفات: ${audit}`,
          raw: r,
        });
      }
    });

    return errors;
  }, [liveData]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    allErrors.forEach((e) => set.add(e.department));
    return Array.from(set).sort();
  }, [allErrors]);

  const days = useMemo(() => {
    const set = new Set<string>();
    allErrors.forEach((e) => set.add(e.day));
    return Array.from(set).sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  }, [allErrors]);

  const filtered = useMemo(() => {
    return allErrors.filter((e) => {
      if (selectedSource !== 'all' && e.source !== selectedSource) return false;
      if (selectedDept !== 'all' && e.department !== selectedDept) return false;
      if (selectedDay !== 'all' && e.day !== selectedDay) return false;
      return true;
    });
  }, [allErrors, selectedSource, selectedDept, selectedDay]);

  // ملخص حسب القسم × اليوم (مصفوفة عرضها)
  const matrix = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    filtered.forEach((e) => {
      if (!map.has(e.department)) map.set(e.department, new Map());
      const row = map.get(e.department)!;
      row.set(e.day, (row.get(e.day) || 0) + 1);
    });
    const usedDays = Array.from(new Set(filtered.map((e) => e.day))).sort(
      (a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b),
    );
    const usedDepts = Array.from(map.keys()).sort();
    return { map, usedDays, usedDepts };
  }, [filtered]);


  const actionableSummary = useMemo(() => {
    const byDept = new Map<string, { total: number; systems: Record<string, number>; topReasons: Map<string, number> }>();
    filtered.forEach((e) => {
      if (!byDept.has(e.department)) {
        byDept.set(e.department, { total: 0, systems: { report: 0, hours: 0, lectureType: 0, assignments: 0 }, topReasons: new Map() });
      }
      const entry = byDept.get(e.department)!;
      entry.total += 1;
      entry.systems[e.source] = (entry.systems[e.source] || 0) + 1;
      entry.topReasons.set(e.reason, (entry.topReasons.get(e.reason) || 0) + 1);
    });

    return Array.from(byDept.entries())
      .map(([department, data]) => ({
        department,
        total: data.total,
        systems: data.systems,
        topReason: Array.from(data.topReasons.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'غير محدد',
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [filtered]);

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = { report: 0, hours: 0, lectureType: 0, assignments: 0 };
    allErrors.forEach((e) => { counts[e.source] = (counts[e.source] || 0) + 1; });
    return counts;
  }, [allErrors]);

  if (liveLoading && !liveData) return <LiveLoadingShell />;
  if (liveError && !liveData) return <LiveLoadingShell error={liveError} />;

  return (
    <div className="schedule-body" dir="rtl">
      <div className="relative z-[1] w-full mx-auto my-4 px-3 sm:px-5 pb-7 max-w-[1600px]">
        <div className="schedule-card p-4">
          {/* Header */}
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <div>
              <h1 className="text-2xl font-black text-[var(--schedule-text)]">⚠️ ملخص الأخطاء</h1>
              <p className="text-sm font-semibold text-[var(--schedule-muted)] mt-1">
                تجميع الحالات غير السليمة من جميع أنظمة التدقيق — حسب القسم واليوم
              </p>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <RefreshButton compact />
              <button
                onClick={() => {
                  const headers = ['النظام', 'القسم', 'اليوم', 'سبب الخطأ'];
                  const rows = filtered.map((e) => ({
                    'النظام': SOURCE_META[e.source].label,
                    'القسم': e.department,
                    'اليوم': e.day,
                    'سبب الخطأ': e.reason,
                  }));
                  exportToExcel('ملخص الأخطاء', headers, rows);
                }}
                className="schedule-btn"
                style={{ minHeight: 38 }}
              >
                📊 Excel
              </button>
              <button
                onClick={() => {
                  const headers = ['النظام', 'القسم', 'اليوم', 'سبب الخطأ'];
                  const rows = filtered.map((e) => ({
                    'النظام': SOURCE_META[e.source].label,
                    'القسم': e.department,
                    'اليوم': e.day,
                    'سبب الخطأ': e.reason,
                  }));
                  exportToPDF('ملخص الأخطاء', headers, rows);
                }}
                className="schedule-btn"
                style={{ minHeight: 38 }}
              >
                📄 PDF
              </button>
              <button onClick={() => navigate('/audit')} className="schedule-btn" style={{ minHeight: 38 }}>
                📋 أنظمة التدقيق
              </button>
              <button onClick={() => navigate('/')} className="schedule-btn" style={{ minHeight: 38 }}>
                🏠 الرئيسية
              </button>
            </div>
          </div>

          {/* بطاقات إجمالية */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {Object.entries(SOURCE_META).map(([key, meta]) => (
              <button
                key={key}
                onClick={() => setSelectedSource(selectedSource === key ? 'all' : key)}
                className="rounded-2xl border p-4 text-right transition-all hover:scale-[1.02]"
                style={{
                  borderColor: selectedSource === key ? meta.color : 'var(--schedule-border)',
                  background: selectedSource === key ? `${meta.color}15` : 'var(--schedule-card-bg)',
                  borderWidth: selectedSource === key ? 2 : 1,
                }}
              >
                <div className="text-xs font-bold text-[var(--schedule-muted)] mb-1">{meta.label}</div>
                <div className="text-3xl font-black" style={{ color: meta.color }}>
                  {sourceCounts[key].toLocaleString('ar-SA')}
                </div>
                <div className="text-xs font-semibold text-[var(--schedule-muted)] mt-1">حالة غير سليمة</div>
              </button>
            ))}
          </div>

          {/* ملخص خدمي قابل للتنفيذ */}
          <div className="rounded-2xl border border-[var(--schedule-border)] p-4 mb-5 bg-[var(--schedule-accent-blue)]/5">
            <h2 className="text-lg font-black text-[var(--schedule-text)] mb-2">🧭 أين نبدأ المعالجة؟</h2>
            <p className="text-sm font-semibold text-[var(--schedule-muted)] mb-3">
              الملخص التالي يربط بين أنظمة التدقيق الأربعة ويعرض الأقسام الأكثر تأثراً مع السبب الأكثر تكراراً.
            </p>
            {actionableSummary.length === 0 ? (
              <p className="text-sm font-bold text-green-700">✅ لا توجد حالات تتطلب معالجة ضمن الفلاتر الحالية.</p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--schedule-border)]">
                      <th className="p-2 text-right font-black">#</th>
                      <th className="p-2 text-right font-black">القسم</th>
                      <th className="p-2 text-center font-black">إجمالي الأخطاء</th>
                      <th className="p-2 text-center font-black">تدقيق الجدول</th>
                      <th className="p-2 text-center font-black">تدقيق الساعات</th>
                      <th className="p-2 text-center font-black">تدقيق نوع المحاضرة</th>
                      <th className="p-2 text-center font-black">تدقيق التكليفات</th>
                      <th className="p-2 text-right font-black">أكثر سبب متكرر</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actionableSummary.map((row, idx) => (
                      <tr key={row.department} className="border-b border-[var(--schedule-border)]/50">
                        <td className="p-2 font-black">{idx + 1}</td>
                        <td className="p-2 font-bold">{row.department}</td>
                        <td className="p-2 text-center font-black">{row.total}</td>
                        <td className="p-2 text-center">{row.systems.report || 0}</td>
                        <td className="p-2 text-center">{row.systems.hours || 0}</td>
                        <td className="p-2 text-center">{row.systems.lectureType || 0}</td>
                        <td className="p-2 text-center">{row.systems.assignments || 0}</td>
                        <td className="p-2 text-xs">{row.topReason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* فلاتر */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <div>
              <label className="text-xs font-bold text-[var(--schedule-muted)] block mb-1">نظام التدقيق</label>
              <select
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
                className="schedule-select w-full"
              >
                <option value="all">جميع الأنظمة</option>
                {Object.entries(SOURCE_META).map(([k, m]) => (
                  <option key={k} value={k}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--schedule-muted)] block mb-1">القسم</label>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="schedule-select w-full"
              >
                <option value="all">جميع الأقسام</option>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--schedule-muted)] block mb-1">اليوم</label>
              <select
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
                className="schedule-select w-full"
              >
                <option value="all">جميع الأيام</option>
                {days.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          {/* رسم بياني: أعلى 10 أقسام أخطاءً */}
          {filtered.length > 0 && (
            <div className="mb-6 rounded-2xl border border-[var(--schedule-border)] p-4" style={{ background: 'var(--schedule-card-bg)' }}>
              <h3 className="text-lg font-black text-[var(--schedule-text)] mb-3">
                📈 أعلى الأقسام في عدد الحالات غير السليمة
              </h3>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={(() => {
                      const counts = new Map<string, number>();
                      filtered.forEach((e) => counts.set(e.department, (counts.get(e.department) || 0) + 1));
                      return Array.from(counts.entries())
                        .map(([department, count]) => ({ department, count }))
                        .sort((a, b) => b.count - a.count)
                        .slice(0, 10);
                    })()}
                    margin={{ top: 8, right: 16, left: 8, bottom: 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.25)" />
                    <XAxis
                      dataKey="department"
                      tick={{ fontSize: 11, fontWeight: 700, fill: 'var(--schedule-text)' }}
                      angle={-25}
                      textAnchor="end"
                      interval={0}
                      height={70}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fontWeight: 700, fill: 'var(--schedule-text)' }} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: '1px solid var(--schedule-border)', fontWeight: 800 }}
                      formatter={(v: number) => [v.toLocaleString('ar-SA'), 'عدد الأخطاء']}
                    />
                    <Bar dataKey="count" fill="#dc2626" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* مصفوفة قسم × يوم */}
          <div className="mb-6">
            <h3 className="text-lg font-black text-[var(--schedule-text)] mb-3">
              📊 الأخطاء حسب القسم واليوم ({filtered.length.toLocaleString('ar-SA')} حالة)
            </h3>
            {matrix.usedDepts.length === 0 ? (
              <div className="schedule-card text-center py-8" style={{ background: '#22c55e15' }}>
                <div className="text-4xl mb-2">✅</div>
                <p className="font-extrabold text-[var(--schedule-text)]">لا توجد أخطاء ضمن الفلاتر المحددة</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[var(--schedule-border)]">
                <table className="w-full text-sm">
                  <thead style={{ background: 'var(--schedule-card-bg)' }}>
                    <tr>
                      <th className="p-2 text-right font-black border-b border-[var(--schedule-border)] sticky right-0" style={{ background: 'var(--schedule-card-bg)' }}>
                        القسم
                      </th>
                      {matrix.usedDays.map((day) => (
                        <th key={day} className="p-2 text-center font-black border-b border-r border-[var(--schedule-border)] whitespace-nowrap">
                          {day}
                        </th>
                      ))}
                      <th className="p-2 text-center font-black border-b border-r border-[var(--schedule-border)] bg-[var(--schedule-accent-blue)]/10">
                        المجموع
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.usedDepts.map((dept) => {
                      const row = matrix.map.get(dept)!;
                      const total = Array.from(row.values()).reduce((s, v) => s + v, 0);
                      return (
                        <tr key={dept} className="hover:bg-[var(--schedule-accent-blue)]/5">
                          <td className="p-2 font-bold text-right border-b border-[var(--schedule-border)] sticky right-0" style={{ background: 'var(--schedule-card-bg)' }}>
                            {dept}
                          </td>
                          {matrix.usedDays.map((day) => {
                            const v = row.get(day) || 0;
                            const intensity = Math.min(1, v / 5);
                            return (
                              <td
                                key={day}
                                className="p-2 text-center font-black border-b border-r border-[var(--schedule-border)]"
                                style={{
                                  background: v > 0 ? `rgba(220, 38, 38, ${0.08 + intensity * 0.25})` : undefined,
                                  color: v > 0 ? '#991b1b' : 'var(--schedule-muted)',
                                }}
                              >
                                {v > 0 ? v.toLocaleString('ar-SA') : '—'}
                              </td>
                            );
                          })}
                          <td className="p-2 text-center font-black border-b border-r border-[var(--schedule-border)]" style={{ background: '#dc262615', color: '#991b1b' }}>
                            {total.toLocaleString('ar-SA')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default ErrorsSummaryPage;
