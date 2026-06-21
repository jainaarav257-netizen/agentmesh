import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { Agent } from './agents/Agent.js';
import { Router } from './router/Router.js';
import { SessionMemory } from './memory/SessionMemory.js';
import type { PipelineConfig, PipelineResult } from './types/index.js';

export class Pipeline {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly agents: Agent[] = [];
  private readonly router = new Router();
  private readonly memory: SessionMemory;
  private readonly config: PipelineConfig;

  constructor(config: PipelineConfig) {
    this.config = config;
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model ?? 'claude-sonnet-4-6';
    this.memory = new SessionMemory(config.sessionTtlMs);
  }

  addAgent(agent: Agent): this {
    this.agents.push(agent);
    return this;
  }

  async run(userMessage: string, sessionId?: string): Promise<PipelineResult> {
    if (this.agents.length === 0) throw new Error('[agentmesh] No agents registered. Call pipeline.addAgent() first.');

    const sid = sessionId ?? randomUUID();
    const start = Date.now();

    const history = this.memory.getMessages(sid);

    // Route to the right specialist
    const routing = await this.router.decide(
      userMessage,
      this.agents,
      this.client,
      this.model,
      this.config.debug,
    );

    const agent = this.agents.find(a => a.name === routing.agent) ?? this.agents[0];

    if (this.config.debug) {
      console.log(`[agentmesh] routing → ${agent.name} (confidence: ${routing.confidence}, reason: ${routing.reason})`);
    }

    const result = await agent.run(
      userMessage,
      history,
      this.client,
      this.model,
      this.config.onToken,
      this.config.debug,
    );

    // Persist to session memory
    this.memory.append(sid, { role: 'user', content: userMessage });
    this.memory.append(sid, { role: 'assistant', content: result.text });

    return {
      output: result.text,
      agentUsed: agent.name,
      routingReason: routing.reason,
      toolsUsed: result.toolsUsed,
      sessionId: sid,
      durationMs: Date.now() - start,
    };
  }

  clearSession(sessionId: string): void {
    this.memory.clear(sessionId);
  }

  getAgents(): Agent[] {
    return [...this.agents];
  }
}
