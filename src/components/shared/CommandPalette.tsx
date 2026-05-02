import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { getRules, SYSTEM_ACCESS_RULES_UPDATED_EVENT, syncRulesFromRemote } from '@/lib/systemAccess';

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  action: () => void;
  keywords?: string;
}

/**
 * لوحة أوامر سريعة (Ctrl+K) للقفز بين الأنظمة وتنفيذ إجراءات شائعة.
 */
const CommandPalette = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [rules, setRules] = useState(() => getRules());

  const commands: Cmd[] = useMemo(() => {
    const allCommands: Cmd[] = [
      { id: 'home', label: 'الرئيسية', icon: '🏠', action: () => navigate('/'), keywords: 'home dashboard رئيسية' },
      { id: 'teacher', label: 'جدول الأستاذ', icon: '👨‍🏫', action: () => navigate('/teacher'), keywords: 'teacher استاذ' },
      { id: 'student', label: 'جدول الطالب', icon: '🎓', action: () => navigate('/student'), keywords: 'student طالب' },
      { id: 'audit', label: 'أنظمة التدقيق', icon: '📋', action: () => navigate('/audit'), keywords: 'audit تدقيق' },
      { id: 'tracking', label: 'متابعة سير التدريسات', icon: '📍', action: () => navigate('/tracking'), keywords: 'tracking متابعة' },
      { id: 'emptyRooms', label: 'القاعات الشاغرة', icon: '🏛️', action: () => navigate('/empty-rooms'), keywords: 'rooms قاعات empty' },
      { id: 'assignments', label: 'تكليفات التدريسي', icon: '📑', action: () => navigate('/assignments'), keywords: 'assignments تكليفات' },
      { id: 'errors', label: 'ملخص الأخطاء', icon: '⚠️', action: () => navigate('/errors'), keywords: 'errors اخطاء summary' },
      { id: 'charts', label: 'الإحصائيات', icon: '📈', action: () => navigate('/charts'), keywords: 'charts احصائيات' },
      {
        id: 'refresh',
        label: 'تحديث جميع البيانات الآن',
        hint: 'Ctrl+R',
        icon: '🔄',
        action: () => {
          queryClient.invalidateQueries({ queryKey: ['live-schedule-data'], refetchType: 'active' });
          queryClient.invalidateQueries({ queryKey: ['individual-assignments'], refetchType: 'active' });
        },
        keywords: 'refresh تحديث',
      },
    ];

    return allCommands.filter((command) => {
      const rule = rules[command.id];
      return !rule || rule.visible !== false;
    });
  }, [navigate, queryClient, rules]);

  useEffect(() => {
    void syncRulesFromRemote().then(setRules).catch(() => setRules(getRules()));

    const refreshRules = () => setRules(getRules());
    window.addEventListener('storage', refreshRules);
    window.addEventListener(SYSTEM_ACCESS_RULES_UPDATED_EVENT, refreshRules);
    return () => {
      window.removeEventListener('storage', refreshRules);
      window.removeEventListener(SYSTEM_ACCESS_RULES_UPDATED_EVENT, refreshRules);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        (c.keywords || '').toLowerCase().includes(q),
    );
  }, [query, commands]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isModK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
      if (isModK) {
        e.preventDefault();
        setOpen((o) => !o);
        setQuery('');
        setActiveIndex(0);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
        // Ctrl+R = تحديث (وليس إعادة تحميل الصفحة)
        if (!e.shiftKey) {
          e.preventDefault();
          const qc = queryClient;
          qc.invalidateQueries({ queryKey: ['live-schedule-data'], refetchType: 'active' });
          qc.invalidateQueries({ queryKey: ['individual-assignments'], refetchType: 'active' });
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        navigate('/');
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, navigate, queryClient]);

  useEffect(() => setActiveIndex(0), [query]);

  if (!open) return null;

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[activeIndex];
      if (cmd) {
        cmd.action();
        setOpen(false);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 print:hidden"
      style={{ background: 'rgba(2,6,23,.55)', backdropFilter: 'blur(4px)' }}
      onClick={() => setOpen(false)}
      dir="rtl"
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-[var(--schedule-border)] shadow-2xl overflow-hidden"
        style={{ background: 'var(--schedule-panel-solid)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 border-b border-[var(--schedule-border)] flex items-center gap-2">
          <span className="text-2xl">🔍</span>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="ابحث عن تقرير، نظام، أو إجراء..."
            className="w-full bg-transparent outline-none text-[var(--schedule-text)] font-bold text-base"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--schedule-border)] text-[var(--schedule-muted)]">
            ESC
          </kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="text-center text-sm font-bold text-[var(--schedule-muted)] py-8">
              لا توجد نتائج
            </div>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                onClick={() => {
                  cmd.action();
                  setOpen(false);
                }}
                onMouseEnter={() => setActiveIndex(i)}
                className="w-full flex items-center gap-3 p-3 rounded-xl text-right transition-colors"
                style={{
                  background: i === activeIndex ? 'var(--schedule-accent-soft)' : 'transparent',
                }}
              >
                <span className="text-2xl">{cmd.icon}</span>
                <span className="flex-1 font-black text-[var(--schedule-text)]">{cmd.label}</span>
                {cmd.hint && (
                  <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--schedule-border)] text-[var(--schedule-muted)]">
                    {cmd.hint}
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>
        <div className="px-3 py-2 text-[11px] font-bold text-[var(--schedule-muted)] border-t border-[var(--schedule-border)] flex justify-between">
          <span>↑↓ للتنقل • Enter للاختيار</span>
          <span>{filtered.length} نتيجة</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
