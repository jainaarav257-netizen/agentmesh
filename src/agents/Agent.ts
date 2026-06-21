import type { AgentConfig, AgentResult, LLMProvider, Message } from '../types/index.js';

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
    provider: LLMProvider,
    model: string,
    onToken?: (t: string) => void,
    debug = false,
  ): Promise<AgentResult> {
    const start = Date.now();
    const toolsUsed: string[] = [];
    let iterations = 0;
    const maxIterations = this.config.maxIterations ?? 5;
    const agentModel = this.config.model ?? model;
    const tools = this.config.tools ?? [];

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage },
    ];

    let finalText = '';
    // Track full message history for multi-turn tool use
    let fullMessages: Array<{ role: 'user' | 'assistant'; content: unknown }> = [...messages];

    while (iterations < maxIterations) {
      iterations++;

      const response = await provider.chat({
        model: agentModel,
        system: this.config.systemPrompt,
        messages: messages,
        tools: tools.length > 0 ? tools : undefined,
      });

      if (debug) console.log(`[agentmesh] ${this.name} iteration ${iterations}: stop=${response.stopReason}, tools=${response.toolCalls.length}`);

      if (response.text) finalText = response.text;

      if (response.stopReason === 'end_turn' || response.toolCalls.length === 0) break;

      // Execute tools
      const toolResults: Array<{ id: string; content: string; isError?: boolean }> = [];
      for (const call of response.toolCalls) {
        const tool = tools.find(t => t.name === call.name);
        if (!tool) {
          toolResults.push({ id: call.id, content: `Unknown tool: ${call.name}`, isError: true });
          continue;
        }
        toolsUsed.push(call.name);
        try {
          const result = await tool.execute(call.input);
          toolResults.push({ id: call.id, content: JSON.stringify(result) });
        } catch (err) {
          toolResults.push({ id: call.id, content: `Error: ${String(err)}`, isError: true });
        }
      }

      // Submit results back
      const next = await provider.submitToolResults({
        model: agentModel,
        system: this.config.systemPrompt,
        messages: fullMessages,
        toolResults,
        tools: tools.length > 0 ? tools : undefined,
      });

      if (next.text) finalText = next.text;
      if (next.stopReason === 'end_turn') break;

      // Add assistant + tool results to history for next iteration
      fullMessages = [...fullMessages, { role: 'assistant', content: response.text }];
    }

    if (onToken && finalText) onToken(finalText);

    return { agent: this.name, text: finalText, toolsUsed, iterations, durationMs: Date.now() - start };
  }
}
