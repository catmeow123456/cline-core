import { Task } from "./task/Task";
import { McpHub } from "./mcp/McpHub";
import {
  ClineConfig,
  TaskState,
  ClineMessage,
  EventCallback,
  TaskEvent,
  Mode,
  ApiProvider,
} from "./types";
import * as path from "path";
import * as os from "os";

export class ClineCore {
  private config: ClineConfig;
  private mcpHub?: McpHub;
  private currentTask?: Task;
  private eventCallbacks: EventCallback[] = [];

  constructor(config: ClineConfig) {
    this.config = {
      workingDirectory: process.cwd(),
      maxTokens: 8192,
      temperature: 0,
      ...config,
    };

    // Initialize MCP Hub if servers are configured
    if (this.config.mcpServers && Object.keys(this.config.mcpServers).length > 0) {
      const mcpSettingsPath = path.join(os.homedir(), ".cline-core", "mcp-settings.json");
      this.mcpHub = new McpHub(mcpSettingsPath);
      this.initializeMcpHub();
    }
  }

  private async initializeMcpHub(): Promise<void> {
    if (this.mcpHub) {
      try {
        await this.mcpHub.initialize();
        console.log("MCP Hub initialized successfully");
      } catch (error) {
        console.error("Failed to initialize MCP Hub:", error);
      }
    }
  }

  // Public API
  async startTask(task: string, images?: string[]): Promise<void> {
    if (this.currentTask) {
      await this.currentTask.abort();
    }

    this.currentTask = new Task(this.config, this.mcpHub);
    
    // Forward events from task to our callbacks
    this.currentTask.addEventListener((event) => {
      this.emitEvent(event.type, event.data);
    });

    await this.currentTask.startTask(task, images);
  }

  async continueTask(message: string, images?: string[]): Promise<void> {
    if (!this.currentTask) {
      throw new Error("No active task. Start a task first.");
    }

    await this.currentTask.continueTask(message, images);
  }

  async switchMode(mode: Mode): Promise<void> {
    this.config.mode = mode;
    
    if (this.currentTask) {
      await this.currentTask.switchMode(mode);
    }
  }

  async abortTask(): Promise<void> {
    if (this.currentTask) {
      await this.currentTask.abort();
      this.currentTask = undefined;
    }
  }

  // Event handling
  addEventListener(callback: EventCallback): void {
    this.eventCallbacks.push(callback);
  }

  removeEventListener(callback: EventCallback): void {
    const index = this.eventCallbacks.indexOf(callback);
    if (index > -1) {
      this.eventCallbacks.splice(index, 1);
    }
  }

  // Getters
  getConfig(): ClineConfig {
    return { ...this.config };
  }

  getCurrentTask(): Task | undefined {
    return this.currentTask;
  }

  getTaskState(): TaskState | undefined {
    return this.currentTask?.getState();
  }

  getMessages(): ClineMessage[] {
    return this.currentTask?.getMessages() || [];
  }

  getMcpServers() {
    return this.mcpHub?.getServers() || [];
  }

  // Configuration updates
  updateConfig(updates: Partial<ClineConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  updateApiProvider(provider: ApiProvider, apiKey?: string): void {
    this.config.apiProvider = provider;
    if (apiKey) {
      this.config.apiKey = apiKey;
    }
  }

  // Cleanup
  async dispose(): Promise<void> {
    if (this.currentTask) {
      await this.currentTask.abort();
    }
    
    if (this.mcpHub) {
      await this.mcpHub.dispose();
    }
    
    this.eventCallbacks = [];
  }

  // Private methods
  private emitEvent(type: TaskEvent["type"], data: any): void {
    const event: TaskEvent = {
      type,
      data,
      timestamp: Date.now(),
    };

    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error("Error in event callback:", error);
      }
    }
  }
}

// Export everything
export * from "./types";
export { ApiHandler, ApiStream, ApiStreamChunk, ApiStreamUsage, ApiConfiguration } from "./api";
export { ContextManager } from "./context/ContextManager";
export { Task } from "./task/Task";
export { McpHub } from "./mcp/McpHub";
export * from "./tools";

// Default export
export default ClineCore;
