import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  CallToolResultSchema,
  ListResourcesResultSchema,
  ListResourceTemplatesResultSchema,
  ListToolsResultSchema,
  ReadResourceResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import deepEqual from "fast-deep-equal";
import * as fs from "fs/promises";
import * as path from "path";
import ReconnectingEventSource from "reconnecting-eventsource";
import { z } from "zod";
import {
  McpConnection,
  McpServer,
  McpServerConfig,
  McpSettings,
  McpTool,
  McpResource,
  McpResourceTemplate,
  McpToolCallResponse,
  McpResourceResponse,
  Transport,
  DEFAULT_MCP_TIMEOUT_SECONDS,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from "./types";

export class McpHub {
  private connections: McpConnection[] = [];
  private isConnecting: boolean = false;
  private settingsPath: string;
  private clientVersion: string;

  // Callback for sending notifications to active task
  private notificationCallback?: (serverName: string, level: string, message: string) => void;

  constructor(settingsPath: string, clientVersion: string = "1.0.0") {
    this.settingsPath = settingsPath;
    this.clientVersion = clientVersion;
  }

  // Public API
  getServers(): McpServer[] {
    return this.connections
      .filter((conn) => !conn.server.disabled)
      .map((conn) => conn.server);
  }

  async initialize(): Promise<void> {
    const settings = await this.readMcpSettings();
    if (settings) {
      await this.updateServerConnections(settings.mcpServers);
    }
  }

  async callTool(serverName: string, toolName: string, toolArguments?: Record<string, unknown>): Promise<McpToolCallResponse> {
    const connection = this.findConnection(serverName);
    if (!connection) {
      throw new Error(`No connection found for server: ${serverName}`);
    }

    if (connection.server.disabled) {
      throw new Error(`Server "${serverName}" is disabled and cannot be used`);
    }

    const timeout = this.getServerTimeout(connection);

    const result = await connection.client.request(
      {
        method: "tools/call",
        params: {
          name: toolName,
          arguments: toolArguments,
        },
      },
      CallToolResultSchema,
      { timeout }
    );

    return {
      ...result,
      content: result.content ?? [],
    };
  }

  async readResource(serverName: string, uri: string): Promise<McpResourceResponse> {
    const connection = this.findConnection(serverName);
    if (!connection) {
      throw new Error(`No connection found for server: ${serverName}`);
    }

    if (connection.server.disabled) {
      throw new Error(`Server "${serverName}" is disabled`);
    }

    return await connection.client.request(
      {
        method: "resources/read",
        params: { uri },
      },
      ReadResourceResultSchema
    );
  }

  setNotificationCallback(callback: (serverName: string, level: string, message: string) => void): void {
    this.notificationCallback = callback;
  }

  clearNotificationCallback(): void {
    this.notificationCallback = undefined;
  }

  async dispose(): Promise<void> {
    for (const connection of this.connections) {
      try {
        await this.deleteConnection(connection.server.name);
      } catch (error) {
        console.error(`Failed to close connection for ${connection.server.name}:`, error);
      }
    }
    this.connections = [];
  }

  // Private methods
  private async readMcpSettings(): Promise<McpSettings | undefined> {
    try {
      if (!(await this.fileExists(this.settingsPath))) {
        await this.createDefaultSettings();
      }

      const content = await fs.readFile(this.settingsPath, "utf-8");
      const config = JSON.parse(content);

      // Basic validation
      if (!config.mcpServers || typeof config.mcpServers !== "object") {
        return { mcpServers: {} };
      }

      return config as McpSettings;
    } catch (error) {
      console.error("Failed to read MCP settings:", error);
      return undefined;
    }
  }

  private async createDefaultSettings(): Promise<void> {
    const defaultSettings: McpSettings = {
      mcpServers: {},
    };

    await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
    await fs.writeFile(this.settingsPath, JSON.stringify(defaultSettings, null, 2));
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private findConnection(name: string): McpConnection | undefined {
    return this.connections.find((conn) => conn.server.name === name);
  }

  private async updateServerConnections(newServers: Record<string, McpServerConfig>): Promise<void> {
    this.isConnecting = true;

    const currentNames = new Set(this.connections.map((conn) => conn.server.name));
    const newNames = new Set(Object.keys(newServers));

    // Delete removed servers
    for (const name of currentNames) {
      if (!newNames.has(name)) {
        await this.deleteConnection(name);
        console.log(`Deleted MCP server: ${name}`);
      }
    }

    // Update or add servers
    for (const [name, config] of Object.entries(newServers)) {
      const currentConnection = this.findConnection(name);

      if (!currentConnection) {
        // New server
        try {
          await this.connectToServer(name, config);
        } catch (error) {
          console.error(`Failed to connect to new MCP server ${name}:`, error);
        }
      } else if (!deepEqual(JSON.parse(currentConnection.server.config), config)) {
        // Existing server with changed config
        try {
          await this.deleteConnection(name);
          await this.connectToServer(name, config);
          console.log(`Reconnected MCP server with updated config: ${name}`);
        } catch (error) {
          console.error(`Failed to reconnect MCP server ${name}:`, error);
        }
      }
    }

    this.isConnecting = false;
  }

  private async connectToServer(name: string, config: McpServerConfig): Promise<void> {
    // Remove existing connection if it exists
    this.connections = this.connections.filter((conn) => conn.server.name !== name);

    if (config.disabled) {
      // Create a connection object for disabled server
      const disabledConnection: McpConnection = {
        server: {
          name,
          config: JSON.stringify(config),
          status: "disconnected",
          disabled: true,
        },
        client: null as unknown as Client,
        transport: null as unknown as Transport,
      };
      this.connections.push(disabledConnection);
      return;
    }

    try {
      const client = new Client(
        {
          name: "Cline-Core",
          version: this.clientVersion,
        },
        {
          capabilities: {},
        }
      );

      let transport: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport;

      switch (config.type) {
        case "stdio": {
          transport = new StdioClientTransport({
            command: config.command!,
            args: config.args,
            cwd: config.cwd,
            env: {
              ...getDefaultEnvironment(),
              ...(config.env || {}),
            },
            stderr: "pipe",
          });

          transport.onerror = (error) => {
            console.error(`Transport error for "${name}":`, error);
            const connection = this.findConnection(name);
            if (connection) {
              connection.server.status = "disconnected";
              this.appendErrorMessage(connection, error instanceof Error ? error.message : `${error}`);
            }
          };

          transport.onclose = () => {
            const connection = this.findConnection(name);
            if (connection) {
              connection.server.status = "disconnected";
            }
          };

          await transport.start();
          break;
        }

        case "sse": {
          const sseOptions = {
            requestInit: {
              headers: config.headers,
            },
          };
          const reconnectingEventSourceOptions = {
            max_retry_time: 5000,
            withCredentials: config.headers?.["Authorization"] ? true : false,
          };
          global.EventSource = ReconnectingEventSource;
          transport = new SSEClientTransport(new URL(config.url!), {
            ...sseOptions,
            eventSourceInit: reconnectingEventSourceOptions,
          });

          transport.onerror = (error) => {
            console.error(`Transport error for "${name}":`, error);
            const connection = this.findConnection(name);
            if (connection) {
              connection.server.status = "disconnected";
              this.appendErrorMessage(connection, error instanceof Error ? error.message : `${error}`);
            }
          };
          break;
        }

        case "http": {
          transport = new StreamableHTTPClientTransport(new URL(config.url!), {
            requestInit: {
              headers: config.headers,
            },
          });
          transport.onerror = (error) => {
            console.error(`Transport error for "${name}":`, error);
            const connection = this.findConnection(name);
            if (connection) {
              connection.server.status = "disconnected";
              this.appendErrorMessage(connection, error instanceof Error ? error.message : `${error}`);
            }
          };
          break;
        }

        default:
          throw new Error(`Unknown transport type: ${(config as any).type}`);
      }

      const connection: McpConnection = {
        server: {
          name,
          config: JSON.stringify(config),
          status: "connecting",
          disabled: config.disabled,
        },
        client,
        transport,
      };
      this.connections.push(connection);

      // Connect
      await client.connect(transport);

      connection.server.status = "connected";
      connection.server.error = "";

      // Set up notification handler
      try {
        const { z } = await import("zod");
        const NotificationMessageSchema = z.object({
          method: z.literal("notifications/message"),
          params: z
            .object({
              level: z.enum(["debug", "info", "warning", "error"]).optional(),
              logger: z.string().optional(),
              data: z.string().optional(),
              message: z.string().optional(),
            })
            .optional(),
        });

        connection.client.setNotificationHandler(NotificationMessageSchema as any, async (notification: any) => {
          const params = notification.params || {};
          const level = params.level || "info";
          const data = params.data || params.message || "";
          const logger = params.logger || "";
          const message = logger ? `[${logger}] ${data}` : data;

          if (this.notificationCallback) {
            this.notificationCallback(name, level, message);
          }
        });
      } catch (error) {
        console.error(`Error setting notification handlers for ${name}:`, error);
      }

      // Fetch tools and resources
      connection.server.tools = await this.fetchToolsList(name);
      connection.server.resources = await this.fetchResourcesList(name);
      connection.server.resourceTemplates = await this.fetchResourceTemplatesList(name);
    } catch (error) {
      const connection = this.findConnection(name);
      if (connection) {
        connection.server.status = "disconnected";
        this.appendErrorMessage(connection, error instanceof Error ? error.message : String(error));
      }
      throw error;
    }
  }

  private async deleteConnection(name: string): Promise<void> {
    const connection = this.findConnection(name);
    if (connection) {
      try {
        if (connection.transport) {
          await connection.transport.close();
        }
        if (connection.client) {
          await connection.client.close();
        }
      } catch (error) {
        console.error(`Failed to close transport for ${name}:`, error);
      }
      this.connections = this.connections.filter((conn) => conn.server.name !== name);
    }
  }

  private appendErrorMessage(connection: McpConnection, error: string): void {
    const newError = connection.server.error ? `${connection.server.error}\n${error}` : error;
    connection.server.error = newError;
  }

  private async fetchToolsList(serverName: string): Promise<McpTool[]> {
    try {
      const connection = this.findConnection(serverName);
      if (!connection || connection.server.disabled || !connection.client) {
        return [];
      }

      const response = await connection.client.request(
        { method: "tools/list" },
        ListToolsResultSchema,
        { timeout: DEFAULT_REQUEST_TIMEOUT_MS }
      );

      return (response?.tools || []).map((tool) => ({
        ...tool,
        autoApprove: false, // Default to false, can be configured later
      }));
    } catch (error) {
      console.error(`Failed to fetch tools for ${serverName}:`, error);
      return [];
    }
  }

  private async fetchResourcesList(serverName: string): Promise<McpResource[]> {
    try {
      const connection = this.findConnection(serverName);
      if (!connection || connection.server.disabled || !connection.client) {
        return [];
      }

      const response = await connection.client.request(
        { method: "resources/list" },
        ListResourcesResultSchema,
        { timeout: DEFAULT_REQUEST_TIMEOUT_MS }
      );

      return response?.resources || [];
    } catch (error) {
      return [];
    }
  }

  private async fetchResourceTemplatesList(serverName: string): Promise<McpResourceTemplate[]> {
    try {
      const connection = this.findConnection(serverName);
      if (!connection || connection.server.disabled || !connection.client) {
        return [];
      }

      const response = await connection.client.request(
        { method: "resources/templates/list" },
        ListResourceTemplatesResultSchema,
        { timeout: DEFAULT_REQUEST_TIMEOUT_MS }
      );

      return response?.resourceTemplates || [];
    } catch (error) {
      return [];
    }
  }

  private getServerTimeout(connection: McpConnection): number {
    try {
      const config = JSON.parse(connection.server.config);
      return (config.timeout || DEFAULT_MCP_TIMEOUT_SECONDS) * 1000; // Convert to milliseconds
    } catch {
      return DEFAULT_MCP_TIMEOUT_SECONDS * 1000;
    }
  }
}
