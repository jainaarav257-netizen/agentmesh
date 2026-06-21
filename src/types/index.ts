export interface AgentTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
  execute: (input: Record<string, unknown>) => Promise<unknown>;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  text: string;
  toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  stopReason: 'end_turn' | 'tool_use' | 'other';
}

export interface LLMProvider {
  chat(params: {
    model: string;
    system: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    tools?: AgentTool[];
    maxTokens?: number;
  }): Promise<LLMResponse>;
  submitToolResults(params: {
    model: string;
    system: string;
    messages: Array<{ role: 'user' | 'assistant'; content: unknown }>;
    toolResults: Array<{ id: string; content: string; isError?: boolean }>;
    tools?: AgentTool[];
    maxTokens?: number;
  }): Promise<LLMResponse>;
}

export interface AgentConfig {
  name: string;
  description: string;
  systemPrompt: string;
  tools?: AgentTool[];
  model?: string;
  maxIterations?: number;
  priority?: boolean;
  triggerKeywords?: string[];
}

export interface AgentResult {
  agent: string;
  text: string;
  toolsUsed: string[];
  iterations: number;
  durationMs: number;
}

export interface PipelineConfig {
  provider: LLMProvider;
  model: string;
  sessionTtlMs?: number;
  onToken?: (token: string) => void;
  debug?: boolean;
}

export interface PipelineResult {
  output: string;
  agentUsed: string;
  routingReason: string;
  toolsUsed: string[];
  sessionId: string;
  durationMs: number;
}

export interface RoutingDecision {
  agent: string;
  confidence: number;
  reason: string;
}
