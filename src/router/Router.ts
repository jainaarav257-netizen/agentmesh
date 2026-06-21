import type { Agent } from '../agents/Agent.js';
import type { LLMProvider, RoutingDecision } from '../types/index.js';

export class Router {
  async decide(
    input: string,
    agents: Agent[],
    provider: LLMProvider,
    model: string,
    debug = false,
  ): Promise<RoutingDecision> {
    // 1. Priority keyword short-circuit — zero LLM calls
    for (const agent of agents) {
      if (agent.priority && agent.triggeredBy(input)) {
        if (debug) console.log(`[agentmesh] priority short-circuit → ${agent.name}`);
        return { agent: agent.name, confidence: 1.0, reason: 'priority keyword match' };
      }
    }

    // 2. Standard keyword match — zero LLM calls
    for (const agent of agents) {
      if (!agent.priority && agent.triggeredBy(input)) {
        if (debug) console.log(`[agentmesh] keyword match → ${agent.name}`);
        return { agent: agent.name, confidence: 0.9, reason: 'keyword match' };
      }
    }

    // 3. Single-agent shortcut — no routing call needed
    if (agents.length === 1) {
      return { agent: agents[0].name, confidence: 1.0, reason: 'only agent registered' };
    }

    // 4. LLM-based routing — one fast call
    const agentList = agents.map(a => `- ${a.name}: ${a.description}`).join('\n');

    try {
      const response = await provider.chat({
        model,
        system: 'You are a routing agent. Given a user message and a list of specialist agents, choose the best agent. Respond ONLY with a valid JSON object in this exact format: {"agent": "<name>", "confidence": <number between 0 and 1>, "reason": "<one short sentence>"}. Use only agent names from the provided list.',
        messages: [{ role: 'user', content: `Agents:\n${agentList}\n\nUser message: "${input}"` }],
        maxTokens: 128,
      });

      const match = response.text.match(/\{[\s\S]*?\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as RoutingDecision;
        if (agents.find(a => a.name === parsed.agent)) {
          if (debug) console.log(`[agentmesh] LLM routed → ${parsed.agent} (${parsed.confidence})`);
          return parsed;
        }
      }
    } catch (err) {
      if (debug) console.warn('[agentmesh] routing LLM call failed, using fallback:', err);
    }

    return { agent: agents[0].name, confidence: 0.5, reason: 'fallback to first agent' };
  }
}
