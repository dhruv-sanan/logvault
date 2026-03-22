import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const LEVEL_STYLES: Record<string, string> = {
  error: "bg-red-100 text-red-800 border-red-200",
  warn:  "bg-yellow-100 text-yellow-800 border-yellow-200",
  info:  "bg-blue-100 text-blue-800 border-blue-200",
  debug: "bg-gray-100 text-gray-700 border-gray-200",
};

export function LogLevelBadge({ level }: { level: string }) {
  const style = LEVEL_STYLES[level.toLowerCase()] ?? "bg-purple-100 text-purple-800 border-purple-200";

  return (
    <Badge variant="outline" className={cn("font-mono text-xs font-semibold uppercase", style)}>
      {level}
    </Badge>
  );
}
