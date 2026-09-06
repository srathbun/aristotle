// Minimal local type surface for the omp ExtensionAPI used by this extension.
// Keeps the package dependency-free: omp injects the real API at runtime.

export interface SessionEntry {
  type: string;
  id?: string;
  parentId?: string | null;
  timestamp?: string;
  customType?: string;
  data?: unknown;
}

export interface SessionManager {
  getBranch(): SessionEntry[];
  getSessionId(): string | undefined;
}

export interface ToolResultContent {
  type: "text";
  text: string;
}

export interface ToolResult {
  content: ToolResultContent[];
  details?: Record<string, unknown>;
  isError?: boolean;
}

export interface ExtensionContext {
  cwd: string;
  sessionManager: SessionManager;
  hasUI?: boolean;
  ui?: {
    notify: (message: string, kind?: "info" | "error" | "warn") => void;
  };
}

export interface ZodSchemaLike {
  optional(): ZodSchemaLike;
  describe(description: string): ZodSchemaLike;
}

export interface ZodLike {
  object(shape: Record<string, ZodSchemaLike>): ZodSchemaLike;
  string(): ZodSchemaLike;
  enum(values: readonly string[]): ZodSchemaLike;
}

export interface ToolDefinition {
  name: string;
  label?: string;
  description: string;
  parameters: ZodSchemaLike;
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal: { aborted?: boolean } | undefined,
    onUpdate: ((update: Partial<ToolResult>) => void) | undefined,
    ctx: ExtensionContext,
  ): Promise<ToolResult>;
}

export interface ExtensionAPI {
  zod: ZodLike;
  registerTool(def: ToolDefinition): void;
  on(
    event: string,
    handler: (event: unknown, ctx: ExtensionContext) => unknown | Promise<unknown>,
  ): void;
  appendEntry(customType: string, data: unknown): unknown;
  logger?: {
    debug: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };
}
