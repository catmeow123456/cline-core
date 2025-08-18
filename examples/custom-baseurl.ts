import ClineCore from "../src/index";

/**
 * 演示如何使用自定义的 Anthropic base URL
 * 这对于使用代理、自托管服务或其他兼容 Anthropic API 的服务很有用
 */
async function customBaseUrlExample() {
  console.log("🌐 自定义 Base URL 示例\n");

  // 方式 1: 通过环境变量设置
  const clineWithEnv = new ClineCore({
    apiProvider: "anthropic",
    apiKey: process.env.ANTHROPIC_API_KEY || "your-api-key-here",
    model: "claude-3-5-sonnet-20241022",
    mode: "act",
    workingDirectory: process.cwd(),
    // 从环境变量读取自定义 base URL
    baseUrl: process.env.ANTHROPIC_BASE_URL,
  });

  // 方式 2: 直接在配置中指定
  const clineWithCustomUrl = new ClineCore({
    apiProvider: "anthropic",
    apiKey: process.env.ANTHROPIC_API_KEY || "your-api-key-here",
    model: "claude-3-5-sonnet-20241022",
    mode: "act",
    workingDirectory: process.cwd(),
    // 直接指定自定义 base URL
    baseUrl: "https://your-custom-anthropic-proxy.com/v1",
  });

  // 方式 3: 使用默认 Anthropic API（不设置 baseUrl）
  const clineDefault = new ClineCore({
    apiProvider: "anthropic",
    apiKey: process.env.ANTHROPIC_API_KEY || "your-api-key-here",
    model: "claude-3-5-sonnet-20241022",
    mode: "act",
    workingDirectory: process.cwd(),
    // baseUrl 未设置，将使用默认的 Anthropic API
  });

  console.log("✅ 配置示例:");
  console.log("1. 环境变量方式: ANTHROPIC_BASE_URL");
  console.log("2. 直接配置方式: baseUrl 参数");
  console.log("3. 默认方式: 不设置 baseUrl");

  console.log("\n📝 使用场景:");
  console.log("- 企业代理服务器");
  console.log("- 自托管的 Anthropic 兼容服务");
  console.log("- 开发/测试环境的模拟服务");
  console.log("- 地区特定的 API 端点");

  console.log("\n🔧 环境变量设置示例:");
  console.log("export ANTHROPIC_API_KEY='your-api-key'");
  console.log("export ANTHROPIC_BASE_URL='https://your-proxy.com/v1'");

  console.log("\n⚠️  注意事项:");
  console.log("- 确保自定义端点兼容 Anthropic API");
  console.log("- 验证 SSL 证书和安全性");
  console.log("- 测试所有必需的 API 端点");
  console.log("- 检查速率限制和配额");

  // 清理资源
  await clineWithEnv.dispose();
  await clineWithCustomUrl.dispose();
  await clineDefault.dispose();

  console.log("\n✨ 自定义 Base URL 功能已就绪!");
}

/**
 * 实际使用自定义 base URL 的示例
 * 注意：这需要有效的 API 密钥和可访问的端点
 */
async function practicalExample() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("⚠️  跳过实际示例：未设置 ANTHROPIC_API_KEY");
    return;
  }

  console.log("\n🚀 实际使用示例\n");

  const cline = new ClineCore({
    apiProvider: "anthropic",
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: "claude-3-5-sonnet-20241022",
    mode: "act",
    workingDirectory: process.cwd(),
    baseUrl: process.env.ANTHROPIC_BASE_URL, // 如果设置了就使用自定义 URL
  });

  cline.addEventListener((event) => {
    console.log(`[${event.type}]`, event.data);
  });

  try {
    console.log("📋 当前配置:");
    const config = cline.getConfig();
    console.log("- API Provider:", config.apiProvider);
    console.log("- Model:", config.model);
    console.log("- Base URL:", config.baseUrl || "默认 Anthropic API");

    // 执行一个简单的任务来测试连接
    await cline.startTask("请简单介绍一下你自己，并确认 API 连接正常工作。");

    console.log("\n✅ API 连接测试成功!");

  } catch (error) {
    console.error("❌ API 连接测试失败:", error.message);
    
    if (error.message.includes("baseURL")) {
      console.log("\n💡 提示: 检查自定义 base URL 是否正确");
    }
  } finally {
    await cline.dispose();
  }
}

// 运行示例
if (require.main === module) {
  customBaseUrlExample()
    .then(() => practicalExample())
    .catch(console.error);
}

export { customBaseUrlExample, practicalExample };
