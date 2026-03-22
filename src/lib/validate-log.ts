import { Log } from "@/types/log";

const ALLOWED_LEVELS = new Set(["error", "warn", "info", "debug"]);
const ALLOWED_FIELDS = new Set([
  "level", "message", "resourceId", "timestamp",
  "traceId", "spanId", "commit", "metadata",
]);
const MAX_MESSAGE_LENGTH = 10_000;
const MAX_STRING_LENGTH = 256;
const TRUNCATION_NOTE = " [truncated]";

// Strict ISO 8601 with time component — rejects plain dates, epoch numbers, "banana"
const ISO_8601_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  log?: Log; // normalized log if valid (or partially fixed via truncation)
}

function truncate(value: string, max: number, note = TRUNCATION_NOTE): string {
  if (value.length <= max) return value;
  return value.slice(0, max - note.length) + note;
}

function trimString(value: unknown, field: string): string {
  if (typeof value !== "string") return "";
  return truncate(value, MAX_STRING_LENGTH);
}

export function validateAndNormalize(raw: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { valid: false, errors: [{ field: "root", message: "Log must be a JSON object" }] };
  }

  const obj = raw as Record<string, unknown>;

  // Strip unexpected top-level fields — only keep spec fields
  const stripped: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (ALLOWED_FIELDS.has(key)) stripped[key] = obj[key];
    // silently drop unknown fields
  }

  // --- level ---
  if (!stripped.level) {
    errors.push({ field: "level", message: "level is required" });
  } else if (typeof stripped.level !== "string") {
    errors.push({ field: "level", message: "level must be a string" });
  } else {
    const normalized = stripped.level.toLowerCase();
    if (!ALLOWED_LEVELS.has(normalized)) {
      errors.push({
        field: "level",
        message: `level must be one of: error, warn, info, debug — got "${stripped.level}"`,
      });
    } else {
      stripped.level = normalized;
    }
  }

  // --- message ---
  if (!stripped.message) {
    errors.push({ field: "message", message: "message is required" });
  } else if (typeof stripped.message !== "string") {
    errors.push({ field: "message", message: "message must be a string" });
  } else {
    // Truncate but do NOT reject — long messages are common in log pipelines
    stripped.message = truncate(stripped.message, MAX_MESSAGE_LENGTH);
  }

  // --- timestamp ---
  if (!stripped.timestamp) {
    errors.push({ field: "timestamp", message: "timestamp is required" });
  } else if (typeof stripped.timestamp !== "string") {
    errors.push({ field: "timestamp", message: "timestamp must be a string" });
  } else if (!ISO_8601_RE.test(stripped.timestamp)) {
    errors.push({
      field: "timestamp",
      message: `timestamp must be a valid ISO 8601 string (e.g. 2023-09-15T08:00:00Z) — got "${stripped.timestamp}"`,
    });
  }

  // --- string fields (cap at 256 chars) ---
  for (const field of ["resourceId", "traceId", "spanId", "commit"] as const) {
    if (stripped[field] !== undefined) {
      if (typeof stripped[field] !== "string") {
        errors.push({ field, message: `${field} must be a string` });
      } else {
        stripped[field] = trimString(stripped[field], field);
      }
    }
  }

  // --- metadata ---
  if (stripped.metadata !== undefined) {
    if (typeof stripped.metadata !== "object" || stripped.metadata === null) {
      errors.push({ field: "metadata", message: "metadata must be an object" });
    } else {
      const meta = stripped.metadata as Record<string, unknown>;
      if (meta.parentResourceId !== undefined) {
        if (typeof meta.parentResourceId !== "string") {
          errors.push({ field: "metadata.parentResourceId", message: "metadata.parentResourceId must be a string" });
        } else {
          meta.parentResourceId = trimString(meta.parentResourceId, "metadata.parentResourceId");
        }
      }
    }
  }

  if (errors.length > 0) return { valid: false, errors };

  return { valid: true, errors: [], log: stripped as unknown as Log };
}
