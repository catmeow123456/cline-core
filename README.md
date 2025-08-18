# Cline Core

A minimal, experimental implementation of Cline's core architecture extracted as a standalone library. This project provides the essential functionality for LLM tool orchestration, MCP server integration, plan & act modes, and context management.

## Features

- **LLM Tool Orchestration**: Execute various tools (file operations, command execution) through LLM decision-making
- **MCP Server Integration**: Connect to Model Context Protocol servers for extended capabilities
- **Plan & Act Modes**: Switch between planning and execution modes
- **Context Management**: Intelligent conversation history truncation to manage context windows
- **Multiple API Providers**: Support for Anthropic Claude (with extensible architecture for others)
- **Event-Driven Architecture**: Real-time updates through event callbacks
- **TypeScript**: Full type safety and excellent developer experience

## Installation

```bash
npm install cline-core
```

## Quick Start

```typescript
import ClineCore from 'cline-core';

const cline = new ClineCore({
  apiProvider: "anthropic",
  apiKey: "your-anthropic-api-key",
  model: "claude-3-5-sonnet-20241022",
  mode: "act",
  workingDirectory: process.cwd(),
  // Optional: Use custom Anthropic base URL
  baseUrl: "https://your-custom-anthropic-endpoint.com",
});

// Listen to events
cline.addEventListener((event) => {
  console.log(`[${event.type}]`, event.data);
});

// Start a task
await cline.startTask("Create a simple Node.js hello world script");

// Continue the conversation
await cline.continueTask("Now add error handling to the script");

// Clean up
await cline.dispose();
```

## Core Concepts

### Modes

Cline Core supports two operational modes:

- **Plan Mode**: Focus on understanding requirements, breaking down tasks, and creating detailed plans
- **Act Mode**: Execute planned actions using available tools

```typescript
// Start in plan mode
const cline = new ClineCore({
  // ... config
  mode: "plan"
});

// Switch to act mode when ready to execute
await cline.switchMode("act");
```

### Tools

Built-in tools include:

- `read_file`: Read file contents
- `write_to_file`: Create or overwrite files
- `replace_in_file`: Replace text in existing files
- `list_files`: List directory contents
- `execute_command`: Run shell commands
- `attempt_completion`: Mark task as complete

### MCP Integration

Connect to Model Context Protocol servers for extended capabilities:

```typescript
const cline = new ClineCore({
  // ... other config
  mcpServers: {
    filesystem: {
      type: "stdio",
      command: "npx",
      args: ["@modelcontextprotocol/server-filesystem", process.cwd()],
    },
    github: {
      type: "stdio", 
      command: "npx",
      args: ["@modelcontextprotocol/server-github"],
      env: {
        GITHUB_PERSONAL_ACCESS_TOKEN: "your-token"
      }
    }
  }
});
```

### Context Management

Automatic context window management prevents token limit errors:

- Intelligent conversation truncation
- Preservation of important context
- Model-aware sizing
- Proactive management

## Configuration

```typescript
interface ClineConfig {
  // API Configuration
  apiProvider: "anthropic" | "openai" | "openrouter" | "ollama" | "gemini";
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;

  // Operation Mode
  mode: "plan" | "act";

  // Working Directory
  workingDirectory?: string;

  // Auto-approval Settings
  autoApproval?: {
    enabled: boolean;
    maxRequests: number;
    enabledTools: string[];
    riskyCommandsEnabled: boolean;
  };

  // MCP Servers
  mcpServers?: Record<string, McpServerConfig>;
}
```

## Events

Listen to real-time events:

```typescript
cline.addEventListener((event) => {
  switch (event.type) {
    case "task_started":
      console.log("Task started:", event.data);
      break;
    case "tool_executed":
      console.log("Tool executed:", event.data);
      break;
    case "task_completed":
      console.log("Task completed:", event.data);
      break;
    case "error":
      console.error("Error:", event.data);
      break;
  }
});
```

## Examples

See the `examples/` directory for complete usage examples:

- `basic-usage.ts`: Simple task execution
- Plan mode workflow
- MCP server integration

## Architecture

The core architecture consists of:

- **ClineCore**: Main orchestrator class
- **Task**: Individual task execution engine
- **ApiHandler**: LLM API abstraction
- **ToolRegistry**: Tool management and execution
- **ContextManager**: Context window management
- **McpHub**: MCP server connection management

## API Providers

Currently supported:

- ✅ **Anthropic**: Claude models with streaming support
- 🚧 **OpenAI**: Planned
- 🚧 **OpenRouter**: Planned  
- 🚧 **Ollama**: Planned
- 🚧 **Gemini**: Planned

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run examples
npm run example

# Run tests
npm test
```

## Limitations

This is an experimental extraction of Cline's core functionality. Some limitations:

- Only Anthropic API provider is currently implemented
- Simplified message parsing (compared to full Cline)
- No persistent storage (tasks are in-memory only)
- Limited error recovery mechanisms
- No browser automation tools
- No checkpoint/git integration

## Contributing

This is an experimental project. Contributions are welcome, especially:

- Additional API provider implementations
- Enhanced tool implementations
- Better error handling
- Performance optimizations
- Documentation improvements

## License

MIT License - see LICENSE file for details.

## Relationship to Cline

This project extracts and simplifies the core architecture from [Cline](https://github.com/cline/cline), the popular VSCode extension. It's designed as a standalone library for building LLM-powered automation tools.

Key differences from full Cline:
- No VSCode integration
- Simplified UI/event system
- Focus on core functionality only
- Library-first design
