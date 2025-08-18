import { Anthropic } from "@anthropic-ai/sdk";
import { ulid } from "ulid";
// Use dynamic import for p-wait-for since it's an ES module
const pWaitFor = async (condition: () => boolean | Promise<boolean>, options?: { timeout?: number }) => {
  const { default: waitFor } = await import("p-wait-for");
  return waitFor(condition, options);
};
import { ApiHandler, buildApiHandler, isContextWindowExceededError } from "../api";
import { ContextManager } from "../context/ContextManager";
import { McpHub } from "../mcp/McpHub";
import { ToolRegistry } from "../tools";
import {
  ClineConfig,
  TaskState,
  UserContent,
  AssistantMessageContent,
  ClineMessage,
  ToolResult,
  ToolExecutionContext,
  EventCallback,
  TaskEvent,
  ClineError,
  Mode,
} from "../types";

export class Task {
  public readonly taskId: string;
  public readonly ulid: string;
  private config: ClineConfig;
  private state: TaskState;
  
  // Core components
  private apiHandler: ApiHandler;
  private contextManager: ContextManager;
  private mcpHub?: McpHub;
  private toolRegistry: ToolRegistry;
  
  // Message history
  private apiConversationHistory: Anthropic.Messages.MessageParam[] = [];
  private clineMessages: ClineMessage[] = [];
  
  // Event handling
  private eventCallbacks: EventCallback[] = [];
  
  // Streaming state
  private assistantMessageContent: AssistantMessageContent[] = [];
  private currentStreamingContentIndex: number = 0;
  private isStreaming: boolean = false;
  private userMessageContentReady: boolean = false;

  constructor(config: ClineConfig, mcpHub?: McpHub) {
    this.taskId = Date.now().toString();
    this.ulid = ulid();
    this.config = config;
    this.mcpHub = mcpHub;

    // Initialize state
    this.state = {
      taskId: this.taskId,
      mode: config.mode,
      isStreaming: false,
      isInitialized: false,
      abort: false,
      consecutiveMistakeCount: 0,
      consecutiveAutoApprovedRequestsCount: 0,
      apiRequestCount: 0,
      didEditFile: false,
      userMessageContentReady: false,
      assistantMessageContent: [],
      currentStreamingContentIndex: 0,
      didCompleteReadingStream: false,
    };

    // Initialize components
    this.apiHandler = buildApiHandler({
      apiProvider: config.apiProvider,
      anthropicApiKey: config.apiKey,
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      baseUrl: config.baseUrl,
    });

    this.contextManager = new ContextManager();

    // Initialize tool registry
    const toolContext: ToolExecutionContext = {
      taskId: this.taskId,
      workingDirectory: config.workingDirectory || process.cwd(),
      autoApproval: config.autoApproval || {
        enabled: false,
        maxRequests: 10,
        enabledTools: [],
        riskyCommandsEnabled: false,
      },
      mode: config.mode,
    };
    this.toolRegistry = new ToolRegistry(toolContext);
  }

  // Public API
  async startTask(task: string, images?: string[]): Promise<void> {
    this.emitEvent("task_started", { task, images });
    
    try {
      // Add initial user message
      const userContent: UserContent = [
        {
          type: "text",
          text: `<task>\n${task}\n</task>`,
        },
      ];

      // Add images if provided
      if (images && images.length > 0) {
        for (const image of images) {
          userContent.push({
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg", // Assume JPEG for now
              data: image,
            },
          });
        }
      }

      // Add to conversation history
      this.apiConversationHistory.push({
        role: "user",
        content: userContent as any,
      });

      // Add to Cline messages
      this.clineMessages.push({
        ts: Date.now(),
        type: "say",
        say: "task_started",
        text: task,
        images,
      });

      this.state.isInitialized = true;

      // Start the task execution loop
      await this.executeTaskLoop();
    } catch (error) {
      this.emitEvent("error", { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async switchMode(mode: Mode): Promise<void> {
    this.config.mode = mode;
    this.state.mode = mode;
    
    // Rebuild API handler with new mode
    this.apiHandler = buildApiHandler({
      apiProvider: this.config.apiProvider,
      anthropicApiKey: this.config.apiKey,
      model: this.config.model,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      baseUrl: this.config.baseUrl,
    });

    this.emitEvent("message", { type: "mode_switched", mode });
  }

  async continueTask(message: string, images?: string[]): Promise<void> {
    const userContent: UserContent = [
      {
        type: "text",
        text: message,
      },
    ];

    if (images && images.length > 0) {
      for (const image of images) {
        userContent.push({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/jpeg",
            data: image,
          },
        });
      }
    }

    this.apiConversationHistory.push({
      role: "user",
      content: userContent as any,
    });

    this.clineMessages.push({
      ts: Date.now(),
      type: "say",
      say: "user_message",
      text: message,
      images,
    });

    await this.executeTaskLoop();
  }

  addEventListener(callback: EventCallback): void {
    this.eventCallbacks.push(callback);
  }

  removeEventListener(callback: EventCallback): void {
    const index = this.eventCallbacks.indexOf(callback);
    if (index > -1) {
      this.eventCallbacks.splice(index, 1);
    }
  }

  async abort(): Promise<void> {
    this.state.abort = true;
    this.isStreaming = false;
    this.emitEvent("message", { type: "task_aborted" });
  }

  getState(): TaskState {
    return { ...this.state };
  }

  getMessages(): ClineMessage[] {
    return [...this.clineMessages];
  }

  // Private methods
  private async executeTaskLoop(): Promise<void> {
    while (!this.state.abort) {
      try {
        // Check if we need to truncate context
        const contextMetadata = this.contextManager.getContextMetadata(
          this.apiConversationHistory,
          this.apiHandler,
          this.state.conversationHistoryDeletedRange
        );

        if (contextMetadata.shouldTruncate) {
          const truncationRange = this.contextManager.getNextTruncationRange(
            this.apiConversationHistory,
            this.state.conversationHistoryDeletedRange,
            "half"
          );
          this.state.conversationHistoryDeletedRange = truncationRange;
          this.contextManager.addTruncationNotice(Date.now());
        }

        // Make API request
        const systemPrompt = this.generateSystemPrompt();
        const messages = contextMetadata.truncatedMessages;

        this.state.apiRequestCount++;
        this.isStreaming = true;
        this.assistantMessageContent = [];
        this.currentStreamingContentIndex = 0;
        this.userMessageContentReady = false;

        const stream = this.apiHandler.createMessage(systemPrompt, messages);
        let assistantMessage = "";

        for await (const chunk of stream) {
          if (this.state.abort) break;

          switch (chunk.type) {
            case "text":
              assistantMessage += chunk.text || "";
              this.assistantMessageContent = this.parseAssistantMessage(assistantMessage);
              await this.presentAssistantMessage();
              break;

            case "usage":
              // Handle token usage
              this.emitEvent("message", {
                type: "token_usage",
                inputTokens: chunk.inputTokens,
                outputTokens: chunk.outputTokens,
                totalCost: chunk.totalCost,
              });
              break;
          }
        }

        this.isStreaming = false;

        if (this.state.abort) break;

        // Add assistant message to conversation history
        if (assistantMessage) {
          this.apiConversationHistory.push({
            role: "assistant",
            content: [{ type: "text", text: assistantMessage }],
          });

          this.clineMessages.push({
            ts: Date.now(),
            type: "say",
            say: "assistant_message",
            text: assistantMessage,
          });
        }

        // Wait for tool execution to complete
        await pWaitFor(() => this.userMessageContentReady, { timeout: 300000 }); // 5 minute timeout

        // Check if task is complete
        const hasCompletionTool = this.assistantMessageContent.some(
          (content) => content.type === "tool_use" && content.name === "attempt_completion"
        );

        if (hasCompletionTool) {
          this.emitEvent("task_completed", { taskId: this.taskId });
          break;
        }

        // Continue with next iteration
      } catch (error) {
        if (isContextWindowExceededError(error)) {
          // Handle context window exceeded
          const truncationRange = this.contextManager.getNextTruncationRange(
            this.apiConversationHistory,
            this.state.conversationHistoryDeletedRange,
            "quarter"
          );
          this.state.conversationHistoryDeletedRange = truncationRange;
          this.contextManager.addTruncationNotice(Date.now());
          continue; // Retry with truncated context
        }

        this.emitEvent("error", { error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    }
  }

  private async presentAssistantMessage(): Promise<void> {
    if (this.currentStreamingContentIndex >= this.assistantMessageContent.length) {
      this.userMessageContentReady = true;
      return;
    }

    const content = this.assistantMessageContent[this.currentStreamingContentIndex];

    switch (content.type) {
      case "text":
        this.emitEvent("message", {
          type: "assistant_text",
          content: content.content,
          partial: content.partial,
        });
        break;

      case "tool_use":
        if (content.name && content.input) {
          await this.executeTool(content.name, content.input);
        }
        break;
    }

    if (!content.partial) {
      this.currentStreamingContentIndex++;
      if (this.currentStreamingContentIndex < this.assistantMessageContent.length) {
        await this.presentAssistantMessage();
      } else {
        this.userMessageContentReady = true;
      }
    }
  }

  private async executeTool(toolName: string, args: any): Promise<void> {
    this.emitEvent("message", { type: "tool_execution_started", toolName, args });

    try {
      let result: ToolResult;

      // Check if it's an MCP tool
      if (this.mcpHub && toolName.includes("/")) {
        const [serverName, mcpToolName] = toolName.split("/", 2);
        const mcpResult = await this.mcpHub.callTool(serverName, mcpToolName, args);
        result = {
          success: !mcpResult.isError,
          content: mcpResult.content.map(c => c.text || "").join("\n"),
        };
      } else {
        // Use built-in tool
        const toolContext: ToolExecutionContext = {
          taskId: this.taskId,
          workingDirectory: this.config.workingDirectory || process.cwd(),
          autoApproval: this.config.autoApproval || {
            enabled: false,
            maxRequests: 10,
            enabledTools: [],
            riskyCommandsEnabled: false,
          },
          mode: this.config.mode,
        };
        result = await this.toolRegistry.executeTool(toolName, args, toolContext);
      }

      // Add tool result to conversation
      this.apiConversationHistory.push({
        role: "user",
        content: [
          {
            type: "text",
            text: `Tool "${toolName}" result: ${result.content}`,
          },
        ],
      });

      this.clineMessages.push({
        ts: Date.now(),
        type: "say",
        say: "tool_result",
        text: `${toolName}: ${result.content}`,
      });

      this.emitEvent("tool_executed", { toolName, args, result });

      if (toolName === "write_to_file" || toolName === "replace_in_file") {
        this.state.didEditFile = true;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emitEvent("error", { error: errorMessage });

      // Add error to conversation
      this.apiConversationHistory.push({
        role: "user",
        content: [
          {
            type: "text",
            text: `Tool "${toolName}" failed: ${errorMessage}`,
          },
        ],
      });
    }
  }

  private parseAssistantMessage(message: string): AssistantMessageContent[] {
    const content: AssistantMessageContent[] = [];
    
    // Simple parsing - in a real implementation, this would be more sophisticated
    const toolUseRegex = /<tool_use>\s*<name>(.*?)<\/name>\s*<input>(.*?)<\/input>\s*<\/tool_use>/gs;
    let lastIndex = 0;
    let match;

    while ((match = toolUseRegex.exec(message)) !== null) {
      // Add text before tool use
      if (match.index > lastIndex) {
        const textContent = message.slice(lastIndex, match.index).trim();
        if (textContent) {
          content.push({
            type: "text",
            content: textContent,
            partial: false,
          });
        }
      }

      // Add tool use
      try {
        const input = JSON.parse(match[2]);
        content.push({
          type: "tool_use",
          name: match[1],
          input,
          partial: false,
        });
      } catch {
        // If JSON parsing fails, treat as text
        content.push({
          type: "text",
          content: match[0],
          partial: false,
        });
      }

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < message.length) {
      const remainingText = message.slice(lastIndex).trim();
      if (remainingText) {
        content.push({
          type: "text",
          content: remainingText,
          partial: true, // Assume partial if it's the last content
        });
      }
    }

    // If no tool uses found, treat entire message as text
    if (content.length === 0 && message.trim()) {
      content.push({
        type: "text",
        content: message,
        partial: true,
      });
    }

    return content;
  }

  private generateSystemPrompt(): string {
    const tools = this.toolRegistry.getAllTools();
    const mcpTools = this.mcpHub?.getServers().flatMap(server => 
      server.tools?.map(tool => `${server.name}/${tool.name}`) || []
    ) || [];

    const allTools = [...tools.map(t => t.name), ...mcpTools];

    let prompt = `You are Cline, an AI assistant that can help with various tasks. You have access to the following tools:

${tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}`;

    if (mcpTools.length > 0) {
      prompt += `\n\nMCP Tools:\n${mcpTools.map(tool => `- ${tool}`).join('\n')}`;
    }

    prompt += `\n\nYou are currently in ${this.config.mode.toUpperCase()} mode.`;

    if (this.config.mode === "plan") {
      prompt += `\n\nIn PLAN mode, focus on:
- Understanding the task requirements
- Breaking down complex tasks into steps
- Asking clarifying questions
- Creating detailed plans
- Use the plan_mode_respond tool to engage in planning discussions`;
    } else {
      prompt += `\n\nIn ACT mode, focus on:
- Executing the planned actions
- Using tools to accomplish tasks
- Making progress toward the goal
- Providing concrete results`;
    }

    prompt += `\n\nAlways use tools when appropriate and call attempt_completion when the task is finished.`;

    return prompt;
  }

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
