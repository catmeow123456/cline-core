const ClineCore = require('./dist/index.js').default;

async function demo() {
  console.log('🚀 Cline Core 演示开始...\n');

  // 创建 Cline Core 实例
  const cline = new ClineCore({
    apiProvider: "anthropic",
    apiKey: process.env.ANTHROPIC_API_KEY || "your-api-key-here",
    model: "claude-3-5-sonnet-20241022",
    mode: "act",
    workingDirectory: process.cwd(),
    // 可选：使用自定义的 Anthropic base URL
    baseUrl: process.env.ANTHROPIC_BASE_URL || undefined,
    autoApproval: {
      enabled: false,
      maxRequests: 5,
      enabledTools: ["read_file", "list_files"],
      riskyCommandsEnabled: false,
    },
  });

  // 添加事件监听器
  cline.addEventListener((event) => {
    console.log(`[${event.type}]`, event.data);
  });

  try {
    console.log('📋 配置信息:');
    console.log('- API Provider:', cline.getConfig().apiProvider);
    console.log('- Mode:', cline.getConfig().mode);
    console.log('- Working Directory:', cline.getConfig().workingDirectory);
    console.log('- Max Tokens:', cline.getConfig().maxTokens);
    console.log('- Temperature:', cline.getConfig().temperature);
    
    console.log('\n✅ Cline Core 初始化成功!');
    console.log('\n📝 使用说明:');
    console.log('1. 设置环境变量 ANTHROPIC_API_KEY');
    console.log('2. 调用 cline.startTask("你的任务") 开始任务');
    console.log('3. 使用 cline.continueTask("继续消息") 继续对话');
    console.log('4. 调用 cline.dispose() 清理资源');
    
    console.log('\n🔧 可用的内置工具:');
    console.log('- read_file: 读取文件内容');
    console.log('- write_to_file: 写入文件');
    console.log('- replace_in_file: 替换文件内容');
    console.log('- list_files: 列出目录文件');
    console.log('- execute_command: 执行命令');
    console.log('- attempt_completion: 完成任务');

  } catch (error) {
    console.error('❌ 演示失败:', error.message);
  } finally {
    // 清理资源
    await cline.dispose();
    console.log('\n🧹 资源已清理');
  }
}

// 运行演示
demo().catch(console.error);
