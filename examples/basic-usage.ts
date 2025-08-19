import { Command } from "commander";
import ClineCore from "../src/index";

async function basicExample() {
  // Initialize Cline Core with Anthropic
  const cline = new ClineCore({
    apiProvider: "anthropic",
    apiKey: process.env.ANTHROPIC_API_KEY || "your-api-key-here",
    model: "claude-3-5-sonnet-20241022",
    mode: "act",
    workingDirectory: process.cwd(),
    // Optional: Use custom Anthropic base URL
    baseUrl: process.env.ANTHROPIC_BASE_URL,
    autoApproval: {
      enabled: false,
      maxRequests: 5,
      enabledTools: ["read_file", "list_files"],
      riskyCommandsEnabled: false,
    },
  });

  // Add event listener to see what's happening
  cline.addEventListener((event) => {
    console.log(`[${event.type}]`, event.data);
  });

  try {
    // Start a simple task
    await cline.startTask("Create a simple 'Hello World' Node.js script called hello.js");

    // The task will run automatically, executing tools as needed
    console.log("Task completed!");
    
    // Get the final messages
    const messages = cline.getMessages();
    console.log("Final conversation:", messages);

  } catch (error) {
    console.error("Task failed:", error);
  } finally {
    // Clean up
    await cline.dispose();
  }
}

async function planModeExample() {
  const cline = new ClineCore({
    apiProvider: "anthropic",
    apiKey: process.env.ANTHROPIC_API_KEY || "your-api-key-here",
    model: "claude-3-5-sonnet-20241022",
    mode: "plan", // Start in plan mode
    workingDirectory: process.cwd(),
  });

  cline.addEventListener((event) => {
    console.log(`[PLAN MODE - ${event.type}]`, event.data);
  });

  try {
    // Start with planning
    await cline.startTask("Build a REST API server with user authentication");

    // Continue the conversation in plan mode
    await cline.continueTask("Make sure to include proper error handling and validation");

    // Switch to act mode to execute the plan
    await cline.switchMode("act");
    await cline.continueTask("Now implement the plan we discussed");

  } catch (error) {
    console.error("Planning failed:", error);
  } finally {
    await cline.dispose();
  }
}

async function mcpExample() {
  // Example with MCP servers
  const cline = new ClineCore({
    apiProvider: "anthropic",
    apiKey: process.env.ANTHROPIC_API_KEY || "your-api-key-here",
    model: "claude-3-5-sonnet-20241022",
    mode: "act",
    workingDirectory: process.cwd(),
    mcpServers: {
      filesystem: {
        type: "stdio",
        command: "npx",
        args: ["@modelcontextprotocol/server-filesystem", process.cwd()],
        disabled: false,
      },
      // Add more MCP servers as needed
    },
  });

  cline.addEventListener((event) => {
    console.log(`[MCP - ${event.type}]`, event.data);
  });

  try {
    await cline.startTask("Use the filesystem MCP server to analyze the project structure");
    
    // Check connected MCP servers
    const mcpServers = cline.getMcpServers();
    console.log("Connected MCP servers:", mcpServers);

  } catch (error) {
    console.error("MCP example failed:", error);
  } finally {
    await cline.dispose();
  }
}

// 命令行参数解析
function parseArguments() {
  const program = new Command();
  
  program
    .name('basic-usage')
    .description('Cline Core 基础使用示例')
    .version('1.0.0')
    .option('-e, --example <type>', '指定要运行的示例类型', 'basic')
    .option('--list', '列出所有可用的示例')
    .helpOption('-h, --help', '显示帮助信息');

  program.parse();
  return program.opts();
}

// 显示可用示例列表
function listExamples() {
  console.log('📋 可用的示例:');
  console.log('  basic     - 基础示例：创建 Hello World 脚本');
  console.log('  plan      - 计划模式示例：构建 REST API 服务器');
  console.log('  mcp       - MCP 集成示例：使用文件系统 MCP 服务器');
  console.log('\n使用方法:');
  console.log('  yarn example:basic');
  console.log('  yarn example:plan');
  console.log('  yarn example:mcp');
}

// 运行指定的示例
async function runExample(exampleType: string) {
  console.log(`🚀 运行 ${exampleType} 示例...\n`);
  
  try {
    switch (exampleType) {
      case 'basic':
        await basicExample();
        console.log('\n✅ 基础示例完成');
        break;
        
      case 'plan':
        await planModeExample();
        console.log('\n✅ 计划模式示例完成');
        break;
        
      case 'mcp':
        await mcpExample();
        console.log('\n✅ MCP 示例完成');
        break;
        
      default:
        console.error(`❌ 未知的示例类型: ${exampleType}`);
        console.log('使用 --list 查看所有可用示例');
        process.exit(1);
    }
  } catch (error) {
    console.error(`❌ 示例执行失败:`, error);
    process.exit(1);
  }
}

// 运行示例
if (require.main === module) {
  const options = parseArguments();
  
  if (options.list) {
    listExamples();
  } else {
    const exampleType = options.example;
    runExample(exampleType);
  }
}
