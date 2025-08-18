import { Anthropic } from "@anthropic-ai/sdk";

// Core configuration types
export interface ClineConfig {
  apiProvider: ApiProvider;
  apiKey?: string;
  model?: string;
  mode: Mode;
  autoApproval?: AutoApprovalSettings;
  mcpServers?: Record<string, McpServerConfig>;
  workingDirectory?: string;
  maxTokens?: number;
  temperature?: number;
  baseUrl?: string;
}

// API Provider types
export type ApiProvider = 
  | "anthropic"
  | "openai" 
  | "openrouter"
  | "ollama"
  | "gemini";

export type Mode = "plan" | "act";

export interface ModelInfo {
  id: string;
  name: string;
  maxTokens: number;
  supportsImages: boolean;
  inputPrice?: number;
  outputPrice?: number;
}

// Auto-approval settings
export interface AutoApprovalSettings {
  enabled: boolean;
  maxRequests: number;
  enabledTools: string[];
  riskyCommandsEnabled: boolean;
}

// Task execution types
export interface TaskState {
  taskId: string;
  mode: Mode;
  isStreaming: boolean;
  isInitialized: boolean;
  abort: boolean;
  consecutiveMistakeCount: number;
  consecutiveAutoApprovedRequestsCount: number;
  apiRequestCount: number;
  didEditFile: boolean;
  userMessageContentReady: boolean;
  assistantMessageContent: AssistantMessageContent[];
  currentStreamingContentIndex: number;
  didCompleteReadingStream: boolean;
  conversationHistoryDeletedRange?: [number, number];
}

// Message types
export type UserContent = Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>;

export interface AssistantMessageContent {
  type: "text" | "tool_use";
  content?: string;
  name?: string;
  input?: any;
  partial?: boolean;
}

export interface ClineMessage {
  ts: number;
  type: "ask" | "say";
  ask?: string;
  say?: string;
  text?: string;
  images?: string[];
  files?: string[];
  partial?: boolean;
}

// Tool types
export interface ToolResult {
  success: boolean;
  content: string;
  images?: string[];
}

export interface ToolExecutionContext {
  taskId: string;
  workingDirectory: string;
  autoApproval: AutoApprovalSettings;
  mode: Mode;
}

// MCP types
export interface McpServerConfig {
  type: "stdio" | "sse" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  disabled?: boolean;
  timeout?: number;
  autoApprove?: string[];
}

export interface McpServer {
  name: string;
  config: string;
  status: "connected" | "connecting" | "disconnected";
  disabled?: boolean;
  error?: string;
  tools?: McpTool[];
  resources?: McpResource[];
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: any;
  autoApprove?: boolean;
}

export interface McpResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface McpToolCallResponse {
  content: Array<{
    type: "text" | "image";
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

// Context management types
export interface ContextWindowInfo {
  contextWindow: number;
  maxAllowedSize: number;
}

export interface ContextUpdate {
  timestamp: number;
  updateType: string;
  content: string[];
  metadata: string[][];
}

// Storage types
export interface TaskHistory {
  id: string;
  timestamp: number;
  task: string;
  mode: Mode;
  tokensUsed: number;
  cost?: number;
  completed: boolean;
}

export interface StateData {
  taskHistory: TaskHistory[];
  apiConfiguration: ClineConfig;
  lastTaskId?: string;
}

// CLI types
export interface CLIOptions {
  task?: string;
  mode?: Mode;
  provider?: ApiProvider;
  model?: string;
  interactive?: boolean;
  config?: string;
}

// Error types
export class ClineError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = "ClineError";
  }
}

// Event types
export interface TaskEvent {
  type: "task_started" | "task_completed" | "tool_executed" | "error" | "message";
  data: any;
  timestamp: number;
}

export type EventCallback = (event: TaskEvent) => void;
