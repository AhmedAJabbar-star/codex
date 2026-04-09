import { useMemo } from 'react';
import { StatCard, computeDurationHours, parseTimeToMinutes } from './ScheduleHelpers';
import type { ScheduleRow } from '@/data/scheduleData';

interface Props {
  rows: ScheduleRow[];
  allRows: ScheduleRow[];
  systemId: string;
  onFilterApply: (key: string, value: string) => void;
  activeStatFilter: string | null;
}

const SystemStatistics = ({ rows, allRows, systemId, onFilterApply, activeStatFilter }: Props) => {
  const stats = useMemo(() => {
    if (systemId === 'teacher' || systemId === 'student' || systemId === 'tracking' || systemId === 'assignments') {
      const departments = new Set(rows.map(r => r['القسم'] || r['القسم الذي تنتمي اليه']));
      const teachers = new Set(rows.map(r => r['اسم التدريسي']).filter(Boolean));
      const rooms = new Set(rows.map(r => r['القاعة أو المختبر']).filter(Boolean));
      const days = new Set(rows.map(r => r['اليوم']).filter(Boolean));
      const subjects = new Set(rows.map(r => r['المادة']).filter(Boolean));
      const practicalCount = rows.filter(r => r['نوع المحاضرة'] === 'عملي').length;
      const theoryCount = rows.filter(r => r['نوع المحاضرة'] === 'نظري').length;
      let practicalHours = 0;
      let theoryHours = 0;
      rows.forEach(r => {
        const dur = computeDurationHours(r);
        if (r['نوع المحاضرة'] === 'عملي') practicalHours += dur;
        else if (r['نوع المحاضرة'] === 'نظري') theoryHours += dur;
      });
      return { departments: departments.size, teachers: teachers.size, rooms: rooms.size, days: days.size, subjects: subjects.size, practicalCount, theoryCount, total: rows.length, practicalHours, theoryHours };
    }
    if (systemId === 'report') {
      const total = rows.length;
      const withDeficiency = rows.filter(r => r['نقص البيانات'] && r['نقص البيانات'] !== 'سليم').length;
      const withConflict = rows.filter(r => r['التضارب'] && r['التضارب'] !== '').length;
      return { total, withDeficiency, withConflict, clean: rows.filter(r => (!r['نقص البيانات'] || r['نقص البيانات'] === 'سليم') && (!r['التضارب'] || r['التضارب'] === '')).length };
    }
    if (systemId === 'hours') {
      const totalRows = rows.length;
      const tadqiqValues: Record<string, number> = {};
      let totalScheduleHours = 0;
      let totalProgramHours = 0;
      rows.forEach(r => {
        const tVal = r['التدقيق حسب الاسبوع'] || '';
        tadqiqValues[tVal] = (tadqiqValues[tVal] || 0) + 1;
        totalScheduleHours += parseFloat(r['الساعات حسب الجدول الدراسي'] || '0') || 0;
        totalProgramHours += parseFloat(r['الساعات حسب البرنامج الدراسي'] || '0') || 0;
      });
      return { totalRows, tadqiqValues, totalScheduleHours, totalProgramHours };
    }
    if (systemId === 'emptyRooms') {
      const allRooms = new Set(rows.map(r => r['القاعة']).filter(Boolean));
      const days = new Set(rows.map(r => r['اليوم']).filter(Boolean));
      return { total: rows.length, rooms: allRooms.size, days: days.size };
    }
    return { total: rows.length };
  }, [rows, systemId]);

  if (systemId === 'teacher' || systemId === 'student' || systemId === 'tracking' || systemId === 'assignments') {
    const s = stats as any;
    return (
      <div className="schedule-stats">
        <div className="schedule-stats-header">📊 إحصائيات التقرير</div>
        <div className="schedule-stats-grid">
          <StatCard label="إجمالي المحاضرات" value={s.total} icon="📄" color="#2563eb" />
          <StatCard label="التدريسيون" value={s.teachers} icon="👨‍🏫" color="#7c3aed" />
          <StatCard label="المواد" value={s.subjects} icon="📚" color="#059669" />
          <StatCard label="القاعات" value={s.rooms} icon="🏛️" color="#d97706" />
          <StatCard label="نظري" value={s.theoryCount} icon="📖" color="#2563eb" active={activeStatFilter === 'نظري'} onClick={() => onFilterApply('نوع المحاضرة', activeStatFilter === 'نظري' ? '' : 'نظري')} />
          <StatCard label="عملي" value={s.practicalCount} icon="🔬" color="#dc2626" active={activeStatFilter === 'عملي'} onClick={() => onFilterApply('نوع المحاضرة', activeStatFilter === 'عملي' ? '' : 'عملي')} />
          <StatCard label="مجموع الساعات النظرية" value={s.theoryHours} icon="⏱️" color="#0891b2" />
          <StatCard label="مجموع الساعات العملية" value={s.practicalHours} icon="🔧" color="#be185d" />
        </div>
      </div>
    );
  }

  if (systemId === 'report') {
    const s = stats as any;
    return (
      <div className="schedule-stats">
        <div className="schedule-stats-header">📊 إحصائيات التدقيق</div>
        <div className="schedule-stats-grid">
          <StatCard label="إجمالي السجلات" value={s.total} icon="📄" color="#2563eb" />
          <StatCard label="سليم" value={s.clean} icon="✅" color="#22c55e" active={activeStatFilter === 'clean'} onClick={() => onFilterApply('__stat', activeStatFilter === 'clean' ? '' : 'clean')} />
          <StatCard label="نقص بيانات" value={s.withDeficiency} icon="⚠️" color="#f59e0b" active={activeStatFilter === 'deficiency'} onClick={() => onFilterApply('__stat', activeStatFilter === 'deficiency' ? '' : 'deficiency')} />
          <StatCard label="تضارب" value={s.withConflict} icon="❌" color="#ef4444" active={activeStatFilter === 'conflict'} onClick={() => onFilterApply('__stat', activeStatFilter === 'conflict' ? '' : 'conflict')} />
        </div>
      </div>
    );
  }

  if (systemId === 'hours') {
    const s = stats as any;
    const statusColors: Record<string, string> = {
      '✅ سليم': '#22c55e',
      '⚠️ الساعات المدخلة أقل من البرنامج': '#f59e0b',
      '⚠️ الساعات المدخلة أكثر من البرنامج': '#f97316',
      '⚪ لا توجد ساعات في البرنامج الدراسي': '#94a3b8',
      '❌ إدراج ساعات عملي لمادة نظري': '#ef4444',
    };
    const statusIcons: Record<string, string> = {
      '✅ سليم': '✅',
      '⚠️ الساعات المدخلة أقل من البرنامج': '⚠️',
      '⚠️ الساعات المدخلة أكثر من البرنامج': '⚠️',
      '⚪ لا توجد ساعات في البرنامج الدراسي': '⚪',
      '❌ إدراج ساعات عملي لمادة نظري': '❌',
    };
    return (
      <div className="schedule-stats">
        <div className="schedule-stats-header">📊 إحصائيات الساعات الدراسية</div>
        <div className="schedule-stats-grid">
          <StatCard label="إجمالي المواد" value={s.totalRows} icon="📄" color="#2563eb" />
          <StatCard label="ساعات الجدول" value={s.totalScheduleHours} icon="📅" color="#7c3aed" />
          <StatCard label="ساعات البرنامج" value={s.totalProgramHours} icon="📋" color="#059669" />
          <StatCard label="الفرق" value={Math.abs(s.totalScheduleHours - s.totalProgramHours)} icon="📊" color="#d97706" />
        </div>
        <div className="schedule-stats-breakdown">
          {Object.entries(s.tadqiqValues).sort((a: any, b: any) => b[1] - a[1]).map(([key, count]: any) => (
            <button key={key} className={`schedule-stats-tag-interactive ${activeStatFilter === key ? 'active' : ''}`} style={{ '--tag-color': statusColors[key] || '#94a3b8' } as React.CSSProperties} onClick={() => onFilterApply('التدقيق حسب الاسبوع', activeStatFilter === key ? '' : key)}>
              <span>{statusIcons[key] || '📊'} {key || '(فارغ)'}</span>
              <strong>{count}</strong>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (systemId === 'emptyRooms') {
    const s = stats as any;
    return (
      <div className="schedule-stats">
        <div className="schedule-stats-header">📊 إحصائيات القاعات الشاغرة</div>
        <div className="schedule-stats-grid">
          <StatCard label="فترات شاغرة" value={s.total} icon="🏛️" color="#22c55e" />
          <StatCard label="قاعات" value={s.rooms} icon="🚪" color="#2563eb" />
          <StatCard label="الأيام" value={s.days} icon="📅" color="#d97706" />
        </div>
      </div>
    );
  }

  return null;
};

export default SystemStatistics;
