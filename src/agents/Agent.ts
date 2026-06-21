import Anthropic from '@anthropic-ai/sdk';
import type { AgentConfig, AgentResult, AgentTool, Message } from '../types/index.js';

export class Agent {
  readonly name: string;
  readonly description: string;
  readonly priority: boolean;
  readonly triggerKeywords: string[];
  private readonly config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.name = config.name;
    this.description = config.description;
    this.priority = config.priority ?? false;
    this.triggerKeywords = config.triggerKeywords ?? [];
  }

  triggeredBy(input: string): boolean {
    if (this.triggerKeywords.length === 0) return false;
    const lower = input.toLowerCase();
    return this.triggerKeywords.some(kw => lower.includes(kw.toLowerCase()));
  }

  async run(
    userMessage: string,
    history: Message[],
    client: Anthropic,
    model: string,
    onToken?: (t: string) => void,
    debug = false,
  ): Promise<AgentResult> {
    const start = Date.now();
    const toolsUsed: string[] = [];
    let iterations = 0;
    const maxIterations = this.config.maxIterations ?? 5;

    const anthropicTools: Anthropic.Tool[] = (this.config.tools ?? []).map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));

    const messages: Anthropic.MessageParam[] = [
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: userMessage },
    ];

    let finalText = '';

    while (iterations < maxIterations) {
      iterations++;

      const response = await client.messages.create({
        model: this.config.model ?? model,
        max_tokens: 2048,
        system: this.config.systemPrompt,
        tools: anthropicTools.length > 0 ? anthropicTools : undefined,
        messages,
      });

      if (debug) console.log(`[agentmesh] ${this.name} iteration ${iterations}:`, response.stop_reason);

      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[];
      const textBlock = response.content.find(b => b.type === 'text') as Anthropic.TextBlock | undefined;

      if (textBlock?.text) finalText = textBlock.text;

      if (response.stop_reason === 'end_turn' || toolUseBlocks.length === 0) break;

      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        const tool = this.config.tools?.find(t => t.name === block.name);
        if (!tool) continue;
        toolsUsed.push(block.name);
        try {
          const result = await tool.execute(block.input as Record<string, unknown>);
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
        } catch (err) {
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: `Error: ${String(err)}`, is_error: true });
        }
      }

      messages.push({ role: 'user', content: toolResults });
    }

    if (onToken && finalText) onToken(finalText);

    return { agent: this.name, text: finalText, toolsUsed, iterations, durationMs: Date.now() - start };
  }
}
