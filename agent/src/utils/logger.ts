// ── Enhanced Logger for AgentCult ─────────────────────────────────────
// Provides colorized, structured, readable console output with icons,
// timing helpers, and contextual error formatting.

import { inspect } from "node:util";

// ── ANSI color codes ─────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  // Foreground
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

// ── Level config ─────────────────────────────────────────────────────

interface LevelConfig {
  icon: string;
  color: string;
  label: string;
}

const LEVELS: Record<string, LevelConfig> = {
  INFO:  { icon: "ℹ", color: C.cyan,   label: "INFO " },
  WARN:  { icon: "⚠", color: C.yellow, label: "WARN " },
  ERROR: { icon: "✖", color: C.red,    label: "ERROR" },
  DEBUG: { icon: "🔍", color: C.gray,   label: "DEBUG" },
  OK:    { icon: "✔", color: C.green,  label: " OK  " },
};

// ── Helpers ──────────────────────────────────────────────────────────

function timestamp(): string {
  const now = new Date();
  return (
    now.toLocaleTimeString("en-GB", { hour12: false }) +
    "." +
    String(now.getMilliseconds()).padStart(3, "0")
  );
}

function pad(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + " ".repeat(len - str.length);
}

/**
 * Format an error object into a readable multi-line string.
 * Extracts message, code, status, and a short stack trace.
 */
function formatError(err: unknown): string {
  if (err instanceof Error) {
    const parts: string[] = [`${C.red}${err.message}${C.reset}`];
    const meta = err as any;
    if (meta.code) parts.push(`  code: ${meta.code}`);
    if (meta.status) parts.push(`  status: ${meta.status}`);
    if (meta.reason) parts.push(`  reason: ${meta.reason}`);
    if (err.stack) {
      const frames = err.stack
        .split("\n")
        .slice(1, 4)
        .map((f) => `  ${C.dim}${f.trim()}${C.reset}`);
      parts.push(...frames);
    }
    return parts.join("\n");
  }
  if (typeof err === "string") return `${C.red}${err}${C.reset}`;
  return inspect(err, { depth: 2, colors: true });
}

/**
 * Format extra args into a readable suffix.
 */
function formatArgs(args: any[]): string {
  if (args.length === 0) return "";
  const parts = args.map((a) => {
    if (a instanceof Error) return "\n" + formatError(a);
    if (typeof a === "object" && a !== null) {
      return "\n" + inspect(a, { depth: 3, colors: true, compact: true, breakLength: 100 });
    }
    return String(a);
  });
  return " " + parts.join(" ");
}

// ── Module-color assignment (deterministic per prefix) ───────────────

const MODULE_COLORS = [C.magenta, C.blue, C.cyan, C.green, C.yellow];
let _colorIdx = 0;
const _colorMap = new Map<string, string>();

function moduleColor(prefix: string): string {
  if (!_colorMap.has(prefix)) {
    _colorMap.set(prefix, MODULE_COLORS[_colorIdx % MODULE_COLORS.length]);
    _colorIdx++;
  }
  return _colorMap.get(prefix)!;
}

// ── Logger interface & factory ───────────────────────────────────────

export interface Logger {
  info: (msg: string, ...args: any[]) => void;
  warn: (msg: string, ...args: any[]) => void;
  error: (msg: string, ...args: any[]) => void;
  debug: (msg: string, ...args: any[]) => void;
  ok: (msg: string, ...args: any[]) => void;
  /** Log a separator / section header */
  section: (title: string) => void;
  /** Start a timer, returns a function that logs elapsed time */
  timer: (label: string) => () => void;
  /** Log an error with full context (message + error object) */
  errorWithContext: (msg: string, error: unknown, extra?: Record<string, any>) => void;
  /** Log a key-value table for structured data */
  table: (label: string, data: Record<string, any>) => void;
}

export function createLogger(prefix: string): Logger {
  const mColor = moduleColor(prefix);
  const paddedPrefix = pad(prefix, 22);

  const emit = (level: string, msg: string, ...args: any[]) => {
    const lc = LEVELS[level] || LEVELS.INFO;
    const ts = `${C.dim}${timestamp()}${C.reset}`;
    const lbl = `${lc.color}${C.bold}${lc.icon} ${lc.label}${C.reset}`;
    const mod = `${mColor}[${paddedPrefix}]${C.reset}`;
    const suffix = formatArgs(args);
    const line = `${ts} ${lbl} ${mod} ${msg}${suffix}`;

    if (level === "ERROR") {
      console.error(line);
    } else if (level === "WARN") {
      console.warn(line);
    } else {
      console.log(line);
    }
  };

  return {
    info: (msg, ...args) => emit("INFO", msg, ...args),
    warn: (msg, ...args) => emit("WARN", msg, ...args),
    error: (msg, ...args) => emit("ERROR", msg, ...args),
    debug: (msg, ...args) => {
      if (process.env.DEBUG) emit("DEBUG", msg, ...args);
    },
    ok: (msg, ...args) => emit("OK", msg, ...args),

    section(title: string) {
      const line = "─".repeat(60);
      console.log(`\n${C.dim}${line}${C.reset}`);
      console.log(`${C.bold}${mColor}  ◆ ${title}${C.reset}`);
      console.log(`${C.dim}${line}${C.reset}`);
    },

    timer(label: string): () => void {
      const start = performance.now();
      return () => {
        const elapsed = performance.now() - start;
        const formatted =
          elapsed < 1000
            ? `${elapsed.toFixed(0)}ms`
            : `${(elapsed / 1000).toFixed(2)}s`;
        emit("INFO", `${label} ${C.dim}(${formatted})${C.reset}`);
      };
    },

    errorWithContext(msg: string, error: unknown, extra?: Record<string, any>) {
      const errStr = formatError(error);
      emit("ERROR", msg);
      console.error(errStr);
      if (extra && Object.keys(extra).length > 0) {
        console.error(
          `  ${C.dim}context:${C.reset}`,
          inspect(extra, { depth: 2, colors: true, compact: true }),
        );
      }
    },

    table(label: string, data: Record<string, any>) {
      emit("INFO", label);
      const maxKey = Math.max(...Object.keys(data).map((k) => k.length), 8);
      for (const [key, value] of Object.entries(data)) {
        const k = pad(key, maxKey);
        const v =
          typeof value === "object" && value !== null
            ? inspect(value, { depth: 1, colors: true, compact: true })
            : String(value);
        console.log(`  ${C.dim}│${C.reset} ${C.cyan}${k}${C.reset}  ${v}`);
      }
    },
  };
}
