import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { SYSTEMS, TIME_OPTIONS_ARABIC, type SystemConfig, type ScheduleRow } from '@/data/scheduleData';
import {
  parseTimeToMinutes, openPrintWindow, openShortReportWindow,
  generateAfterHeaderReport, exportToExcel, exportToPDF,
  openAssignmentsPrintWindow,
  FOOTER_HTML, universityLogo
} from './ScheduleHelpers';
import { fetchDepartmentHead } from '@/lib/departmentHeads';
import SystemStatistics from './SystemStatistics';
import RefreshButton from './RefreshButton';

interface Props {
  systemIds: string[];
  showBackButton?: boolean;
  systemsOverride?: SystemConfig[];
}

interface Booking {
  id: string;
  room: string;
  day: string;
  date: string;
  fromTime: string;
  toTime: string;
  note?: string;
}

function loadBookings(): Booking[] {
  try { return JSON.parse(localStorage.getItem('room_bookings') || '[]'); } catch { return []; }
}
function saveBookings(bookings: Booking[]) {
  localStorage.setItem('room_bookings', JSON.stringify(bookings));
}

const SingleSystemPage = ({ systemIds, showBackButton = true, systemsOverride }: Props) => {
  const navigate = useNavigate();
  const [activeSystem, setActiveSystem] = useState(systemIds[0]);
  const [isDark, setIsDark] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [comboOpen, setComboOpen] = useState(false);
  const [comboQuery, setComboQuery] = useState('');
  const [statFilter, setStatFilter] = useState<string | null>(null);
  const comboRef = useRef<HTMLDivElement>(null);
  const [bookings, setBookings] = useState<Booking[]>(loadBookings);
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [bookingForm, setBookingForm] = useState({ room: '', day: '', date: '', fromTime: '', toTime: '', note: '' });

  const systems = useMemo(() => {
    if (systemsOverride && systemsOverride.length > 0) return systemsOverride;
    return SYSTEMS.filter(s => systemIds.includes(s.id));
  }, [systemIds, systemsOverride]);
  const system = useMemo(() => systems.find(s => s.id === activeSystem) || systems[0], [activeSystem, systems]);

  useEffect(() => {
    if (systems.length > 0 && !systems.some((sys) => sys.id === activeSystem)) {
      setActiveSystem(systems[0].id);
    }
  }, [systems, activeSystem]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) setComboOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const filteredRows = useMemo(() => {
    let result = system.rows.filter(row => {
      const standardPass = system.filters.every(f => {
        if (f.control === 'time' || f.control === 'timeSelect') return true;
        const val = filters[f.key];
        if (!val) return true;
        if (f.control === 'number') {
          const inputNum = parseFloat(val);
          const cellNum = parseFloat(row[f.key] || '0');
          return !isNaN(inputNum) && !isNaN(cellNum) && cellNum >= inputNum;
        }
        if (f.matchMode === 'contains') return (row[f.key] || '').includes(val);
        return row[f.key] === val;
      });
      if (!standardPass) return false;

      if (system.timeFilter) {
        const fromStr = filters['__timeFrom'];
        const toStr = filters['__timeTo'];
        const mode = system.timeFilter.mode || 'overlap';
        const lectureStart = parseTimeToMinutes(row[system.timeFilter.startKey] || '');
        const lectureEnd = parseTimeToMinutes(row[system.timeFilter.endKey] || '');

        if (fromStr && toStr) {
          const fS = parseTimeToMinutes(fromStr);
          const fE = parseTimeToMinutes(toStr);
          if (fS !== null && fE !== null && fS >= fE) return false;
        }

        if (mode === 'containment') {
          if (fromStr && toStr) {
            const filterStart = parseTimeToMinutes(fromStr);
            const filterEnd = parseTimeToMinutes(toStr);
            if (filterStart !== null && filterEnd !== null && lectureStart !== null && lectureEnd !== null) {
              if (!(lectureStart <= filterStart && lectureEnd >= filterEnd)) return false;
            }
          } else if (fromStr) {
            const filterStart = parseTimeToMinutes(fromStr);
            if (filterStart !== null && lectureStart !== null && lectureStart > filterStart) return false;
          } else if (toStr) {
            const filterEnd = parseTimeToMinutes(toStr);
            if (filterEnd !== null && lectureEnd !== null && lectureEnd < filterEnd) return false;
          }
        } else {
          if (fromStr && toStr) {
            const filterStart = parseTimeToMinutes(fromStr);
            const filterEnd = parseTimeToMinutes(toStr);
            if (filterStart !== null && filterEnd !== null && lectureStart !== null && lectureEnd !== null) {
              if (!(lectureStart < filterEnd && lectureEnd > filterStart)) return false;
            }
          } else if (fromStr) {
            const filterStart = parseTimeToMinutes(fromStr);
            if (filterStart !== null && lectureEnd !== null && lectureEnd <= filterStart) return false;
          } else if (toStr) {
            const filterEnd = parseTimeToMinutes(toStr);
            if (filterEnd !== null && lectureStart !== null && lectureStart >= filterEnd) return false;
          }
        }
      }
      return true;
    });

    if (statFilter) {
      if (activeSystem === 'report') {
        if (statFilter === 'clean') result = result.filter(r => (!r['نقص البيانات'] || r['نقص البيانات'] === 'سليم') && (!r['التضارب'] || r['التضارب'] === ''));
        else if (statFilter === 'deficiency') result = result.filter(r => r['نقص البيانات'] && r['نقص البيانات'] !== 'سليم');
        else if (statFilter === 'conflict') result = result.filter(r => r['التضارب'] && r['التضارب'] !== '');
      } else if (activeSystem === 'hours') {
        result = result.filter(r => r['التدقيق حسب الاسبوع'] === statFilter);
      } else if (['teacher', 'student', 'tracking', 'assignments'].includes(activeSystem)) {
        if (statFilter === 'نظري' || statFilter === 'عملي') {
          result = result.filter(r => r['نوع المحاضرة'] === statFilter);
        }
      }
    }

    return result;
  }, [system, filters, statFilter, activeSystem]);

  const getFilterOptions = useCallback((filterKey: string): string[] => {
    const filterDef = system.filters.find(f => f.key === filterKey);
    if (filterDef?.fixedOptions) return filterDef.fixedOptions;
    const filterIndex = system.filters.findIndex(f => f.key === filterKey);
    const upstreamFilters = system.filters.slice(0, filterIndex).filter(f => f.control !== 'time' && f.control !== 'timeSelect' && f.control !== 'number');
    let rows = system.rows;
    upstreamFilters.forEach(f => {
      const val = filters[f.key];
      if (val) {
        if (f.matchMode === 'contains') rows = rows.filter(r => (r[f.key] || '').includes(val));
        else rows = rows.filter(r => r[f.key] === val);
      }
    });
    const values = [...new Set(rows.map(r => r[filterKey]).filter(Boolean))];
    values.sort();
    return values;
  }, [system, filters]);

  const handleFilterChange = (key: string, value: string) => {
    const filterIndex = system.filters.findIndex(f => f.key === key);
    const newFilters = { ...filters };
    newFilters[key] = value;
    system.filters.slice(filterIndex + 1).forEach(f => {
      if (f.control !== 'time' && f.control !== 'timeSelect' && f.control !== 'number') delete newFilters[f.key];
    });
    setFilters(newFilters);
  };

  const handleTimeChange = (key: string, value: string) => {
    const newFilters = { ...filters };
    if (value) newFilters[key] = value;
    else delete newFilters[key];
    setFilters(newFilters);
  };

  const handleStatFilter = (key: string, value: string) => {
    if (!value) { setStatFilter(null); return; }
    setStatFilter(prev => prev === value ? null : value);
  };

  const clearFilters = () => { setFilters({}); setComboQuery(''); setStatFilter(null); };

  const addBooking = () => {
    if (!bookingForm.room || !bookingForm.day || !bookingForm.date || !bookingForm.fromTime || !bookingForm.toTime) return;
    const newBooking: Booking = { id: Date.now().toString(), ...bookingForm };
    const updated = [...bookings, newBooking];
    setBookings(updated);
    saveBookings(updated);
    setBookingForm({ room: '', day: '', date: '', fromTime: '', toTime: '', note: '' });
    setShowBookingDialog(false);
  };

  const removeBooking = (id: string) => {
    const updated = bookings.filter(b => b.id !== id);
    setBookings(updated);
    saveBookings(updated);
  };

  const getBookingNote = (room: string, day: string, fromTime: string, toTime: string): string | null => {
    const fromMin = parseTimeToMinutes(fromTime);
    const toMin = parseTimeToMinutes(toTime);
    if (fromMin === null || toMin === null) return null;
    const match = bookings.find(b => {
      if (b.room !== room || b.day !== day) return false;
      const bFrom = parseTimeToMinutes(b.fromTime);
      const bTo = parseTimeToMinutes(b.toTime);
      if (bFrom === null || bTo === null) return false;
      return bFrom < toMin && bTo > fromMin;
    });
    if (!match) return null;
    return `⚠️ محجوزة - ${match.date} من ${match.fromTime} إلى ${match.toTime}`;
  };

  const switchSystem = (id: string) => {
    setActiveSystem(id);
    setFilters({});
    setComboQuery('');
    setComboOpen(false);
    setStatFilter(null);
  };

  const checkRequiredFilters = useCallback((): boolean => {
    if (!system.requiredFilters || system.requiredFilters.length === 0) return true;
    const missing = system.requiredFilters.filter(key => !filters[key]);
    if (missing.length > 0) {
      const labels = missing.map(key => {
        const f = system.filters.find(fl => fl.key === key);
        return f?.label || key;
      });
      toast.error(`يرجى تحديد: ${labels.join(' و ')} قبل المتابعة`, {
        style: { direction: 'rtl', textAlign: 'right' },
      });
      return false;
    }
    return true;
  }, [system, filters]);

  const buildAssignmentsContext = () => {
    const semester = filters['الفصل الدراسي'] || filters['الكورس'] || '';
    const pickFromRows = (keys: string[]): string => {
      for (const row of filteredRows) {
        for (const key of keys) {
          const val = (row[key] || '').trim();
          if (val) return val;
        }
      }
      return '';
    };
    const semesterValue = (semester || '').trim();
    const teacherName =
      filters['اسم التدريسي'] ||
      (semesterValue === 'الاول'
        ? pickFromRows(['الاسم للفصل الاول', 'U', 'اسم التدريسي', 'التدريسي', 'اسم المدرس'])
        : semesterValue === 'الثاني'
          ? pickFromRows(['الاسم للفصل الدراسي الثاني', 'الاسم للفصل الثاني', 'V', 'اسم التدريسي', 'التدريسي', 'اسم المدرس'])
          : pickFromRows(['اسم التدريسي', 'التدريسي', 'اسم المدرس'])) ||
      '';
    const department =
      semesterValue === 'الثاني'
        ? (filters['القسم للفصل الدراسي الثاني'] || filters['T'] || pickFromRows(['القسم للفصل الدراسي الثاني', 'T', 'القسم الذي تنتمي اليه', 'القسم']) || '')
        : (filters['القسم الذي تنتمي اليه'] || filters['القسم'] || filters['P'] || pickFromRows(['القسم الذي تنتمي اليه', 'القسم', 'P']) || '');
    const college =
      filters['الكلية التي تنتمي اليها'] ||
      filters['الكلية'] ||
      pickFromRows(['الكلية التي تنتمي اليها', 'الكلية']) ||
      'كلية الهندسة المدنية';
    return { teacherName, semester, department, college };
  };

  const handlePrint = () => {
    if (!checkRequiredFilters()) return;
    if (activeSystem === 'assignments') {
      const { teacherName, semester, department, college } = buildAssignmentsContext();
      openAssignmentsPrintWindow({
        teacherName, semester, department, college,
        headers: system.headers, rows: filteredRows,
        autoPrint: true,
      });
      return;
    }
    const isSinglePage = activeSystem === 'teacher';
    openPrintWindow(system.appTitle, system.headers, filteredRows, FOOTER_HTML, isSinglePage);
  };

  const handleShortReport = () => {
    if (!checkRequiredFilters()) return;
    const sr = system.shortReport;
    if (!sr) return;
    if (sr.mode === 'excludeHeaders' && sr.headers) {
      // Build info lines from actively filtered columns only
      const infoLines: string[] = [];
      const activelyFilteredHeaders: string[] = [];
      sr.headers.forEach(headerKey => {
        const val = filters[headerKey];
        if (val) {
          activelyFilteredHeaders.push(headerKey);
          const filterDef = system.filters.find(f => f.key === headerKey);
          const label = filterDef?.label || headerKey;
          infoLines.push(`<div class="info-line"><strong>${label} :</strong> ${val}</div>`);
        }
      });

      let reportTitle = sr.title;
      if (activeSystem === 'teacher') {
        const teacherName = filters['اسم التدريسي'];
        if (teacherName) reportTitle = `جدول التدريسي : ${teacherName}`;
      }
      
      // Only hide columns that are actively filtered
      const displayHeaders = system.headers.filter(h => !activelyFilteredHeaders.includes(h));
      const infoHtml = infoLines.length > 0 ? infoLines.join('') : '';
      openShortReportWindow(reportTitle, displayHeaders, filteredRows, FOOTER_HTML, infoHtml, activeSystem === 'teacher');
    } else if (sr.mode === 'afterHeader' && sr.header) {
      generateAfterHeaderReport(filteredRows, system.headers, sr.header, sr.title, FOOTER_HTML);
    }
  };

  const handleExcel = () => {
    if (!checkRequiredFilters()) return;
    exportToExcel(system.appTitle, system.headers, filteredRows);
  };

  const handlePDF = () => {
    if (!checkRequiredFilters()) return;
    if (activeSystem === 'assignments') {
      const { teacherName, semester, department, college } = buildAssignmentsContext();
      openAssignmentsPrintWindow({
        teacherName, semester, department, college,
        headers: system.headers, rows: filteredRows,
        autoPrint: false,
      });
      return;
    }
    exportToPDF(system.appTitle, system.headers, filteredRows);
  };

  const comboFilterKey = useMemo(() => {
    const comboFilter = system.filters.find(f => f.control === 'combo');
    return comboFilter?.key || 'اسم التدريسي';
  }, [system]);

  const comboOptions = useMemo(() => {
    const options = getFilterOptions(comboFilterKey);
    if (!comboQuery) return options;
    return options.filter(o => o.includes(comboQuery));
  }, [filters, comboQuery, system, getFilterOptions, comboFilterKey]);

  return (
    <div className={`schedule-body ${isDark ? 'dark' : ''}`} dir="rtl">
      <div className="relative z-[1] w-full mx-auto my-4 px-3 sm:px-5 pb-7">
        <div className="schedule-card">
          {/* Header */}
          <header className="schedule-header">
            <div className="flex flex-col items-center gap-2.5 text-center relative">
              {showBackButton && (
                <div className="absolute top-0 right-0 flex items-center gap-2">
                  <RefreshButton compact />
                  <button
                    onClick={() => navigate('/')}
                    className="schedule-btn"
                    style={{ minHeight: 38, padding: '8px 16px', borderRadius: 999 }}
                  >
                    🏠 الرئيسية
                  </button>
                </div>
              )}
              <img
                src={universityLogo}
                alt="شعار الجامعة التكنولوجية"
                className="w-20 h-20 sm:w-24 sm:h-24 object-contain rounded-2xl shadow-lg"
                style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,.15))' }}
              />
              <p className="font-extrabold text-[15px] text-[var(--schedule-accent-blue)] tracking-wide opacity-95">
                {system.universityLine}
              </p>
              <h1 className="m-0 text-[clamp(1.7rem,2.8vw,2.5rem)] font-black leading-tight text-[var(--schedule-text)]" style={{ letterSpacing: '-.02em' }}>
                {system.appTitle}
              </h1>
              <div className="mt-1 flex flex-wrap gap-2.5 justify-center items-center">
                <span className="schedule-badge">جاهز</span>
                <button onClick={() => setIsDark(!isDark)} className="schedule-btn" style={{ minHeight: 38, padding: '8px 14px', borderRadius: 999 }}>
                  🌓 تبديل النمط
                </button>
              </div>
              <div className="schedule-hint">
                <strong>💡 ملاحظة:</strong> {system.hint}
              </div>
            </div>
          </header>

          {/* System Switcher (only if multiple systems) */}
          {systems.length > 1 && (
            <div className="system-switcher">
              {systems.map(sys => (
                <button key={sys.id} className={`system-slide ${activeSystem === sys.id ? 'active' : ''}`} onClick={() => switchSystem(sys.id)}>
                  <span className="system-slide-icon">{sys.icon}</span>
                  <span>{sys.title}</span>
                  <span className="system-slide-badge">{sys.rows.length}</span>
                </button>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="schedule-filters" style={{
            gridTemplateColumns: system.filters.length > 4
              ? `repeat(${Math.min(system.filters.length, 4)}, minmax(160px, 1fr))`
              : `repeat(${system.filters.length}, minmax(180px, 1fr))`
          }}>
            {system.filters.map(f => (
              <div key={f.key} className="flex flex-col gap-2 min-w-0">
                <span className="schedule-filter-label">{f.label}</span>
                {f.control === 'combo' ? (
                  <div ref={comboRef} className={`relative ${comboOpen ? 'z-30' : ''}`}>
                    <div
                      className={`relative flex items-center min-h-[52px] rounded-2xl border border-[var(--schedule-border)] px-4 cursor-pointer transition-all ${comboOpen ? 'border-blue-400/45 shadow-[0_0_0_4px_rgba(37,99,235,.14)]' : ''}`}
                      style={{
                        background: isDark
                          ? 'linear-gradient(180deg, rgba(13,22,38,.92), rgba(10,18,33,.84))'
                          : 'linear-gradient(180deg, rgba(255,255,255,.88), rgba(248,250,255,.76))',
                      }}
                      onClick={() => setComboOpen(!comboOpen)}
                    >
                      <input
                        type="text"
                        className="flex-1 min-w-0 border-none outline-none bg-transparent font-extrabold text-sm text-[var(--schedule-text)]"
                        style={{ minHeight: 'auto', boxShadow: 'none', padding: 0 }}
                        placeholder="ابحث عن التدريسي..."
                        value={filters[f.key] || comboQuery}
                        onChange={e => {
                          setComboQuery(e.target.value);
                          setComboOpen(true);
                          if (filters[f.key]) {
                            const newF = { ...filters };
                            delete newF[f.key];
                            setFilters(newF);
                          }
                        }}
                        onClick={e => { e.stopPropagation(); setComboOpen(true); }}
                      />
                      <div className="flex items-center gap-1.5 absolute left-2 top-1/2 -translate-y-1/2">
                        {(filters[f.key] || comboQuery) && (
                          <button
                            className="w-8 h-8 rounded-xl grid place-items-center text-sm font-black schedule-btn"
                            style={{ minHeight: 32, padding: 0 }}
                            onClick={e => { e.stopPropagation(); setComboQuery(''); const newF = { ...filters }; delete newF[f.key]; setFilters(newF); }}
                          >✕</button>
                        )}
                        <span className={`text-xs transition-transform ${comboOpen ? 'rotate-180' : ''}`}>▼</span>
                      </div>
                    </div>
                    {comboOpen && (
                      <div className="absolute inset-x-0 top-[calc(100%+10px)] z-25 rounded-[22px] border border-[var(--schedule-border)] overflow-hidden"
                        style={{
                          background: isDark
                            ? 'linear-gradient(180deg, rgba(11,19,33,.98), rgba(9,16,29,.96))'
                            : 'linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,251,255,.94))',
                          boxShadow: '0 26px 60px rgba(15,23,42,.18)',
                          backdropFilter: 'blur(14px)',
                        }}>
                        <div className="flex items-center justify-between gap-2.5 px-4 py-3.5 border-b border-[var(--schedule-border)] text-xs font-black text-[var(--schedule-muted)]"
                          style={{ background: 'linear-gradient(180deg, rgba(37,99,235,.08), rgba(37,99,235,.03))' }}>
                          <strong className="text-[var(--schedule-text)] text-[13px]">اختر التدريسي</strong>
                          <span>{comboOptions.length} نتيجة</span>
                        </div>
                        <div className="max-h-[300px] overflow-auto p-2.5 flex flex-col gap-2">
                          {comboOptions.length === 0 ? (
                            <div className="text-center py-4 text-[var(--schedule-muted)] text-sm font-extrabold border border-dashed border-[var(--schedule-border)] rounded-2xl">لا توجد نتائج</div>
                          ) : comboOptions.map(opt => (
                            <button key={opt}
                              className={`w-full text-right rounded-2xl px-3.5 py-3 text-sm font-extrabold border transition-colors ${filters[f.key] === opt ? 'border-blue-400/20 text-[var(--schedule-accent-blue)]' : 'border-transparent'}`}
                              style={{
                                background: filters[f.key] === opt
                                  ? 'linear-gradient(180deg, rgba(37,99,235,.12), rgba(37,99,235,.08))'
                                  : isDark ? 'linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.02))' : 'linear-gradient(180deg, rgba(255,255,255,.92), rgba(246,249,255,.82))',
                                minHeight: 46,
                              }}
                              onClick={() => { handleFilterChange(f.key, opt); setComboQuery(''); setComboOpen(false); }}
                            >{opt}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : f.control === 'number' ? (
                  <input type="number" className="schedule-select" placeholder={`أدخل ${f.label}`} value={filters[f.key] || ''} onChange={e => handleFilterChange(f.key, e.target.value)} style={{ cursor: 'text', paddingInlineEnd: 16, minHeight: 52 }} min="0" />
                ) : f.control === 'timeSelect' ? (
                  <select className="schedule-select" value={filters[f.key] || ''} onChange={e => handleTimeChange(f.key, e.target.value)} style={{ cursor: 'pointer', paddingInlineEnd: 44, minHeight: 52 }}>
                    <option value="">— الكل —</option>
                    {TIME_OPTIONS_ARABIC.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                ) : f.control === 'time' ? (
                  <input type="time" className="schedule-select" value={filters[f.key] || ''} min={f.key === '__timeTo' && filters['__timeFrom'] ? filters['__timeFrom'] : '07:00'} max="22:00"
                    onChange={e => {
                      const val = e.target.value;
                      if (val && (val < '07:00' || val > '22:00')) return;
                      if (f.key === '__timeTo' && filters['__timeFrom'] && val && val <= filters['__timeFrom']) return;
                      handleTimeChange(f.key, val);
                      if (f.key === '__timeFrom' && filters['__timeTo'] && filters['__timeTo'] <= val) handleTimeChange('__timeTo', '');
                    }}
                    style={{ cursor: 'pointer', paddingInlineEnd: 16, minHeight: 52 }}
                  />
                ) : (
                  <select className="schedule-select" value={filters[f.key] || ''} onChange={e => handleFilterChange(f.key, e.target.value)} style={{ cursor: 'pointer', paddingInlineEnd: 44 }}>
                    <option value="">— الكل —</option>
                    {getFilterOptions(f.key).map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <div className="schedule-toolbar">
            <button className="schedule-btn schedule-btn-primary" onClick={handlePrint}>🖨️ {activeSystem === 'assignments' ? 'طباعة التكليفات' : 'طباعة الجدول'}</button>
            {system.shortReport && (
              <button className="schedule-btn schedule-btn-secondary" onClick={handleShortReport}>📋 تقرير مختصر</button>
            )}
            <button className="schedule-btn schedule-btn-primary" style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.20), 0 16px 28px rgba(124,58,237,.28)' }} onClick={handleExcel}>📥 تصدير Excel</button>
            <button className="schedule-btn schedule-btn-primary" style={{ background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.20), 0 16px 28px rgba(220,38,38,.28)' }} onClick={handlePDF}>📄 تصدير PDF</button>
            {activeSystem === 'emptyRooms' && (
              <button className="schedule-btn schedule-btn-primary" style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.20), 0 16px 28px rgba(5,150,105,.28)' }} onClick={() => setShowBookingDialog(true)}>📅 حجز مؤقت</button>
            )}
            <button className="schedule-btn" onClick={clearFilters}>🔄 مسح التصفية</button>
            <div className="schedule-counter">📊 عدد النتائج: <strong className="text-[var(--schedule-text)]">{filteredRows.length}</strong></div>
          </div>

          {/* Bookings */}
          {activeSystem === 'emptyRooms' && bookings.length > 0 && (
            <div className="schedule-stats" style={{ marginBottom: 12 }}>
              <div className="schedule-stats-header">📅 الحجوزات المؤقتة ({bookings.length})</div>
              <div className="flex flex-wrap gap-2 p-3">
                {bookings.map(b => (
                  <div key={b.id} className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold" style={{ background: 'linear-gradient(135deg, rgba(5,150,105,.1), rgba(5,150,105,.05))', border: '1px solid rgba(5,150,105,.2)' }}>
                    <span>🏛️ {b.room} | {b.day} | {b.date} | {b.fromTime} - {b.toTime}</span>
                    <button onClick={() => removeBooking(b.id)} className="text-red-500 hover:text-red-700 font-black">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Statistics */}
          <SystemStatistics rows={filteredRows} allRows={system.rows} systemId={activeSystem} onFilterApply={handleStatFilter} activeStatFilter={statFilter} />

          {/* Table */}
          <div className="schedule-table-wrap">
            {filteredRows.length === 0 ? (
              <div className="schedule-empty">
                <span className="text-[34px] mb-2.5 opacity-70">📄</span>
                لا توجد بيانات مطابقة.
              </div>
            ) : (
              <table className="schedule-table">
                <thead>
                  <tr>
                    {system.headers.map(h => <th key={h}>{h}</th>)}
                    {activeSystem === 'emptyRooms' && <th>ملاحظة الحجز</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, i) => {
                    const lectureTypeMissing =
                      activeSystem === 'lectureTypeAudit' &&
                      (row['نوع المحاضرة'] || '').includes('لن يظهر');
                    const assignmentsAuditIssue =
                      activeSystem === 'assignmentsAudit' &&
                      (row['نتيجة التدقيق الاول'] || '').trim() !== '' &&
                      (row['نتيجة التدقيق الاول'] || '').trim() !== 'سليم';
                    const hasWarning = (activeSystem === 'report' && (
                      (row['نقص البيانات'] && row['نقص البيانات'] !== 'سليم') ||
                      (row['التضارب'] && row['التضارب'] !== '')
                    )) || lectureTypeMissing || assignmentsAuditIssue;
                    return (
                      <tr key={i} className={hasWarning ? 'schedule-row-warning' : ''}>
                        {system.headers.map(h => {
                          let cellClass = '';
                          const val = row[h] || '';
                          if (h === 'نقص البيانات' && val && val !== 'سليم') cellClass = 'schedule-cell-warn';
                          if (h === 'التضارب' && val) cellClass = 'schedule-cell-danger';
                          if (h === 'نوع المحاضرة' && activeSystem === 'lectureTypeAudit' && val.includes('لن يظهر')) cellClass = 'schedule-cell-danger';
                          if (h === 'نتيجة التدقيق الاول' && val && val.trim() !== 'سليم') cellClass = 'schedule-cell-warn';
                          if (h === 'التدقيق حسب الاسبوع') {
                            if (val.includes('✅')) cellClass = 'schedule-cell-ok';
                            else if (val.includes('⚠️')) cellClass = 'schedule-cell-warn';
                            else if (val.includes('❌')) cellClass = 'schedule-cell-danger';
                          }
                          return <td key={h} className={cellClass}>{val}</td>;
                        })}
                        {activeSystem === 'emptyRooms' && (() => {
                          const note = getBookingNote(row['القاعة'], row['اليوم'], row['الفترة الشاغرة من'], row['الفترة الشاغرة الى']);
                          return <td className={note ? 'schedule-cell-warn' : ''}>{note || '—'}</td>;
                        })()}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          <div className="schedule-footer">
            <div className="schedule-footer-card"><strong className="text-[var(--schedule-text)]">برمجة :</strong> المدرس الدكتور احمد عبدالامير جبار عيسى - كلية الهندسة المدنية</div>
            <div className="schedule-footer-card"><strong className="text-[var(--schedule-text)]">تصميم :</strong> الاستاذ الدكتور وائل شوقي عبد الصاحب - معاون العميد للشؤون الادارية</div>
            <div className="schedule-footer-card"><strong className="text-[var(--schedule-text)]">إشراف :</strong> الأستاذ الدكتور علي مجيد خضير الدهوي - عميد كلية الهندسة المدنية</div>
          </div>
        </div>
      </div>

      {/* Booking Dialog */}
      {showBookingDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="schedule-card" style={{ maxWidth: 480, width: '90%', padding: '24px' }} dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-[var(--schedule-text)]">📅 حجز مؤقت للقاعة</h3>
              <button onClick={() => setShowBookingDialog(false)} className="text-lg font-black text-[var(--schedule-muted)] hover:text-[var(--schedule-text)]">✕</button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="schedule-filter-label mb-1">القاعة</label>
                <select className="schedule-select" value={bookingForm.room} onChange={e => setBookingForm({ ...bookingForm, room: e.target.value })}>
                  <option value="">اختر القاعة</option>
                  {['101','103','105','106','107','109','110','111','112','113','114','115','201','202','203','204','205','207','208','209','210','211','212','223','224','225','226','227','230','367','368','369','370','371','372','373','374','375'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="schedule-filter-label mb-1">اليوم</label>
                <select className="schedule-select" value={bookingForm.day} onChange={e => setBookingForm({ ...bookingForm, day: e.target.value })}>
                  <option value="">اختر اليوم</option>
                  {['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="schedule-filter-label mb-1">التاريخ</label>
                <input type="date" className="schedule-select" value={bookingForm.date} onChange={e => setBookingForm({ ...bookingForm, date: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="schedule-filter-label mb-1">من الساعة</label>
                  <select className="schedule-select" value={bookingForm.fromTime} onChange={e => setBookingForm({ ...bookingForm, fromTime: e.target.value })}>
                    <option value="">اختر</option>
                    {TIME_OPTIONS_ARABIC.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="schedule-filter-label mb-1">إلى الساعة</label>
                  <select className="schedule-select" value={bookingForm.toTime} onChange={e => setBookingForm({ ...bookingForm, toTime: e.target.value })}>
                    <option value="">اختر</option>
                    {TIME_OPTIONS_ARABIC.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="schedule-filter-label mb-1">ملاحظة (اختياري)</label>
                <input type="text" className="schedule-select" placeholder="سبب الحجز..." value={bookingForm.note} onChange={e => setBookingForm({ ...bookingForm, note: e.target.value })} />
              </div>
              <div className="flex gap-3 mt-2">
                <button className="schedule-btn schedule-btn-primary flex-1" onClick={addBooking} disabled={!bookingForm.room || !bookingForm.day || !bookingForm.date || !bookingForm.fromTime || !bookingForm.toTime}>✅ تأكيد الحجز</button>
                <button className="schedule-btn flex-1" onClick={() => setShowBookingDialog(false)}>إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SingleSystemPage;
