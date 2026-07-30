import { useState, useMemo, useRef, useEffect, useCallback, useDeferredValue } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { SystemConfig, ScheduleRow } from '@/data/scheduleData';
import { TIME_OPTIONS_ARABIC } from '@/data/timeOptions';
import {
  parseTimeToMinutes, openPrintWindow, openShortReportWindow,
  generateAfterHeaderReport, exportToExcel, exportToPDF,
  openAssignmentsPrintWindow,
  FOOTER_HTML, universityLogo
} from './ScheduleHelpers';
import { fetchDepartmentHead } from '@/lib/departmentHeads';
import SystemStatistics from './SystemStatistics';
import RefreshButton from './RefreshButton';
import { sheetWrite } from '@/data/customSystemsRegistry';
import { getCachedAdminPassword, setCachedAdminPassword } from '@/lib/teacherAuth';
import { supabase } from '@/integrations/supabase/client';


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
  const [pdfWarnOpen, setPdfWarnOpen] = useState(false);
  const [comboQuery, setComboQuery] = useState('');
  const [statFilter, setStatFilter] = useState<string | null>(null);
  const [activeQuickFilters, setActiveQuickFilters] = useState<Set<string>>(new Set());
  const comboRef = useRef<HTMLDivElement>(null);
  const [bookings, setBookings] = useState<Booking[]>(loadBookings);
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [bookingForm, setBookingForm] = useState({ room: '', day: '', date: '', fromTime: '', toTime: '', note: '' });
  // Inline CRUD state (used only when system.crudContext is set)
  const [crudSearch, setCrudSearch] = useState('');
  // البحث المؤجَّل: يبقي الكتابة سلسة مهما كثرت السجلات
  const deferredSearch = useDeferredValue(crudSearch);
  const [crudEditing, setCrudEditing] = useState<null | { mode: 'add' | 'edit'; values: Record<string, string>; snapshot?: Record<string, string> }>(null);
  const [crudBusy, setCrudBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const ocrFileRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const qc = useQueryClient();

  // Split a cell value into multiple URLs (separator ' | ' or newline).
  const splitUrls = (s: string): string[] =>
    (s || '')
      .split(/\s*\|\s*|\n+/)
      .map(x => x.trim())
      .filter(x => /^https?:\/\//i.test(x));

  // Convert a Google Drive file URL to its embeddable /preview form.
  const toPreviewSrc = (url: string): string => {
    const m = url.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
    const m2 = url.match(/[?&]id=([^&]+)/i);
    if (m2 && /drive\.google\.com/i.test(url)) return `https://drive.google.com/file/d/${m2[1]}/preview`;
    return url;
  };

  const isPreviewable = (url: string): boolean =>
    /drive\.google\.com/i.test(url) || /\.pdf($|\?)/i.test(url) || /\.(png|jpe?g|gif|webp|svg)($|\?)/i.test(url);


  const systems = useMemo(() => {
    if (systemsOverride && systemsOverride.length > 0) return systemsOverride;
    return [];
  }, [systemsOverride]);
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

  const missingRequiredFilters = useMemo(() => {
    if (!system.requiredFilters || system.requiredFilters.length === 0) return [] as string[];
    return system.requiredFilters.filter((key) => !filters[key]);
  }, [system, filters]);

  const filteredRows = useMemo(() => {
    // Block any data rendering until every required filter has a value
    if (missingRequiredFilters.length > 0) return [] as typeof system.rows;
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
        if (f.control === 'numberRange' || f.control === 'dateRange') {
          const [fromStr = '', toStr = ''] = String(val).split('|');
          if (!fromStr && !toStr) return true;
          const cellRaw = (row[f.key] || '').trim();
          if (!cellRaw) return false;
          if (f.control === 'numberRange') {
            const cell = parseFloat(cellRaw.replace(/[^\d.\-]/g, ''));
            if (isNaN(cell)) return false;
            if (fromStr !== '' && cell < parseFloat(fromStr)) return false;
            if (toStr !== '' && cell > parseFloat(toStr)) return false;
            return true;
          }
          const cell = Date.parse(cellRaw);
          if (isNaN(cell)) return false;
          if (fromStr && cell < Date.parse(fromStr)) return false;
          if (toStr && cell > Date.parse(toStr) + 86_400_000 - 1) return false;
          return true;
        }
        if (f.matchMode === 'contains') return (row[f.key] || '').includes(val);
        if (f.matchMode === 'token') return (row[f.key] || '').split('\n').map((t) => t.trim()).includes(val);
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

    // Apply quick-filter toggle buttons (each active key marks rows with row[key] === '1').
    if (activeQuickFilters.size > 0) {
      result = result.filter((r) => {
        for (const k of activeQuickFilters) {
          if ((r[k] || '') !== '1') return false;
        }
        return true;
      });
    }

    if (statFilter) {
      if (activeSystem === 'report') {
        if (statFilter === 'clean') result = result.filter(r => (!r['نقص البيانات'] || r['نقص البيانات'] === 'سليم') && (!r['التضارب'] || r['التضارب'] === ''));
        else if (statFilter === 'deficiency') result = result.filter(r => r['نقص البيانات'] && r['نقص البيانات'] !== 'سليم');
        else if (statFilter === 'conflict') result = result.filter(r => r['التضارب'] && r['التضارب'] !== '');
      } else if (activeSystem === 'hours') {
        result = result.filter(r => r['التدقيق حسب الاسبوع'] === statFilter);
      } else if (activeSystem === 'quotaAudit') {
        const auditKey = 'تدقيق استيفاء النصاب حسب نوع التعيين';
        if (statFilter === 'غير مستوفي') result = result.filter(r => (r[auditKey] || '').trim() !== 'مستوفي');
        else result = result.filter(r => (r[auditKey] || '').trim() === statFilter);
      } else if (['teacher', 'student', 'tracking', 'assignments'].includes(activeSystem)) {
        if (statFilter === 'نظري' || statFilter === 'عملي') {
          result = result.filter(r => r['نوع المحاضرة'] === statFilter);
        }
      }
    }

    // Global / Inline-CRUD search (applies to all visible headers).
    const q = deferredSearch.trim().toLowerCase();
    if (q && (system.crudContext || system.globalSearch)) {
      result = result.filter((r) =>
        system.headers.some((h) => (r[h] || '').toLowerCase().includes(q))
      );
    }

    return result;

  }, [system, filters, statFilter, activeSystem, activeQuickFilters, missingRequiredFilters, deferredSearch]);

  // ===== عرض تدريجي (Windowing): لا نرسم آلاف الصفوف دفعة واحدة =====
  const PAGE_CHUNK = 150;
  const [visibleCount, setVisibleCount] = useState(PAGE_CHUNK);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setVisibleCount(PAGE_CHUNK); }, [filteredRows]);

  const visibleRows = useMemo(
    () => (filteredRows.length > visibleCount ? filteredRows.slice(0, visibleCount) : filteredRows),
    [filteredRows, visibleCount]
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visibleCount >= filteredRows.length) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisibleCount((c) => Math.min(c + PAGE_CHUNK, filteredRows.length));
      }
    }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visibleCount, filteredRows.length]);



  const getFilterOptions = useCallback((filterKey: string): string[] => {
    const filterDef = system.filters.find(f => f.key === filterKey);
    if (filterDef?.fixedOptions) return filterDef.fixedOptions;
    const filterIndex = system.filters.findIndex(f => f.key === filterKey);
    const upstreamFilters = system.filters.slice(0, filterIndex).filter(f => f.control !== 'time' && f.control !== 'timeSelect' && f.control !== 'number' && f.control !== 'numberRange' && f.control !== 'dateRange');
    let rows = system.rows;
    upstreamFilters.forEach(f => {
      const val = filters[f.key];
      if (val) {
        if (f.matchMode === 'contains') rows = rows.filter(r => (r[f.key] || '').includes(val));
        else if (f.matchMode === 'token') rows = rows.filter(r => (r[f.key] || '').split('\n').map((t) => t.trim()).includes(val));
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
      if (f.control !== 'time' && f.control !== 'timeSelect' && f.control !== 'number' && f.control !== 'numberRange' && f.control !== 'dateRange') delete newFilters[f.key];
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

  const toggleQuickFilter = (key: string) => {
    setActiveQuickFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const clearFilters = () => { setFilters({}); setComboQuery(''); setStatFilter(null); setActiveQuickFilters(new Set()); };

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
    setActiveQuickFilters(new Set());
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

  const activeFilterInfo = useMemo(() => system.filters
    .filter(f => f.control !== 'time' && f.control !== 'timeSelect')
    .map(f => ({ key: f.key, label: f.label, value: (filters[f.key] || '').trim() }))
    .filter(f => f.value), [system.filters, filters]);

  const reportHeaders = useMemo(() => {
    const activeFilterKeys = new Set(activeFilterInfo.map(f => f.key));
    return system.headers.filter(h => !activeFilterKeys.has(h));
  }, [system.headers, activeFilterInfo]);

  const reportTitle = useMemo(() => {
    if (activeFilterInfo.length === 0) return system.appTitle;
    return `${system.appTitle} - ${activeFilterInfo.map(f => `${f.label}: ${f.value}`).join(' - ')}`;
  }, [system.appTitle, activeFilterInfo]);

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

  const handlePrint = async (direct = false, skipWarn = false) => {
    if (!checkRequiredFilters()) return;
    if (activeSystem === 'assignments') {
      const { teacherName, semester, department, college } = buildAssignmentsContext();
      const headOfDepartment = await fetchDepartmentHead(department, semester);
      openAssignmentsPrintWindow({
        teacherName, semester, department, college, headOfDepartment,
        headers: system.headers, rows: filteredRows,
        autoPrint: true,
      });
      return;
    }
    if (direct && !skipWarn && filteredRows.length > 8000) {
      setPdfWarnOpen(true);
      return;
    }
    const isSinglePage = activeSystem === 'teacher';
    const dept =
      filters['القسم الذي تنتمي اليه'] || filters['القسم'] ||
      filters['القسم للفصل الدراسي الثاني'] || filters['T'] || filters['P'] || '';
    const filtersInfo = activeFilterInfo.map(({ label, value }) => ({ label, value }));
    openPrintWindow(reportTitle, reportHeaders, filteredRows, FOOTER_HTML, isSinglePage, dept, filtersInfo, system.customSignatures, system.printPrefs, direct);
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
    exportToExcel(reportTitle, reportHeaders, filteredRows);
  };

  const handlePDF = async () => {
    if (!checkRequiredFilters()) return;
    if (activeSystem === 'assignments') {
      const { teacherName, semester, department, college } = buildAssignmentsContext();
      const headOfDepartment = await fetchDepartmentHead(department, semester);
      openAssignmentsPrintWindow({
        teacherName, semester, department, college, headOfDepartment,
        headers: system.headers, rows: filteredRows,
        autoPrint: false,
      });
      return;
    }
    exportToPDF(reportTitle, reportHeaders, filteredRows);
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

  // ============ Inline CRUD helpers ============
  const crudCtx = system.crudContext;
  const crudPerms = crudCtx?.perms;
  const showCrudActions = !!crudCtx && !!(crudPerms?.edit || crudPerms?.delete);

  const parseSnapshot = useCallback((row: ScheduleRow): Record<string, string> => {
    if (!crudCtx) return {};
    try { return JSON.parse(row[crudCtx.snapshotKey] || '{}'); } catch { return {}; }
  }, [crudCtx]);

  const ensureAdminPassword = useCallback((forDelete: boolean): string | null => {
    const cached = getCachedAdminPassword();
    if (cached) return cached;
    const msg = forDelete
      ? '🔐 أدخل كلمة مرور المدير لتأكيد الحذف (تُحفظ لباقي الجلسة):'
      : '🔐 أدخل كلمة مرور المدير لتفعيل العملية (تُحفظ لباقي الجلسة):';
    const pw = window.prompt(msg) || '';
    if (!pw) return null;
    setCachedAdminPassword(pw);
    return pw;
  }, []);

  const crudOpenAdd = useCallback(() => {
    if (!crudCtx) return;
    const init: Record<string, string> = {};
    crudCtx.cols.forEach((c) => { init[c.letter] = ''; });
    if (crudCtx.teacherCol && crudCtx.teacherName) init[crudCtx.teacherCol] = crudCtx.teacherName;
    setCrudEditing({ mode: 'add', values: init });
  }, [crudCtx]);

  const crudOpenEdit = useCallback((snapshot: Record<string, string>) => {
    setCrudEditing({ mode: 'edit', values: { ...snapshot }, snapshot });
  }, []);

  const crudSubmit = useCallback(async () => {
    if (!crudCtx || !crudEditing) return;
    const password = ensureAdminPassword(false);
    if (!password) return;
    setCrudBusy(true);
    try {
      const values: Record<string, string> = {};
      crudCtx.cols.forEach((c) => {
        if (c.type !== 'readonly') values[c.letter] = crudEditing.values[c.letter] || '';
      });
      if (crudEditing.mode === 'add') {
        await sheetWrite({ op: 'append', gid: crudCtx.def.sheet_gid, sheet_url: crudCtx.externalUrl, values, password });
        toast.success('تمت إضافة السجل بنجاح ✅');
      } else {
        await sheetWrite({
          op: 'update', gid: crudCtx.def.sheet_gid, sheet_url: crudCtx.externalUrl,
          values, match: crudEditing.snapshot, password,
        });
        toast.success('تم تحديث السجل بنجاح ✅');
      }
      setCrudEditing(null);
      crudCtx.refetchQueryKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    } catch (e) {
      const m = (e as Error).message || '';
      if (/كلمة المرور/.test(m)) setCachedAdminPassword(null);
      toast.error(m);
    } finally { setCrudBusy(false); }
  }, [crudCtx, crudEditing, ensureAdminPassword, qc]);

  const crudDelete = useCallback(async (snapshot: Record<string, string>) => {
    if (!crudCtx) return;
    if (!confirm('⚠️ حذف هذا السجل من ورقة Google Sheets نهائياً؟\nلا يمكن التراجع عن هذا الإجراء.')) return;
    const password = ensureAdminPassword(true);
    if (!password) return;
    setCrudBusy(true);
    try {
      await sheetWrite({ op: 'delete', gid: crudCtx.def.sheet_gid, sheet_url: crudCtx.externalUrl, match: snapshot, password });
      toast.success('تم حذف السجل ✅');
      crudCtx.refetchQueryKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    } catch (e) {
      const m = (e as Error).message || '';
      if (/كلمة المرور/.test(m)) setCachedAdminPassword(null);
      toast.error(m);
    } finally { setCrudBusy(false); }
  }, [crudCtx, ensureAdminPassword, qc]);

  // 📸 OCR — استخراج قيم الحقول من صورة عبر Lovable AI (Gemini)
  const runOcrExtraction = useCallback(async (file: File) => {
    if (!crudCtx || !crudEditing) return;
    const ocr = crudCtx.def as any;
    if (!ocr.ocr_enabled) return;
    // Read file as data URL
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => reject(new Error('تعذر قراءة الصورة'));
      r.readAsDataURL(file);
    });
    // Restrict OCR to selected fields (or all non-readonly cols).
    const restrict: string[] = Array.isArray(ocr.ocr_fields) ? ocr.ocr_fields : [];
    const fields = crudCtx.cols
      .filter((c) => c.type !== 'readonly')
      .filter((c) => restrict.length === 0 || restrict.includes(c.letter))
      .map((c) => ({ letter: c.letter, header: c.header, type: c.type }));
    if (fields.length === 0) { toast.error('لا توجد حقول قابلة للاستخراج'); return; }
    setOcrBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('ocr-extract', {
        body: { image_data_url: dataUrl, fields, prompt: ocr.ocr_prompt || '' },
      });
      if (error) throw new Error(error.message || 'فشل استدعاء الخدمة');
      if ((data as any)?.error) throw new Error((data as any).error);
      const values: Record<string, string> = (data as any)?.values || {};
      const filled = Object.entries(values).filter(([, v]) => v && String(v).trim()).length;
      if (filled === 0) { toast.warning('لم يتم استخراج أي قيمة — جرب صورة أوضح'); return; }
      // Merge into current form; do not overwrite fields the user already typed.
      setCrudEditing((prev) => {
        if (!prev) return prev;
        const next = { ...prev.values };
        Object.entries(values).forEach(([letter, v]) => {
          if (v && String(v).trim() && !(next[letter] || '').trim()) next[letter] = String(v);
        });
        return { ...prev, values: next };
      });
      toast.success(`✅ تم استخراج ${filled} حقلاً — راجعها ثم اضغط حفظ`);
    } catch (e) {
      toast.error((e as Error).message || 'فشل الاستخراج');
    } finally {
      setOcrBusy(false);
      if (ocrFileRef.current) ocrFileRef.current.value = '';
    }
  }, [crudCtx, crudEditing]);



  return (
    <div className={`schedule-body ${isDark ? 'dark' : ''}`} dir="rtl">
      <div className="relative z-[1] w-full mx-auto my-4 px-3 sm:px-5 pb-7">
        <div className="schedule-card">
          {/* Header */}
          <header className="schedule-header">
            <div className="flex flex-col items-center gap-2.5 text-center relative">
              {showBackButton && (
                <div className="absolute top-0 right-0 flex items-center gap-2">
                  <RefreshButton compact onlyKeys={activeSystem === 'quotaAudit' ? [['quota-audit-data']] : undefined} />
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
          {system.filters.length > 0 && (
          <div className="schedule-filters" style={{
            gridTemplateColumns: system.filters.length > 4
              ? `repeat(${Math.min(system.filters.length, 4)}, minmax(160px, 1fr))`
              : `repeat(${system.filters.length}, minmax(180px, 1fr))`
          }}>
            {system.filters.map(f => (
              <div key={f.key} className="flex flex-col gap-2 min-w-0">
                <span className="schedule-filter-label">{f.label}</span>
                {f.control === 'combo' ? (
                  <div ref={comboRef} className="relative" style={{ zIndex: comboOpen ? 200 : undefined }}>
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
                        placeholder={(f as any).searchPlaceholder || `ابحث في ${f.label}...`}
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
                      <div className="absolute inset-x-0 top-[calc(100%+10px)] rounded-[22px] border border-[var(--schedule-border)] overflow-hidden"
                        style={{
                          zIndex: 250,
                          background: isDark
                            ? 'linear-gradient(180deg, rgba(11,19,33,.98), rgba(9,16,29,.96))'
                            : 'linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,251,255,.94))',
                          boxShadow: '0 26px 60px rgba(15,23,42,.18)',
                          backdropFilter: 'blur(14px)',
                        }}>
                        <div className="flex items-center justify-between gap-2.5 px-4 py-3.5 border-b border-[var(--schedule-border)] text-xs font-black text-[var(--schedule-muted)]"
                          style={{ background: 'linear-gradient(180deg, rgba(37,99,235,.08), rgba(37,99,235,.03))' }}>
                          <strong className="text-[var(--schedule-text)] text-[13px]">{f.label}</strong>
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
                ) : f.control === 'numberRange' || f.control === 'dateRange' ? (
                  (() => {
                    const raw = filters[f.key] || '';
                    const [fromStr = '', toStr = ''] = raw.split('|');
                    const inputType = f.control === 'dateRange' ? 'date' : 'number';
                    const setRange = (nf: string, nt: string) => {
                      const combined = (nf || nt) ? `${nf}|${nt}` : '';
                      handleFilterChange(f.key, combined);
                    };
                    return (
                      <div className="flex items-center gap-1.5" dir="rtl">
                        <input type={inputType} className="schedule-select flex-1" placeholder="من" value={fromStr}
                          onChange={(e) => setRange(e.target.value, toStr)}
                          style={{ minHeight: 52, paddingInlineEnd: 10, paddingInlineStart: 10, cursor: 'text' }} />
                        <span className="text-xs font-black text-[var(--schedule-muted)] px-1">—</span>
                        <input type={inputType} className="schedule-select flex-1" placeholder="إلى" value={toStr}
                          onChange={(e) => setRange(fromStr, e.target.value)}
                          style={{ minHeight: 52, paddingInlineEnd: 10, paddingInlineStart: 10, cursor: 'text' }} />
                        {(fromStr || toStr) && (
                          <button className="schedule-btn" style={{ minHeight: 40, padding: '0 8px' }}
                            onClick={() => handleFilterChange(f.key, '')} title="مسح">✕</button>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <select className="schedule-select" value={filters[f.key] || ''} onChange={e => handleFilterChange(f.key, e.target.value)} style={{ cursor: 'pointer', paddingInlineEnd: 44 }}>
                    <option value="">— الكل —</option>
                    {getFilterOptions(f.key).map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>
          )}

          {/* Toolbar */}
          <div className="schedule-toolbar">
            <button className="schedule-btn schedule-btn-primary" onClick={() => handlePrint(false)}>🖨️ {activeSystem === 'assignments' ? 'طباعة التكليفات' : 'طباعة الجدول'}</button>
            {activeSystem !== 'assignments' && (
              <button
                className="schedule-btn schedule-btn-secondary"
                title="ينشئ التقرير الرسمي كاملاً بلا معاينة ويفتح مربع حوار الحفظ لاختيار مكان الملف على الحاسبة (اختر «حفظ بصيغة PDF»)"
                onClick={() => handlePrint(true)}
              >📄 حفظ PDF كامل (بلا معاينة)</button>
            )}
            {system.shortReport && (
              <button className="schedule-btn schedule-btn-secondary" onClick={handleShortReport}>📋 تقرير مختصر</button>
            )}
            <button className="schedule-btn schedule-btn-primary" style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.20), 0 16px 28px rgba(124,58,237,.28)' }} onClick={handleExcel}>📥 تصدير Excel</button>
            <button className="schedule-btn schedule-btn-primary" style={{ background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.20), 0 16px 28px rgba(220,38,38,.28)' }} onClick={handlePDF}>📄 تصدير PDF</button>
            {activeSystem === 'emptyRooms' && (
              <button className="schedule-btn schedule-btn-primary" style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.20), 0 16px 28px rgba(5,150,105,.28)' }} onClick={() => setShowBookingDialog(true)}>📅 حجز مؤقت</button>
            )}
            {crudCtx && crudPerms?.add && (
              <button
                className="schedule-btn schedule-btn-primary"
                style={{ background: 'linear-gradient(135deg, #0891b2 0%, #0e7490 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.20), 0 16px 28px rgba(8,145,178,.28)' }}
                onClick={crudOpenAdd}
                disabled={crudBusy}
              >➕ إضافة سجل</button>
            )}
            {(crudCtx || system.globalSearch) && (
              <div className="relative" style={{ flex: '1 1 220px', minWidth: 220 }}>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">🔍</span>
                <input
                  className="w-full pr-9 pl-3 py-2 rounded-lg border-2 border-slate-200 text-sm focus:outline-none focus:border-slate-400 bg-white"
                  placeholder="بحث سريع في السجلات..."
                  value={crudSearch}
                  onChange={(e) => setCrudSearch(e.target.value)}
                  style={{ minHeight: 42 }}
                />
              </div>
            )}
            <button className="schedule-btn" onClick={clearFilters}>🔄 مسح التصفية</button>
            <div className="schedule-counter">📊 عدد النتائج: <strong className="text-[var(--schedule-text)]">{filteredRows.length}</strong></div>
          </div>

          {/* Inline CRUD editor — replaces the old modal (never overlays the data). */}
          {crudCtx && crudEditing && (
            <div className="mx-3 mb-3 rounded-2xl border-2 shadow-sm bg-white overflow-hidden" style={{ borderColor: '#0891b240' }} dir="rtl">
              <header className="px-4 py-3 flex items-center justify-between gap-3" style={{ background: 'linear-gradient(135deg, #0891b2, #0e7490)', color: 'white' }}>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{crudEditing.mode === 'add' ? '➕' : '✏️'}</span>
                  <h3 className="text-sm font-black">{crudEditing.mode === 'add' ? 'إضافة سجل جديد' : 'تعديل السجل'}</h3>
                </div>
                <div className="flex items-center gap-2">
                  {crudEditing.mode === 'add' && (crudCtx.def as any).ocr_enabled && (
                    <>
                      <input
                        ref={ocrFileRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) runOcrExtraction(f);
                        }}
                      />
                      <button
                        className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-black flex items-center gap-1.5 disabled:opacity-60"
                        onClick={() => ocrFileRef.current?.click()}
                        disabled={ocrBusy || crudBusy}
                        title="ارفع أو التقط صورة (وثيقة/جدول/بطاقة) ليقوم الذكاء الاصطناعي بتعبئة الحقول تلقائياً"
                      >
                        {ocrBusy ? '⏳ جارٍ الاستخراج…' : '📷 استخراج من صورة'}
                      </button>
                    </>
                  )}
                  <button
                    className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 text-lg"
                    onClick={() => !crudBusy && setCrudEditing(null)}
                    aria-label="إغلاق"
                  >✕</button>
                </div>
              </header>
              <div className="p-4 bg-slate-50/50">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {crudCtx.cols.map((c) => {
                    const v = crudEditing.values[c.letter] || '';
                    const set = (val: string) => setCrudEditing({ ...crudEditing, values: { ...crudEditing.values, [c.letter]: val } });
                    const lockTeacher = !!(crudCtx.teacherCol && crudCtx.teacherName && crudCtx.teacherCol === c.letter);
                    const base = "w-full px-3 py-2 rounded-lg border-2 border-slate-200 text-sm bg-white focus:outline-none focus:border-slate-400";
                    if (c.type === 'readonly' || lockTeacher) {
                      return (
                        <div key={c.letter}>
                          <label className="block text-xs font-black mb-1.5 text-slate-700">{c.header} <span className="text-[10px] text-slate-400 font-normal">(قراءة فقط)</span></label>
                          <input className={`${base} bg-slate-100 text-slate-500`} value={v} disabled />
                        </div>
                      );
                    }
                    const dlId = `dl-${crudCtx.def.id}-${c.letter}`;
                    return (
                      <div key={c.letter}>
                        <label className="block text-xs font-black mb-1.5 text-slate-700">{c.header}</label>
                        {c.type === 'select' ? (
                          c.allowCustom ? (
                            <>
                              <input list={dlId} className={base} value={v} onChange={(e) => set(e.target.value)} placeholder="اختر أو اكتب..." />
                              <datalist id={dlId}>{c.options.map((o) => <option key={o} value={o} />)}</datalist>
                            </>
                          ) : (
                            <select className={base} value={v} onChange={(e) => set(e.target.value)}>
                              <option value="">— اختر —</option>
                              {c.options.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          )
                        ) : c.type === 'date' ? (
                          <input type="date" className={base} value={v} onChange={(e) => set(e.target.value)} />
                        ) : c.type === 'number' ? (
                          <input type="number" className={base} value={v} onChange={(e) => set(e.target.value)} />
                        ) : c.type === 'file' ? (
                          <div className="space-y-2">
                            {splitUrls(v).length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                {splitUrls(v).map((u, idx) => (
                                  <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-100 text-emerald-800 font-bold">
                                    {isPreviewable(u) && (
                                      <button type="button" title="معاينة" className="hover:text-emerald-600"
                                        onClick={() => setPreviewUrl(u)}>👁️</button>
                                    )}
                                    <a href={u} target="_blank" rel="noopener noreferrer" className="truncate max-w-[140px]">📎 ملف {idx + 1}</a>
                                    <button type="button" className="text-red-600 font-black hover:text-red-800"
                                      title="حذف"
                                      onClick={() => {
                                        const rest = splitUrls(v).filter((_, i) => i !== idx);
                                        set(rest.join(' | '));
                                      }}>✕</button>
                                  </span>
                                ))}
                              </div>
                            )}
                            <input
                              type="file"
                              multiple
                              className={`${base} text-xs file:mr-2 file:px-3 file:py-1 file:rounded file:border-0 file:bg-emerald-600 file:text-white file:font-bold`}
                              accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                              onChange={async (e) => {
                                const files = Array.from(e.target.files || []);
                                if (files.length === 0) return;
                                const over = files.find(f => f.size > 25 * 1024 * 1024);
                                if (over) {
                                  toast.error(`الملف "${over.name}" يتجاوز 25 ميغابايت`);
                                  e.target.value = '';
                                  return;
                                }
                                const readAsBase64 = (f: File) => new Promise<string>((res, rej) => {
                                  const r = new FileReader();
                                  r.onload = () => {
                                    const s = String(r.result || '');
                                    res(s.split(',')[1] || s);
                                  };
                                  r.onerror = () => rej(r.error);
                                  r.readAsDataURL(f);
                                });
                                const uploaded: string[] = [];
                                for (let i = 0; i < files.length; i++) {
                                  const file = files[i];
                                  try {
                                    toast.loading(`جاري رفع (${i + 1}/${files.length}): ${file.name}`, { id: 'drv' });
                                    const b64 = await readAsBase64(file);
                                    const { data, error } = await supabase.functions.invoke('drive-upload', {
                                      body: {
                                        file_base64: b64,
                                        file_name: file.name,
                                        mime_type: file.type || 'application/octet-stream',
                                        folder_id: c.driveFolder || '',
                                      },
                                    });
                                    if (error) throw error;
                                    if ((data as any)?.error) throw new Error((data as any).error);
                                    const url = (data as any)?.url;
                                    if (!url) throw new Error('لم يتم استلام رابط');
                                    uploaded.push(url);
                                  } catch (err: any) {
                                    toast.error(`فشل رفع ${file.name}: ${err?.message || err}`, { id: 'drv' });
                                  }
                                }
                                if (uploaded.length > 0) {
                                  const existing = splitUrls(v);
                                  set([...existing, ...uploaded].join(' | '));
                                  toast.success(`تم رفع ${uploaded.length} ملف ✅`, { id: 'drv' });
                                }
                                e.target.value = '';
                              }}
                            />
                            <p className="text-[10px] text-slate-500">
                              يمكنك رفع عدة ملفات دفعة واحدة (25MB لكل ملف). تُخزَّن الروابط في الخلية مفصولة بـ " | ".
                            </p>
                          </div>
                        ) : (
                          <textarea className={base} rows={2} value={v} onChange={(e) => set(e.target.value)} />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">🔐 يتطلب الحفظ كلمة مرور المدير</span>
                  <div className="flex gap-2">
                    <button className="px-4 py-2 rounded-lg border-2 border-slate-200 text-sm font-bold hover:bg-slate-50" onClick={() => setCrudEditing(null)} disabled={crudBusy}>إلغاء</button>
                    <button className="px-5 py-2 rounded-lg text-sm font-black text-white shadow-sm disabled:opacity-50" style={{ background: '#0891b2' }} onClick={crudSubmit} disabled={crudBusy}>
                      {crudBusy ? '⏳ جاري الحفظ...' : '💾 حفظ'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}


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

          {/* Quick-filter toggle buttons */}
          {system.quickFilters && system.quickFilters.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-1 pb-2" dir="rtl">
              {system.quickFilters.map((qf) => {
                const active = activeQuickFilters.has(qf.key);
                const count = system.rows.filter(r => (r[qf.key] || '') === '1').length;
                const color = qf.color || '#dc2626';
                return (
                  <button
                    key={qf.key}
                    onClick={() => toggleQuickFilter(qf.key)}
                    className="schedule-btn"
                    style={{
                      minHeight: 42,
                      padding: '6px 14px',
                      borderRadius: 999,
                      background: active ? color : 'transparent',
                      color: active ? '#fff' : color,
                      border: `2px solid ${color}`,
                      fontWeight: 900,
                      boxShadow: active ? `0 8px 18px ${color}44` : 'none',
                    }}
                    title={active ? 'إلغاء التصفية' : 'تفعيل التصفية'}
                  >
                    {qf.icon || '⚡'} {qf.label} <span style={{ opacity: .85 }}>({count})</span>
                  </button>
                );
              })}
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
                    {system.headers.map(h => <th key={h} className={(h || '').trim() === 'الملاحظات' ? 'schedule-col-notes' : undefined}>{h}</th>)}
                    {activeSystem === 'emptyRooms' && <th>ملاحظة الحجز</th>}
                    {showCrudActions && <th style={{ width: 100 }}>إجراءات</th>}
                  </tr>

                </thead>
                <tbody>
                  {visibleRows.map((row, i) => {
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
                    const rowBg = system.rowColorKey ? (row[system.rowColorKey] || '') : '';
                    return (
                      <tr
                        key={i}
                        className={hasWarning ? 'schedule-row-warning' : ''}
                        style={rowBg ? { background: rowBg } : undefined}
                      >
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
                          const tdClass = [cellClass, (h || '').trim() === 'الملاحظات' ? 'schedule-col-notes' : ''].filter(Boolean).join(' ');
                          const linkLabel = system.linkColumns?.[h];
                          const urls = linkLabel ? splitUrls(val) : [];
                          if (linkLabel && urls.length > 0) {
                            return (
                              <td key={h} className={tdClass}>
                                <div className="flex flex-wrap gap-1 justify-center">
                                  {urls.map((u, idx) => (
                                    <span key={idx} className="inline-flex items-center gap-1">
                                      {isPreviewable(u) && (
                                        <button
                                          type="button"
                                          onClick={() => setPreviewUrl(u)}
                                          title="معاينة سريعة"
                                          className="schedule-btn"
                                          style={{ minHeight: 26, padding: '2px 6px', fontSize: 11, background: '#f1f5f9', color: '#0f172a' }}
                                        >👁️</button>
                                      )}
                                      <a
                                        href={u}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="schedule-btn schedule-btn-primary"
                                        style={{ minHeight: 26, padding: '3px 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                                      >
                                        🔗 {urls.length > 1 ? `${linkLabel} ${idx + 1}` : linkLabel}
                                      </a>
                                    </span>
                                  ))}
                                </div>
                              </td>
                            );
                          }
                          return <td key={h} className={tdClass}>{val}</td>;
                        })}
                        {activeSystem === 'emptyRooms' && (() => {
                          const note = getBookingNote(row['القاعة'], row['اليوم'], row['الفترة الشاغرة من'], row['الفترة الشاغرة الى']);
                          return <td className={note ? 'schedule-cell-warn' : ''}>{note || '—'}</td>;
                        })()}
                        {showCrudActions && (
                          <td>
                            <div className="flex gap-1 justify-center">
                              {crudPerms?.edit && (
                                <button
                                  onClick={() => crudOpenEdit(parseSnapshot(row))}
                                  disabled={crudBusy}
                                  className="w-8 h-8 rounded-lg grid place-items-center text-blue-600 bg-blue-50 hover:bg-blue-100 disabled:opacity-40"
                                  title="تعديل"
                                  type="button"
                                >✏️</button>
                              )}
                              {crudPerms?.delete && (
                                <button
                                  onClick={() => crudDelete(parseSnapshot(row))}
                                  disabled={crudBusy}
                                  className="w-8 h-8 rounded-lg grid place-items-center text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-40"
                                  title="حذف"
                                  type="button"
                                >🗑️</button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>

                    );
                  })}
                </tbody>
                {system.aggregations && system.aggregations.length > 0 && (
                  <tfoot>
                    <tr style={{ background: '#f1f5f9', fontWeight: 900 }}>
                      {system.headers.map((h) => {
                        const agg = system.aggregations!.find((a) => a.header === h);
                        if (!agg) return <td key={h} />;
                        const vals = filteredRows.map((r) => (r[h] || '').trim()).filter(Boolean);
                        const nums = vals
                          .map((v) => parseFloat(v.replace(/[^\d.\-]/g, '')))
                          .filter((n) => !isNaN(n));
                        let out = '—';
                        switch (agg.op) {
                          case 'sum': out = nums.reduce((a, b) => a + b, 0).toLocaleString('ar'); break;
                          case 'avg': out = nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : '0'; break;
                          case 'count': out = String(vals.length); break;
                          case 'countUnique': out = String(new Set(vals).size); break;
                          case 'min': out = nums.length ? String(Math.min(...nums)) : '—'; break;
                          case 'max': out = nums.length ? String(Math.max(...nums)) : '—'; break;
                        }
                        const opLabel = { sum: 'Σ', avg: 'x̄', count: '#', countUnique: '#∪', min: '↓', max: '↑' }[agg.op];
                        return (
                          <td key={h} style={{ color: '#0f172a', borderTop: '2px solid #94a3b8' }}>
                            <span style={{ color: '#64748b', marginLeft: 4 }}>{agg.label || opLabel}:</span> {out}
                          </td>
                        );
                      })}
                      {showCrudActions && <td />}
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
            {visibleCount < filteredRows.length && (
              <div ref={sentinelRef} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '14px 8px' }}>
                <span style={{ fontWeight: 800, color: 'var(--schedule-muted, #64748b)' }}>
                  ⏳ معروض {visibleRows.length} من {filteredRows.length} سجل — تابع التمرير للمزيد
                </span>
                <button
                  type="button"
                  className="schedule-btn"
                  onClick={() => setVisibleCount(filteredRows.length)}
                >عرض كل السجلات</button>
              </div>
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

      {previewUrl && (
        <div
          className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 print:hidden"
          onClick={() => setPreviewUrl(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 p-2.5 border-b bg-slate-50">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 truncate">
                <span>👁️ معاينة الملف</span>
                <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate max-w-[420px]">{previewUrl}</a>
              </div>
              <div className="flex gap-1.5">
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700"
                >⬇️ تحميل / فتح</a>
                <button
                  onClick={() => setPreviewUrl(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-200 text-slate-800 text-xs font-black hover:bg-slate-300"
                >✕ إغلاق</button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100">
              {/\.(png|jpe?g|gif|webp|svg)($|\?)/i.test(previewUrl) ? (
                <img src={previewUrl} alt="preview" className="w-full h-full object-contain" />
              ) : (
                <iframe
                  src={toPreviewSrc(previewUrl)}
                  className="w-full h-full border-0"
                  title="file-preview"
                  allow="autoplay"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SingleSystemPage;
