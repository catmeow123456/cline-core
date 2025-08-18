import { Anthropic } from "@anthropic-ai/sdk";
import { ApiHandler } from "../api";
import { ContextWindowInfo, ContextUpdate } from "../types";
import cloneDeep from "clone-deep";

export class ContextManager {
  private contextHistoryUpdates: Map<number, [number, Map<number, ContextUpdate[]>]> = new Map();

  /**
   * Get context window information for the given API handler
   */
  getContextWindowInfo(handler: ApiHandler): ContextWindowInfo {
    const model = handler.getModel();
    const contextWindow = model.maxTokens;
    // Reserve 20% of context window for response and safety buffer
    const maxAllowedSize = Math.floor(contextWindow * 0.8);
    
    return { contextWindow, maxAllowedSize };
  }

  /**
   * Determine whether we should compact context window based on token usage
   */
  shouldCompactContextWindow(
    messages: Anthropic.Messages.MessageParam[],
    handler: ApiHandler,
    estimatedTokens: number
  ): boolean {
    const { maxAllowedSize } = this.getContextWindowInfo(handler);
    return estimatedTokens >= maxAllowedSize;
  }

  /**
   * Get truncation range for conversation history
   */
  getNextTruncationRange(
    apiMessages: Anthropic.Messages.MessageParam[],
    currentDeletedRange: [number, number] | undefined,
    keep: "none" | "lastTwo" | "half" | "quarter"
  ): [number, number] {
    // Always keep the first user-assistant pairing
    const rangeStartIndex = 2;
    const startOfRest = currentDeletedRange ? currentDeletedRange[1] + 1 : 2;

    let messagesToRemove: number;
    if (keep === "none") {
      messagesToRemove = Math.max(apiMessages.length - startOfRest, 0);
    } else if (keep === "lastTwo") {
      messagesToRemove = Math.max(apiMessages.length - startOfRest - 2, 0);
    } else if (keep === "half") {
      messagesToRemove = Math.floor((apiMessages.length - startOfRest) / 4) * 2;
    } else {
      // quarter
      messagesToRemove = Math.floor(((apiMessages.length - startOfRest) * 3) / 4 / 2) * 2;
    }

    let rangeEndIndex = startOfRest + messagesToRemove - 1;

    // Ensure the last message being removed is an assistant message
    if (apiMessages[rangeEndIndex]?.role !== "assistant") {
      rangeEndIndex -= 1;
    }

    return [rangeStartIndex, rangeEndIndex];
  }

  /**
   * Get truncated messages with deleted range applied
   */
  getTruncatedMessages(
    messages: Anthropic.Messages.MessageParam[],
    deletedRange: [number, number] | undefined
  ): Anthropic.Messages.MessageParam[] {
    if (messages.length <= 1 || !deletedRange) {
      return messages;
    }

    const firstChunk = messages.slice(0, 2); // First user-assistant pair
    const secondChunk = messages.slice(deletedRange[1] + 1); // Remaining messages
    
    return [...firstChunk, ...secondChunk];
  }

  /**
   * Apply context history updates to messages
   */
  private applyContextHistoryUpdates(
    messages: Anthropic.Messages.MessageParam[],
    startFromIndex: number
  ): Anthropic.Messages.MessageParam[] {
    const firstChunk = messages.slice(0, 2);
    const secondChunk = messages.slice(startFromIndex);
    const messagesToUpdate = [...firstChunk, ...secondChunk];

    const originalIndices = [
      ...Array(2).keys(),
      ...Array(secondChunk.length)
        .fill(0)
        .map((_, i) => i + startFromIndex),
    ];

    for (let arrayIndex = 0; arrayIndex < messagesToUpdate.length; arrayIndex++) {
      const messageIndex = originalIndices[arrayIndex];
      const innerTuple = this.contextHistoryUpdates.get(messageIndex);
      
      if (!innerTuple) {
        continue;
      }

      // Deep copy to avoid modifying original
      messagesToUpdate[arrayIndex] = cloneDeep(messagesToUpdate[arrayIndex]);

      const innerMap = innerTuple[1];
      for (const [blockIndex, changes] of innerMap) {
        const latestChange = changes[changes.length - 1];

        if (latestChange.updateType === "text") {
          const message = messagesToUpdate[arrayIndex];
          if (Array.isArray(message.content)) {
            const block = message.content[blockIndex];
            if (block && block.type === "text") {
              block.text = latestChange.content[0];
            }
          }
        }
      }
    }

    return messagesToUpdate;
  }

  /**
   * Add context truncation notice to the first assistant message
   */
  addTruncationNotice(timestamp: number): void {
    if (!this.contextHistoryUpdates.has(1)) {
      const innerMap = new Map<number, ContextUpdate[]>();
      innerMap.set(0, [{
        timestamp,
        updateType: "text",
        content: ["[NOTE] Some previous conversation history has been removed to manage context length."],
        metadata: []
      }]);
      this.contextHistoryUpdates.set(1, [0, innerMap]);
    }
  }

  /**
   * Estimate token count for messages (rough approximation)
   */
  estimateTokenCount(messages: Anthropic.Messages.MessageParam[]): number {
    let totalTokens = 0;
    
    for (const message of messages) {
      if (typeof message.content === "string") {
        totalTokens += Math.ceil(message.content.length / 4); // Rough approximation: 4 chars per token
      } else if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === "text") {
            totalTokens += Math.ceil(block.text.length / 4);
          } else if (block.type === "image") {
            totalTokens += 1000; // Rough estimate for image tokens
          }
        }
      }
    }
    
    return totalTokens;
  }

  /**
   * Clear context history updates
   */
  clearContextHistory(): void {
    this.contextHistoryUpdates.clear();
  }

  /**
   * Get context management metadata for API requests
   */
  getContextMetadata(
    apiMessages: Anthropic.Messages.MessageParam[],
    handler: ApiHandler,
    deletedRange: [number, number] | undefined
  ): {
    truncatedMessages: Anthropic.Messages.MessageParam[];
    estimatedTokens: number;
    contextWindowInfo: ContextWindowInfo;
    shouldTruncate: boolean;
  } {
    const contextWindowInfo = this.getContextWindowInfo(handler);
    const truncatedMessages = this.getTruncatedMessages(apiMessages, deletedRange);
    const estimatedTokens = this.estimateTokenCount(truncatedMessages);
    const shouldTruncate = this.shouldCompactContextWindow(truncatedMessages, handler, estimatedTokens);

    return {
      truncatedMessages,
      estimatedTokens,
      contextWindowInfo,
      shouldTruncate,
    };
  }
}
