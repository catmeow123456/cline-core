import { ApiHandler, ApiConfiguration } from "./types";
import { AnthropicHandler } from "./providers/anthropic";
import { ClineError } from "../types";

export * from "./types";

export function buildApiHandler(config: ApiConfiguration): ApiHandler {
  switch (config.apiProvider) {
    case "anthropic":
      if (!config.anthropicApiKey) {
        throw new ClineError("Anthropic API key is required", "MISSING_API_KEY");
      }
      return new AnthropicHandler({
        ...config,
        anthropicApiKey: config.anthropicApiKey,
        model: config.model || "claude-3-5-sonnet-20241022",
      });

    case "openai":
      // TODO: Implement OpenAI handler
      throw new ClineError("OpenAI provider not yet implemented", "PROVIDER_NOT_IMPLEMENTED");

    case "openrouter":
      // TODO: Implement OpenRouter handler
      throw new ClineError("OpenRouter provider not yet implemented", "PROVIDER_NOT_IMPLEMENTED");

    case "ollama":
      // TODO: Implement Ollama handler
      throw new ClineError("Ollama provider not yet implemented", "PROVIDER_NOT_IMPLEMENTED");

    case "gemini":
      // TODO: Implement Gemini handler
      throw new ClineError("Gemini provider not yet implemented", "PROVIDER_NOT_IMPLEMENTED");

    default:
      throw new ClineError(`Unsupported API provider: ${config.apiProvider}`, "UNSUPPORTED_PROVIDER");
  }
}

// Utility function to get context window info
export function getContextWindowInfo(handler: ApiHandler): { contextWindow: number; maxAllowedSize: number } {
  const model = handler.getModel();
  const contextWindow = model.maxTokens;
  // Reserve 20% of context window for response and safety buffer
  const maxAllowedSize = Math.floor(contextWindow * 0.8);
  
  return { contextWindow, maxAllowedSize };
}

// Utility function to check if error is context window exceeded
export function isContextWindowExceededError(error: any): boolean {
  return error?.name === "ContextWindowExceededError" || 
         (error?.message && error.message.includes("maximum context length")) ||
         (error?.message && error.message.includes("context window"));
}

// Utility function to check if error is rate limit
export function isRateLimitError(error: any): boolean {
  return error?.name === "RateLimitError" || 
         error?.statusCode === 429 ||
         (error?.message && error.message.includes("rate limit"));
}
