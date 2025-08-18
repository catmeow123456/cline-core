import * as fs from "fs/promises";
import * as path from "path";
import { ToolResult, ToolExecutionContext } from "../types";

export class FileOperations {
  private workingDirectory: string;

  constructor(context: ToolExecutionContext) {
    this.workingDirectory = context.workingDirectory;
  }

  async readFile(filePath: string): Promise<ToolResult> {
    try {
      const absolutePath = this.resolveFilePath(filePath);
      const content = await fs.readFile(absolutePath, "utf-8");
      
      return {
        success: true,
        content: `File content of ${filePath}:\n\n${content}`,
      };
    } catch (error) {
      return {
        success: false,
        content: `Error reading file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async writeToFile(filePath: string, content: string): Promise<ToolResult> {
    try {
      const absolutePath = this.resolveFilePath(filePath);
      
      // Create directory if it doesn't exist
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      
      await fs.writeFile(absolutePath, content, "utf-8");
      
      return {
        success: true,
        content: `Successfully wrote to file ${filePath}`,
      };
    } catch (error) {
      return {
        success: false,
        content: `Error writing to file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async replaceInFile(filePath: string, searchText: string, replaceText: string): Promise<ToolResult> {
    try {
      const absolutePath = this.resolveFilePath(filePath);
      
      // Read current content
      const currentContent = await fs.readFile(absolutePath, "utf-8");
      
      // Check if search text exists
      if (!currentContent.includes(searchText)) {
        return {
          success: false,
          content: `Search text not found in file ${filePath}`,
        };
      }
      
      // Replace content
      const newContent = currentContent.replace(searchText, replaceText);
      
      // Write back to file
      await fs.writeFile(absolutePath, newContent, "utf-8");
      
      return {
        success: true,
        content: `Successfully replaced text in file ${filePath}`,
      };
    } catch (error) {
      return {
        success: false,
        content: `Error replacing text in file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async listFiles(directoryPath: string = ".", recursive: boolean = false): Promise<ToolResult> {
    try {
      const absolutePath = this.resolveFilePath(directoryPath);
      const files = await this.getFileList(absolutePath, recursive);
      
      return {
        success: true,
        content: `Files in ${directoryPath}:\n${files.join("\n")}`,
      };
    } catch (error) {
      return {
        success: false,
        content: `Error listing files in ${directoryPath}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      const absolutePath = this.resolveFilePath(filePath);
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  private resolveFilePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.resolve(this.workingDirectory, filePath);
  }

  private async getFileList(directoryPath: string, recursive: boolean): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(directoryPath, entry.name);
      const relativePath = path.relative(this.workingDirectory, fullPath);
      
      if (entry.isDirectory()) {
        if (recursive) {
          const subFiles = await this.getFileList(fullPath, recursive);
          files.push(...subFiles);
        } else {
          files.push(`${relativePath}/`);
        }
      } else {
        files.push(relativePath);
      }
    }
    
    return files.sort();
  }
}
