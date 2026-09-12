/**
 * مصدر بيانات كل نظام داخل ملف Google Sheets المنشور.
 * يُستخدم في لوحة التحكم لعرض رابط ورقة البيانات لكل نظام.
 */

/** معرّف ملف Google Sheets الأصلي (نفس الملف المستخدم في كل الأنظمة). */
export const SOURCE_SPREADSHEET_ID = '1vAuWBa1ERY0EYL2T-MMTO7MYM0yP7dGJP64dBCRMSzQ';

export interface SystemSource {
  /** معرّف ورقة العمل داخل الملف */
  gid: string;
  /** اسم الورقة كما هو في Google Sheets */
  sheet: string;
  /** ملاحظة عند كون البيانات مشتقة من ورقة أخرى */
  note?: string;
}

export const SYSTEM_SOURCES: Record<string, SystemSource> = {
  teacher: { gid: '0', sheet: 'Schedule' },
  student: { gid: '1765483005', sheet: 'الجدول حسب القسم واليوم' },
  auditReport: { gid: '587741649', sheet: 'Schedulereport' },
  auditHours: { gid: '1878774467', sheet: 'الساعات' },
  auditLectureType: { gid: '1765483005', sheet: 'الجدول حسب القسم واليوم', note: 'مشتق من جدول الطالب' },
  auditAssignments: { gid: '1416068353', sheet: 'التكليفات' },
  tracking: { gid: '1765483005', sheet: 'الجدول حسب القسم واليوم', note: 'مشتق من جدول الطالب' },
  emptyRooms: { gid: '1765483005', sheet: 'الجدول حسب القسم واليوم', note: 'محسوب من جدول الطالب' },
  assignments: { gid: '1147039908', sheet: 'التكليفات الفردية' },
  individualAssignments: { gid: '1147039908', sheet: 'التكليفات الفردية' },
  quotaAudit: { gid: '457825033', sheet: 'النصاب' },
  supervisionReport: { gid: '567847712', sheet: 'الاشراف' },
  expiredSupervision: { gid: '567847712', sheet: 'الاشراف' },
  studentsWithoutSupervisor: { gid: '345813260', sheet: 'الدراسات العليا' },
  researchPhaseStudents: { gid: '345813260', sheet: 'الدراسات العليا' },
  supervisionCap: { gid: '997769481', sheet: 'Check' },
  projects: { gid: '2145658694', sheet: 'المشاريع' },
  fourthStageStudents: { gid: '1210995176', sheet: 'الطلبة' },
  projectsAssignmentsAudit: { gid: '1210995176', sheet: 'الطلبة' },
  supervisionWorkload: { gid: '1081297434', sheet: 'CheckAllHr' },
  projectSupervisionExceeded: { gid: '1081297434', sheet: 'CheckAllHr' },
  teachersWithoutTheory: { gid: '1081297434', sheet: 'CheckAllHr' },
  unassignedSupervisors: { gid: '1081297434', sheet: 'CheckAllHr' },
};

/** رابط ورقة البيانات (صيغة CSV المنشورة) لمعرّف ورقة معيّن. */
export function sourceUrl(gid: string): string {
  return `${PUB_BASE}?gid=${gid}&single=true&output=csv`;
}

export function getSystemSource(systemId: string): SystemSource | undefined {
  return SYSTEM_SOURCES[systemId];
}
