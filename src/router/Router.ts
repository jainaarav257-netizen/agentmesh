import Anthropic from '@anthropic-ai/sdk';
import type { Agent } from '../agents/Agent.js';
import type { RoutingDecision } from '../types/index.js';

export class Router {
  async decide(
    input: string,
    agents: Agent[],
    client: Anthropic,
    model: string,
    debug = false,
  ): Promise<RoutingDecision> {
    // Priority short-circuit — check keyword triggers first, no LLM call needed
    for (const agent of agents) {
      if (agent.priority && agent.triggeredBy(input)) {
        if (debug) console.log(`[agentmesh] priority short-circuit → ${agent.name}`);
        return { agent: agent.name, confidence: 1.0, reason: 'priority keyword match' };
      }
    }

    // Non-priority keyword triggers
    for (const agent of agents) {
      if (!agent.priority && agent.triggeredBy(input)) {
        if (debug) console.log(`[agentmesh] keyword match → ${agent.name}`);
        return { agent: agent.name, confidence: 0.9, reason: 'keyword match' };
      }
    }

    // LLM-based routing when no keyword matches
    const agentList = agents.map(a => `- ${a.name}: ${a.description}`).join('\n');

    const response = await client.messages.create({
      model,
      max_tokens: 256,
      system: `You are a routing agent. Given a user message and a list of specialist agents, decide which agent should handle the message. Respond with a JSON object: {"agent": "<name>", "confidence": <0-1>, "reason": "<one sentence>"}. Only use agent names from the list.`,
      messages: [
        {
          role: 'user',
          content: `Agents:\n${agentList}\n\nUser message: "${input}"\n\nRespond with JSON only.`,
        },
      ],
    });

    const text = (response.content[0] as Anthropic.TextBlock).text.trim();

    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]) as RoutingDecision;
    } catch {
      // fall through to default
    }

    if (debug) console.log('[agentmesh] routing parse failed, using first agent');
    return { agent: agents[0].name, confidence: 0.5, reason: 'fallback to first agent' };
  }
}
