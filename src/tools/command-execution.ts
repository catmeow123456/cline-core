import { ToolResult, ToolExecutionContext } from "../types";

// Use dynamic import for execa since it's an ES module
const execaImport = async () => {
  const { execa } = await import("execa");
  return execa;
};

export class CommandExecution {
  private workingDirectory: string;
  private autoApproval: boolean;

  constructor(context: ToolExecutionContext) {
    this.workingDirectory = context.workingDirectory;
    this.autoApproval = context.autoApproval.enabled;
  }

  async executeCommand(command: string, timeout: number = 30000): Promise<ToolResult> {
    try {
      console.log(`Executing command: ${command}`);
      console.log(`Working directory: ${this.workingDirectory}`);

      const execa = await execaImport();
      const childProcess = execa(command, {
        shell: true,
        cwd: this.workingDirectory,
        reject: false,
        all: true,
        timeout,
      });

      let output = "";
      let hasOutput = false;

      // Collect output in real-time
      if (childProcess.all) {
        childProcess.all.on("data", (data: any) => {
          const chunk = data.toString();
          output += chunk;
          hasOutput = true;
          
          // Log output in real-time for debugging
          process.stdout.write(chunk);
        });
      }

      const result = await childProcess;
      
      // Handle timeout
      if (result.timedOut) {
        return {
          success: false,
          content: `Command timed out after ${timeout}ms:\n${output}`,
        };
      }

      // Format the result
      const exitCode = result.exitCode || 0;
      const success = exitCode === 0;
      
      let resultContent = `Command executed with exit code ${exitCode}`;
      
      if (hasOutput && output.trim()) {
        resultContent += `\n\nOutput:\n${output.trim()}`;
      } else if (result.stdout) {
        resultContent += `\n\nOutput:\n${result.stdout}`;
      }
      
      if (result.stderr && result.stderr.trim()) {
        resultContent += `\n\nError output:\n${result.stderr.trim()}`;
      }

      return {
        success,
        content: resultContent,
      };
    } catch (error) {
      return {
        success: false,
        content: `Error executing command: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async executeCommandWithInput(command: string, input: string, timeout: number = 30000): Promise<ToolResult> {
    try {
      console.log(`Executing command with input: ${command}`);
      
      const execa = await execaImport();
      const childProcess = execa(command, {
        shell: true,
        cwd: this.workingDirectory,
        reject: false,
        input,
        timeout,
      });

      const result = await childProcess;
      
      const exitCode = result.exitCode || 0;
      const success = exitCode === 0;
      
      let resultContent = `Command executed with exit code ${exitCode}`;
      
      if (result.stdout) {
        resultContent += `\n\nOutput:\n${result.stdout}`;
      }
      
      if (result.stderr && result.stderr.trim()) {
        resultContent += `\n\nError output:\n${result.stderr.trim()}`;
      }

      return {
        success,
        content: resultContent,
      };
    } catch (error) {
      return {
        success: false,
        content: `Error executing command with input: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  isRiskyCommand(command: string): boolean {
    const riskyPatterns = [
      /rm\s+-rf/,
      /sudo\s+rm/,
      /del\s+\/[sq]/i,
      /format\s+[a-z]:/i,
      /shutdown/i,
      /reboot/i,
      /halt/i,
      /poweroff/i,
      /init\s+0/,
      /init\s+6/,
      /systemctl\s+(poweroff|reboot|halt)/,
      /dd\s+if=/,
      /mkfs/,
      /fdisk/,
      /parted/,
      /crontab\s+-r/,
      />\s*\/dev\/(sda|hda)/,
      /chmod\s+777\s+\//,
      /chown\s+.*\s+\//,
    ];

    return riskyPatterns.some(pattern => pattern.test(command));
  }

  sanitizeCommand(command: string): string {
    // Remove potentially dangerous characters and sequences
    return command
      .replace(/[;&|`$(){}[\]]/g, '') // Remove shell metacharacters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }
}
