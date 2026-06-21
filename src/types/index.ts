export interface AgentTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
  execute: (input: Record<string, unknown>) => Promise<unknown>;
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

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentResult {
  agent: string;
  text: string;
  toolsUsed: string[];
  iterations: number;
  durationMs: number;
}

export interface PipelineResult {
  output: string;
  agentUsed: string;
  routingReason: string;
  toolsUsed: string[];
  sessionId: string;
  durationMs: number;
}

export interface PipelineConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
  sessionTtlMs?: number;
  onToken?: (token: string) => void;
  debug?: boolean;
}

export interface RoutingDecision {
  agent: string;
  confidence: number;
  reason: string;
}
