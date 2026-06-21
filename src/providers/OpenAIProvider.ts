import type { LLMProvider, LLMResponse, AgentTool } from '../types/index.js';

interface OpenAIClient {
  chat: {
    completions: {
      create(params: unknown): Promise<unknown>;
    };
  };
}

export class OpenAIProvider implements LLMProvider {
  private client: OpenAIClient;

  constructor(apiKeyOrClient: string | OpenAIClient) {
    if (typeof apiKeyOrClient === 'string') {
      // Lazy-load openai so it stays a peer dep
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { OpenAI } = require('openai');
      this.client = new OpenAI({ apiKey: apiKeyOrClient });
    } else {
      this.client = apiKeyOrClient;
    }
  }

  async chat({ model, system, messages, tools, maxTokens = 2048 }: Parameters<LLMProvider['chat']>[0]): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      tools: tools?.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      })),
      messages: [
        { role: 'system', content: system },
        ...messages,
      ],
    }) as { choices: Array<{ message: { content: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> }; finish_reason: string }> };

    return this.parse(response);
  }

  async submitToolResults({ model, system, messages, toolResults, tools, maxTokens = 2048 }: Parameters<LLMProvider['submitToolResults']>[0]): Promise<LLMResponse> {
    const toolResultMessages = toolResults.map(r => ({
      role: 'tool' as const,
      tool_call_id: r.id,
      content: r.content,
    }));

    const response = await this.client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      tools: tools?.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      })),
      messages: [
        { role: 'system', content: system },
        ...messages as Array<{ role: string; content: string }>,
        ...toolResultMessages,
      ],
    }) as { choices: Array<{ message: { content: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> }; finish_reason: string }> };

    return this.parse(response);
  }

  private parse(response: { choices: Array<{ message: { content: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> }; finish_reason: string }> }): LLMResponse {
    const msg = response.choices[0].message;
    const text = msg.content ?? '';
    const toolCalls = (msg.tool_calls ?? []).map(tc => ({
      id: tc.id,
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }));
    const stopReason = response.choices[0].finish_reason === 'tool_calls' ? 'tool_use' : response.choices[0].finish_reason === 'stop' ? 'end_turn' : 'other';
    return { text, toolCalls, stopReason };
  }
}
