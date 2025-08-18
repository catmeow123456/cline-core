import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// MCP Server Configuration
export interface McpServerConfig {
  type: "stdio" | "sse" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  disabled?: boolean;
  timeout?: number;
  autoApprove?: string[];
}

// MCP Server Status
export interface McpServer {
  name: string;
  config: string;
  status: "connected" | "connecting" | "disconnected";
  disabled?: boolean;
  error?: string;
  tools?: McpTool[];
  resources?: McpResource[];
  resourceTemplates?: McpResourceTemplate[];
}

// MCP Tool
export interface McpTool {
  name: string;
  description?: string;
  inputSchema: any;
  autoApprove?: boolean;
}

// MCP Resource
export interface McpResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

// MCP Resource Template
export interface McpResourceTemplate {
  uriTemplate: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

// MCP Tool Call Response
export interface McpToolCallResponse {
  content: any[];
  isError?: boolean;
}

// MCP Resource Response
export interface McpResourceResponse {
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  }>;
}

// MCP Connection
export interface McpConnection {
  server: McpServer;
  client: Client;
  transport: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport;
}

// Transport type union
export type Transport = StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport;

// MCP Settings
export interface McpSettings {
  mcpServers: Record<string, McpServerConfig>;
}

// Constants
export const DEFAULT_MCP_TIMEOUT_SECONDS = 30;
export const MIN_MCP_TIMEOUT_SECONDS = 5;
export const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
