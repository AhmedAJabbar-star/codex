import { defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";
import listSystemsTool from "./tools/list-systems";

export default defineMcp({
  name: "civil-academi-mcp",
  title: "Civil Academi MCP",
  version: "0.1.0",
  instructions:
    "أدوات كلية الهندسة المدنية: استخدم `echo` للتحقق من الاتصال، و`list_systems` لمعرفة الأنظمة المتاحة.",
  tools: [echoTool, listSystemsTool],
});
