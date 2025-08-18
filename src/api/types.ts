import { Anthropic } from "@anthropic-ai/sdk";

// API Stream types
export interface ApiStreamChunk {
  type: "text" | "usage" | "reasoning";
  text?: string;
  reasoning?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
  totalCost?: number;
}

export type ApiStream = AsyncIterable<ApiStreamChunk>;

// API Handler interface
export interface ApiHandler {
  getModel(): ModelInfo;
  createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream;
  getApiStreamUsage?(): Promise<ApiStreamUsage | undefined>;
}

export interface ModelInfo {
  id: string;
  name: string;
  maxTokens: number;
  supportsImages: boolean;
  inputPrice?: number;
  outputPrice?: number;
}

export interface ApiStreamUsage {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
  totalCost?: number;
}

// API Configuration
export interface ApiConfiguration {
  apiProvider: string;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  baseUrl?: string;
  // Provider-specific configurations
  anthropicApiKey?: string;
  openaiApiKey?: string;
  openrouterApiKey?: string;
  ollamaBaseUrl?: string;
  geminiApiKey?: string;
}

// Provider-specific types
export interface AnthropicConfig extends ApiConfiguration {
  anthropicApiKey: string;
  model: string;
}

export interface OpenAIConfig extends ApiConfiguration {
  openaiApiKey: string;
  model: string;
}

export interface OpenRouterConfig extends ApiConfiguration {
  openrouterApiKey: string;
  model: string;
}

export interface OllamaConfig extends ApiConfiguration {
  ollamaBaseUrl: string;
  model: string;
}

export interface GeminiConfig extends ApiConfiguration {
  geminiApiKey: string;
  model: string;
}

// Error types
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public provider?: string,
    public model?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ContextWindowExceededError extends ApiError {
  constructor(provider: string, model: string) {
    super(`Context window exceeded for ${provider}/${model}`, 400, provider, model);
    this.name = "ContextWindowExceededError";
  }
}

export class RateLimitError extends ApiError {
  constructor(provider: string, retryAfter?: number) {
    super(`Rate limit exceeded for ${provider}${retryAfter ? `, retry after ${retryAfter}s` : ""}`, 429, provider);
    this.name = "RateLimitError";
  }
}
