import { randomUUID } from 'crypto';
import { Agent } from './agents/Agent.js';
import { Router } from './router/Router.js';
import { SessionMemory } from './memory/SessionMemory.js';
import type { PipelineConfig, PipelineResult } from './types/index.js';

export class Pipeline {
  private readonly agents: Agent[] = [];
  private readonly router = new Router();
  private readonly memory: SessionMemory;
  private readonly config: PipelineConfig;

  constructor(config: PipelineConfig) {
    this.config = config;
    this.memory = new SessionMemory(config.sessionTtlMs);
  }

  addAgent(agent: Agent): this {
    this.agents.push(agent);
    return this;
  }

  async run(userMessage: string, sessionId?: string): Promise<PipelineResult> {
    if (this.agents.length === 0) {
      throw new Error('[agentmesh] No agents registered. Call pipeline.addAgent() before running.');
    }

    const sid = sessionId ?? randomUUID();
    const start = Date.now();
    const history = this.memory.getMessages(sid);

    const routing = await this.router.decide(
      userMessage,
      this.agents,
      this.config.provider,
      this.config.model,
      this.config.debug,
    );

    const agent = this.agents.find(a => a.name === routing.agent) ?? this.agents[0];

    if (this.config.debug) {
      console.log(`[agentmesh] → ${agent.name} | reason: ${routing.reason} | confidence: ${routing.confidence}`);
    }

    const result = await agent.run(
      userMessage,
      history,
      this.config.provider,
      this.config.model,
      this.config.onToken,
      this.config.debug,
    );

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
