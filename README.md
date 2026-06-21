# agentmesh

**Lightweight multi-agent orchestration for LLMs.**

Build pipelines where an orchestrator routes user messages to the right specialist agent — with tool use, session memory, priority short-circuits, and zero boilerplate.

```bash
npm install agentmesh
```

---

## Why agentmesh

Most agent frameworks make you choose between raw API calls (too much code) and heavyweight abstractions (too much magic). agentmesh gives you one pattern — **Pipeline → Router → Agent** — and gets out of the way.

- One API call to route, one to respond
- Priority short-circuit: bypass LLM routing for time-sensitive signals (e.g. emergencies, errors)
- Keyword triggers for fast routing without an extra LLM call
- Session memory included, no setup required
- Works with any Anthropic Claude model
- Full TypeScript, zero runtime dependencies beyond the Anthropic SDK

---

## Quickstart

```ts
import { Pipeline, Agent } from 'agentmesh';

const pipeline = new Pipeline({ apiKey: process.env.ANTHROPIC_API_KEY! });

pipeline
  .addAgent(new Agent({
    name: 'researcher',
    description: 'Answers research questions and explains complex topics',
    systemPrompt: 'You are a thorough research assistant. Explain clearly and cite reasoning.',
  }))
  .addAgent(new Agent({
    name: 'coder',
    description: 'Writes and debugs code in any language',
    systemPrompt: 'You are an expert software engineer. Write clean, working code with explanations.',
  }))
  .addAgent(new Agent({
    name: 'support',
    description: 'Handles customer questions and troubleshooting',
    systemPrompt: 'You are a friendly support agent. Be concise, helpful, and empathetic.',
  }));

const result = await pipeline.run('How do I reverse a linked list in Python?');
console.log(result.output);
// → agentmesh routed to "coder" and returned a clean Python solution
```

---

## Core concepts

### Pipeline

The entry point. Holds your agents, routes messages, and manages session memory.

```ts
const pipeline = new Pipeline({
  apiKey: 'sk-ant-...',
  model: 'claude-sonnet-4-6',      // default model for all agents
  sessionTtlMs: 30 * 60 * 1000,    // session expiry (default: 30 min)
  debug: true,                       // log routing decisions
});
```

### Agent

A specialist with a name, description, system prompt, and optional tools.

```ts
new Agent({
  name: 'analyst',
  description: 'Analyzes data and generates reports',
  systemPrompt: 'You are a data analyst. Be precise and structured.',
  model: 'claude-opus-4-8',         // override per-agent if needed
  maxIterations: 8,                  // max tool-use loops (default: 5)
  tools: [myTool],
})
```

### Tools

Any function the agent can call. Define the schema and the execute function:

```ts
import type { AgentTool } from 'agentmesh';

const weatherTool: AgentTool = {
  name: 'get_weather',
  description: 'Get current weather for a city',
  input_schema: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'City name' },
    },
    required: ['city'],
  },
  execute: async ({ city }) => {
    const res = await fetch(`https://wttr.in/${city}?format=j1`);
    return res.json();
  },
};
```

### Priority short-circuit

Some messages should skip LLM routing entirely. Mark an agent as `priority: true` and provide `triggerKeywords` — if any keyword matches, that agent runs immediately without an extra routing API call.

```ts
new Agent({
  name: 'emergency',
  description: 'Handles urgent safety situations',
  systemPrompt: 'The user needs immediate help. Give a single, clear, direct instruction.',
  priority: true,
  triggerKeywords: ['emergency', 'urgent', 'call 911', 'help me', 'crisis'],
})
```

### Session memory

Pass the same `sessionId` across calls and agents automatically share conversation history:

```ts
const sid = 'user-abc-123';

await pipeline.run('My name is Aarav', sid);
await pipeline.run('What is my name?', sid);
// → "Your name is Aarav."

pipeline.clearSession(sid); // wipe when done
```

---

## Full example: customer support pipeline

```ts
import { Pipeline, Agent, AgentTool } from 'agentmesh';

const lookupOrder: AgentTool = {
  name: 'lookup_order',
  description: 'Look up an order by order ID',
  input_schema: {
    type: 'object',
    properties: {
      order_id: { type: 'string', description: 'The order ID to look up' },
    },
    required: ['order_id'],
  },
  execute: async ({ order_id }) => ({
    id: order_id,
    status: 'shipped',
    eta: '2026-06-24',
    carrier: 'FedEx',
  }),
};

const pipeline = new Pipeline({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  debug: true,
});

pipeline
  .addAgent(new Agent({
    name: 'escalation',
    description: 'Handles angry or urgent customer complaints',
    systemPrompt: 'De-escalate firmly and empathetically. Offer a concrete resolution.',
    priority: true,
    triggerKeywords: ['furious', 'lawsuit', 'refund now', 'terrible', 'unacceptable'],
  }))
  .addAgent(new Agent({
    name: 'orders',
    description: 'Handles order status, shipping, and tracking questions',
    systemPrompt: 'You are a helpful order support agent. Look up orders and give clear status updates.',
    tools: [lookupOrder],
    triggerKeywords: ['order', 'shipping', 'tracking', 'delivery', 'package'],
  }))
  .addAgent(new Agent({
    name: 'general',
    description: 'Handles all other customer questions',
    systemPrompt: 'You are a friendly general support agent. Be concise and helpful.',
  }));

const result = await pipeline.run('Where is my order #88291?');
console.log(`Agent: ${result.agentUsed}`);
console.log(`Tools used: ${result.toolsUsed.join(', ')}`);
console.log(result.output);
```

---

## API reference

### `new Pipeline(config)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | required | Anthropic API key |
| `model` | `string` | `'claude-sonnet-4-6'` | Default model |
| `sessionTtlMs` | `number` | `1800000` | Session memory TTL |
| `onToken` | `(t: string) => void` | — | Called with each agent response |
| `debug` | `boolean` | `false` | Log routing decisions |

### `pipeline.addAgent(agent)`

Registers an agent. Returns `this` for chaining.

### `pipeline.run(message, sessionId?)`

Routes and runs. Returns `PipelineResult`:

```ts
{
  output: string;         // agent's final response
  agentUsed: string;      // which agent handled it
  routingReason: string;  // why it was routed there
  toolsUsed: string[];    // tools called during the run
  sessionId: string;      // use this to continue the conversation
  durationMs: number;
}
```

### `pipeline.clearSession(sessionId)`

Wipes session memory for a user.

---

## Routing logic

agentmesh routes in this order (fastest first):

1. **Priority keyword match** — if a `priority: true` agent has a `triggerKeyword` in the message, it runs immediately. No LLM call.
2. **Standard keyword match** — same for non-priority agents.
3. **LLM-based routing** — one fast Claude call reads agent descriptions and picks the best one.

This means most apps pay for exactly one routing call, not two.

---

## License

MIT — Aarav Jain
