import { FileOperations } from "./file-operations";
import { CommandExecution } from "./command-execution";
import { ToolResult, ToolExecutionContext } from "../types";

export interface Tool {
  name: string;
  description: string;
  execute(args: any, context: ToolExecutionContext): Promise<ToolResult>;
}

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private fileOps: FileOperations;
  private commandExec: CommandExecution;

  constructor(context: ToolExecutionContext) {
    this.fileOps = new FileOperations(context);
    this.commandExec = new CommandExecution(context);
    this.registerBuiltinTools();
  }

  private registerBuiltinTools(): void {
    // File operation tools
    this.registerTool({
      name: "read_file",
      description: "Read the contents of a file",
      execute: async (args: { path: string }) => {
        return this.fileOps.readFile(args.path);
      },
    });

    this.registerTool({
      name: "write_to_file",
      description: "Write content to a file, creating it if it doesn't exist",
      execute: async (args: { path: string; content: string }) => {
        return this.fileOps.writeToFile(args.path, args.content);
      },
    });

    this.registerTool({
      name: "replace_in_file",
      description: "Replace text in a file",
      execute: async (args: { path: string; old_str: string; new_str: string }) => {
        return this.fileOps.replaceInFile(args.path, args.old_str, args.new_str);
      },
    });

    this.registerTool({
      name: "list_files",
      description: "List files and directories",
      execute: async (args: { path?: string; recursive?: boolean }) => {
        return this.fileOps.listFiles(args.path || ".", args.recursive || false);
      },
    });

    // Command execution tools
    this.registerTool({
      name: "execute_command",
      description: "Execute a shell command",
      execute: async (args: { command: string; timeout?: number }) => {
        return this.commandExec.executeCommand(args.command, args.timeout);
      },
    });

    // Completion tool
    this.registerTool({
      name: "attempt_completion",
      description: "Indicate that the task has been completed",
      execute: async (args: { result: string; command?: string }) => {
        return {
          success: true,
          content: `Task completed: ${args.result}${args.command ? `\n\nSuggested command: ${args.command}` : ""}`,
        };
      },
    });
  }

  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  async executeTool(name: string, args: any, context: ToolExecutionContext): Promise<ToolResult> {
    const tool = this.getTool(name);
    if (!tool) {
      return {
        success: false,
        content: `Unknown tool: ${name}`,
      };
    }

    try {
      return await tool.execute(args, context);
    } catch (error) {
      return {
        success: false,
        content: `Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

export * from "./file-operations";
export * from "./command-execution";
