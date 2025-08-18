import { Anthropic } from "@anthropic-ai/sdk";
import { ApiHandler, ApiStream, ApiStreamChunk, ModelInfo, AnthropicConfig, ApiError, ContextWindowExceededError, RateLimitError } from "../types";

export class AnthropicHandler implements ApiHandler {
  private client: Anthropic;
  private config: AnthropicConfig;
  private modelInfo: ModelInfo;

  constructor(config: AnthropicConfig) {
    this.config = config;
    
    // Create Anthropic client with optional baseURL
    const clientOptions: any = {
      apiKey: config.anthropicApiKey,
    };
    
    if (config.baseUrl) {
      clientOptions.baseURL = config.baseUrl;
    }
    
    this.client = new Anthropic(clientOptions);

    // Set model info based on the model
    this.modelInfo = this.getModelInfo(config.model);
  }

  getModel(): ModelInfo {
    return this.modelInfo;
  }

  private getModelInfo(modelId: string): ModelInfo {
    const modelMap: Record<string, ModelInfo> = {
      "claude-3-5-sonnet-20241022": {
        id: "claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet",
        maxTokens: 200000,
        supportsImages: true,
        inputPrice: 3.0,
        outputPrice: 15.0,
      },
      "claude-3-5-haiku-20241022": {
        id: "claude-3-5-haiku-20241022",
        name: "Claude 3.5 Haiku",
        maxTokens: 200000,
        supportsImages: true,
        inputPrice: 0.8,
        outputPrice: 4.0,
      },
      "claude-3-opus-20240229": {
        id: "claude-3-opus-20240229",
        name: "Claude 3 Opus",
        maxTokens: 200000,
        supportsImages: true,
        inputPrice: 15.0,
        outputPrice: 75.0,
      },
    };

    return modelMap[modelId] || {
      id: modelId,
      name: modelId,
      maxTokens: 200000,
      supportsImages: true,
      inputPrice: 3.0,
      outputPrice: 15.0,
    };
  }

  async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
    try {
      const stream = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens || 8192,
        temperature: this.config.temperature || 0,
        system: systemPrompt,
        messages: messages,
        stream: true,
      });

      let inputTokens = 0;
      let outputTokens = 0;
      let cacheWriteTokens = 0;
      let cacheReadTokens = 0;

      for await (const chunk of stream) {
        switch (chunk.type) {
          case "message_start":
            inputTokens = chunk.message.usage.input_tokens;
            break;

          case "content_block_delta":
            if (chunk.delta.type === "text_delta") {
              yield {
                type: "text",
                text: chunk.delta.text,
              };
            }
            break;

          case "message_delta":
            if (chunk.usage) {
              outputTokens = chunk.usage.output_tokens;
            }
            break;

          case "message_stop":
            // Calculate cost
            const totalCost = this.calculateCost(inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens);
            
            yield {
              type: "usage",
              inputTokens,
              outputTokens,
              cacheWriteTokens,
              cacheReadTokens,
              totalCost,
            };
            break;
        }
      }
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private calculateCost(inputTokens: number, outputTokens: number, cacheWriteTokens: number, cacheReadTokens: number): number {
    const inputCost = (inputTokens / 1000000) * this.modelInfo.inputPrice!;
    const outputCost = (outputTokens / 1000000) * this.modelInfo.outputPrice!;
    const cacheWriteCost = (cacheWriteTokens / 1000000) * this.modelInfo.inputPrice!;
    const cacheReadCost = (cacheReadTokens / 1000000) * (this.modelInfo.inputPrice! * 0.1); // Cache reads are typically 10% of input price
    
    return inputCost + outputCost + cacheWriteCost + cacheReadCost;
  }

  private handleError(error: any): Error {
    if (error instanceof Anthropic.APIError) {
      const message = error.message || "Unknown API error";
      
      if (error.status === 400 && message.includes("maximum context length")) {
        return new ContextWindowExceededError("anthropic", this.config.model);
      }
      
      if (error.status === 429) {
        const retryAfter = error.headers?.["retry-after"];
        return new RateLimitError("anthropic", retryAfter ? parseInt(retryAfter) : undefined);
      }
      
      return new ApiError(message, error.status, "anthropic", this.config.model);
    }
    
    return new ApiError(
      error.message || "Unknown error occurred",
      undefined,
      "anthropic",
      this.config.model
    );
  }
}
