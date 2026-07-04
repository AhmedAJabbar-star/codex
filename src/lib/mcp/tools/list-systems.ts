import { defineTool } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "list_systems",
  title: "List systems",
  description: "List the built-in systems (schedules, audits, supervision) available in the app.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => {
    const systems = [
      { path: "/teacher", title: "جدول التدريسيين" },
      { path: "/student", title: "جدول الطلبة" },
      { path: "/audit", title: "أنظمة التدقيق" },
      { path: "/tracking", title: "متابعة التدريس" },
      { path: "/empty-rooms", title: "القاعات الفارغة" },
      { path: "/assignments", title: "التكليفات" },
      { path: "/individual-assignments", title: "التكليفات الفردية" },
      { path: "/supervision-report", title: "تقرير الإشراف" },
      { path: "/projects", title: "المشاريع" },
      { path: "/charts", title: "الإحصائيات" },
    ];
    return {
      content: [{ type: "text", text: JSON.stringify(systems, null, 2) }],
      structuredContent: { systems },
    };
  },
});
