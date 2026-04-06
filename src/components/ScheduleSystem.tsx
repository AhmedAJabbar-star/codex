import { useState, useMemo, useRef, useEffect } from 'react';
import { SYSTEMS, type SystemConfig, type ScheduleRow } from '@/data/scheduleData';

const ScheduleSystem = () => {
  const [activeSystem, setActiveSystem] = useState('teacher');
  const [isDark, setIsDark] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [comboOpen, setComboOpen] = useState(false);
  const [comboQuery, setComboQuery] = useState('');
  const comboRef = useRef<HTMLDivElement>(null);

  const system = useMemo(() => SYSTEMS.find(s => s.id === activeSystem)!, [activeSystem]);

  // Close combo on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setComboOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Toggle dark mode
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  // Filter rows
  const filteredRows = useMemo(() => {
    return system.rows.filter(row => {
      return system.filters.every(f => {
        const val = filters[f.key];
        if (!val) return true;
        return row[f.key] === val;
      });
    });
  }, [system, filters]);

  // Get unique values for a filter, considering upstream filters
  const getFilterOptions = (filterKey: string): string[] => {
    const filterIndex = system.filters.findIndex(f => f.key === filterKey);
    const upstreamFilters = system.filters.slice(0, filterIndex);
    
    let rows = system.rows;
    upstreamFilters.forEach(f => {
      const val = filters[f.key];
      if (val) rows = rows.filter(r => r[f.key] === val);
    });

    const values = [...new Set(rows.map(r => r[filterKey]).filter(Boolean))];
    values.sort();
    return values;
  };

  const handleFilterChange = (key: string, value: string) => {
    const filterIndex = system.filters.findIndex(f => f.key === key);
    const newFilters = { ...filters };
    newFilters[key] = value;
    // Clear downstream filters
    system.filters.slice(filterIndex + 1).forEach(f => {
      delete newFilters[f.key];
    });
    setFilters(newFilters);
  };

  const clearFilters = () => {
    setFilters({});
    setComboQuery('');
  };

  const switchSystem = (id: string) => {
    setActiveSystem(id);
    setFilters({});
    setComboQuery('');
    setComboOpen(false);
  };

  const handlePrint = () => window.print();

  // Combo filter for teacher name
  const comboOptions = useMemo(() => {
    const options = getFilterOptions('اسم التدريسي');
    if (!comboQuery) return options;
    return options.filter(o => o.includes(comboQuery));
  }, [filters, comboQuery, system]);

  return (
    <div className={`schedule-body ${isDark ? 'dark' : ''}`} dir="rtl">
      <div className="relative z-[1] max-w-[1480px] mx-auto my-8 px-5 pb-7">
        <div className="schedule-card">
          {/* Header */}
          <header className="schedule-header">
            <div className="flex flex-col items-center gap-2.5 text-center relative">
              <p className="font-extrabold text-[15px] text-[var(--schedule-accent-blue)] tracking-wide opacity-95">
                {system.universityLine}
              </p>
              <h1 className="m-0 text-[clamp(1.7rem,2.8vw,2.5rem)] font-black leading-tight text-[var(--schedule-text)]" style={{ letterSpacing: '-.02em' }}>
                {system.appTitle}
              </h1>
              <div className="mt-1 flex flex-wrap gap-2.5 justify-center items-center">
                <span className="schedule-badge">الفصل الدراسي الحالي</span>
                <button
                  onClick={() => setIsDark(!isDark)}
                  className="schedule-btn"
                  style={{ minHeight: 38, padding: '8px 14px', borderRadius: 999 }}
                >
                  🌓 تبديل النمط
                </button>
              </div>
              <div className="schedule-hint">
                <strong>💡 ملاحظة:</strong> {system.hint}
              </div>
            </div>
          </header>

          {/* System Switcher - Slides */}
          <div className="system-switcher">
            {SYSTEMS.map(sys => (
              <button
                key={sys.id}
                className={`system-slide ${activeSystem === sys.id ? 'active' : ''}`}
                onClick={() => switchSystem(sys.id)}
              >
                <span className="system-slide-icon">{sys.icon}</span>
                <span>{sys.title}</span>
                <span className="system-slide-badge">{sys.rows.length}</span>
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="schedule-filters" style={{
            gridTemplateColumns: system.filters.length > 4
              ? `repeat(${Math.min(system.filters.length, 4)}, minmax(180px, 1fr))`
              : `repeat(${system.filters.length}, minmax(200px, 1fr))`
          }}>
            {system.filters.map(f => (
              <div key={f.key} className="flex flex-col gap-2 min-w-0">
                <span className="schedule-filter-label">{f.label}</span>
                {f.control === 'combo' ? (
                  <div ref={comboRef} className={`relative ${comboOpen ? 'z-30' : ''}`}>
                    <div
                      className={`relative flex items-center min-h-[52px] rounded-2xl border border-[var(--schedule-border)] px-4 cursor-pointer transition-all ${
                        comboOpen ? 'border-blue-400/45 shadow-[0_0_0_4px_rgba(37,99,235,.14)]' : ''
                      }`}
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
                            onClick={e => {
                              e.stopPropagation();
                              setComboQuery('');
                              const newF = { ...filters };
                              delete newF[f.key];
                              setFilters(newF);
                            }}
                          >✕</button>
                        )}
                        <span className={`text-xs transition-transform ${comboOpen ? 'rotate-180' : ''}`}>▼</span>
                      </div>
                    </div>
                    {comboOpen && (
                      <div
                        className="absolute inset-x-0 top-[calc(100%+10px)] z-25 rounded-[22px] border border-[var(--schedule-border)] overflow-hidden"
                        style={{
                          background: isDark
                            ? 'linear-gradient(180deg, rgba(11,19,33,.98), rgba(9,16,29,.96))'
                            : 'linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,251,255,.94))',
                          boxShadow: '0 26px 60px rgba(15,23,42,.18)',
                          backdropFilter: 'blur(14px)',
                        }}
                      >
                        <div className="flex items-center justify-between gap-2.5 px-4 py-3.5 border-b border-[var(--schedule-border)] text-xs font-black text-[var(--schedule-muted)]"
                          style={{ background: 'linear-gradient(180deg, rgba(37,99,235,.08), rgba(37,99,235,.03))' }}
                        >
                          <strong className="text-[var(--schedule-text)] text-[13px]">اختر التدريسي</strong>
                          <span>{comboOptions.length} نتيجة</span>
                        </div>
                        <div className="max-h-[300px] overflow-auto p-2.5 flex flex-col gap-2">
                          {comboOptions.length === 0 ? (
                            <div className="text-center py-4 text-[var(--schedule-muted)] text-sm font-extrabold border border-dashed border-[var(--schedule-border)] rounded-2xl">
                              لا توجد نتائج
                            </div>
                          ) : (
                            comboOptions.map(opt => (
                              <button
                                key={opt}
                                className={`w-full text-right rounded-2xl px-3.5 py-3 text-sm font-extrabold border transition-colors ${
                                  filters[f.key] === opt
                                    ? 'border-blue-400/20 text-[var(--schedule-accent-blue)]'
                                    : 'border-transparent'
                                }`}
                                style={{
                                  background: filters[f.key] === opt
                                    ? 'linear-gradient(180deg, rgba(37,99,235,.12), rgba(37,99,235,.08))'
                                    : isDark
                                      ? 'linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.02))'
                                      : 'linear-gradient(180deg, rgba(255,255,255,.92), rgba(246,249,255,.82))',
                                  minHeight: 46,
                                }}
                                onClick={() => {
                                  handleFilterChange(f.key, opt);
                                  setComboQuery('');
                                  setComboOpen(false);
                                }}
                              >
                                {opt}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <select
                    className="schedule-select"
                    value={filters[f.key] || ''}
                    onChange={e => handleFilterChange(f.key, e.target.value)}
                    style={{
                      cursor: 'pointer',
                      paddingInlineEnd: 44,
                    }}
                  >
                    <option value="">— الكل —</option>
                    {getFilterOptions(f.key).map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <div className="schedule-toolbar">
            <button className="schedule-btn schedule-btn-primary" onClick={handlePrint}>
              🖨️ طباعة الجدول
            </button>
            <button className="schedule-btn schedule-btn-secondary">
              📋 تقرير مختصر
            </button>
            <button className="schedule-btn" onClick={clearFilters}>
              🔄 مسح التصفية
            </button>
            <div className="schedule-counter">
              📊 عدد النتائج: <strong className="text-[var(--schedule-text)]">{filteredRows.length}</strong>
            </div>
          </div>

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
                    {system.headers.map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, i) => (
                    <tr key={i}>
                      {system.headers.map(h => (
                        <td key={h}>{row[h] || ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          <div className="schedule-footer">
            <div className="schedule-footer-card">
              <strong className="text-[var(--schedule-text)]">برمجة :</strong> المدرس الدكتور احمد عبدالامير جبار عيسى - كلية الهندسة المدنية
            </div>
            <div className="schedule-footer-card">
              <strong className="text-[var(--schedule-text)]">تصميم :</strong> الاستاذ الدكتور وائل شوقي عبد الصاحب - معاون العميد للشؤون الادارية
            </div>
            <div className="schedule-footer-card">
              <strong className="text-[var(--schedule-text)]">اشراف :</strong> الاستاذ الدكتورة خولة صلاح خشان - مساعد رئيس الجامعة للشؤون العلمية
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScheduleSystem;
