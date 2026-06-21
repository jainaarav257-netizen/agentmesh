import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, LLMResponse, AgentTool } from '../types/index.js';

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async chat({ model, system, messages, tools, maxTokens = 2048 }: Parameters<LLMProvider['chat']>[0]): Promise<LLMResponse> {
    const response = await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      tools: tools?.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
      messages,
    });

    return this.parse(response);
  }

  async submitToolResults({ model, system, messages, toolResults, tools, maxTokens = 2048 }: Parameters<LLMProvider['submitToolResults']>[0]): Promise<LLMResponse> {
    const toolResultContent = toolResults.map(r => ({
      type: 'tool_result' as const,
      tool_use_id: r.id,
      content: r.content,
      ...(r.isError ? { is_error: true } : {}),
    }));

    const response = await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      tools: tools?.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
      messages: [...messages as Anthropic.MessageParam[], { role: 'user', content: toolResultContent }],
    });

    return this.parse(response);
  }

  private parse(response: Anthropic.Message): LLMResponse {
    const text = (response.content.find(b => b.type === 'text') as Anthropic.TextBlock | undefined)?.text ?? '';
    const toolCalls = (response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[]).map(b => ({
      id: b.id,
      name: b.name,
      input: b.input as Record<string, unknown>,
    }));
    const stopReason = response.stop_reason === 'tool_use' ? 'tool_use' : response.stop_reason === 'end_turn' ? 'end_turn' : 'other';
    return { text, toolCalls, stopReason };
  }
}
