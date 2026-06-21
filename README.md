# agentmesh

**The simplest way to build multi-agent LLM pipelines.**

Works with **OpenAI** and **Anthropic**. One pattern — Pipeline → Router → Agent — with smart routing, tool use, session memory, and priority short-circuits built in.

```bash
npm install agentmesh
```

---

## The problem with other frameworks

LangChain has 500+ classes. CrewAI forces you into "role play" metaphors. OpenAI's Agents SDK only works with OpenAI.

agentmesh gives you one thing: a pipeline that routes messages to the right agent, runs tool loops until done, and remembers the conversation. Nothing else.

---

## Quickstart — OpenAI

```ts
import { Pipeline, Agent, OpenAIProvider } from 'agentmesh';

const pipeline = new Pipeline({
  provider: new OpenAIProvider(process.env.OPENAI_API_KEY!),
  model: 'gpt-4o-mini',
});

pipeline
  .addAgent(new Agent({
    name: 'coder',
    description: 'Writes and debugs code in any language',
    systemPrompt: 'You are an expert software engineer. Write clean, working code.',
  }))
  .addAgent(new Agent({
    name: 'researcher',
    description: 'Answers research and factual questions',
    systemPrompt: 'You are a thorough research assistant. Be clear and cite your reasoning.',
  }));

const result = await pipeline.run('How do I debounce a function in JavaScript?');
console.log(result.output);     // clean JS answer
console.log(result.agentUsed);  // "coder"
```

## Quickstart — Anthropic

```ts
import { Pipeline, Agent, AnthropicProvider } from 'agentmesh';

const pipeline = new Pipeline({
  provider: new AnthropicProvider(process.env.ANTHROPIC_API_KEY!),
  model: 'claude-haiku-4-5-20251001',
});

// same Agent/addAgent API — provider is the only difference
```

---

## Core concepts

### Providers

Swap the provider to switch models. Both implement the same interface so your agent code never changes.

```ts
import { AnthropicProvider, OpenAIProvider } from 'agentmesh';

new AnthropicProvider(process.env.ANTHROPIC_API_KEY!)
new OpenAIProvider(process.env.OPENAI_API_KEY!)
```

You can also bring your own by implementing the `LLMProvider` interface — works with any API that supports chat + tool use.

### Agents

Each agent has a name, a description (used for routing), and a system prompt.

```ts
new Agent({
  name: 'support',
  description: 'Handles billing, account, and subscription questions',
  systemPrompt: 'You are a friendly support agent. Be concise and helpful.',
  model: 'gpt-4o',           // override per-agent
  maxIterations: 8,           // max tool-use loops (default: 5)
  tools: [lookupUser],
  triggerKeywords: ['billing', 'invoice', 'charge', 'subscription'],
})
```

### Tools

Define a schema and an execute function. The agent calls your tool automatically when needed.

```ts
import type { AgentTool } from 'agentmesh';

const getWeather: AgentTool = {
  name: 'get_weather',
  description: 'Get current weather for a city',
  input_schema: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'City name, e.g. Chicago' },
    },
    required: ['city'],
  },
  execute: async ({ city }) => {
    const res = await fetch(`https://wttr.in/${city}?format=j1`);
    return res.json();
  },
};
```

### Routing

agentmesh picks the right agent in this order — fastest first:

| Step | Method | LLM call? |
|------|--------|-----------|
| 1 | Priority keyword match | No |
| 2 | Standard keyword match | No |
| 3 | Single agent registered | No |
| 4 | LLM-based routing decision | Yes (1 fast call) |

Most real apps route via keywords and never pay for a routing call.

### Priority short-circuit

Mark an agent `priority: true` and give it `triggerKeywords`. If any keyword matches the input, that agent runs immediately — before anything else, without an LLM routing call. Use this for emergencies, errors, or anything time-sensitive.

```ts
new Agent({
  name: 'emergency',
  description: 'Handles urgent safety situations',
  systemPrompt: 'The user needs immediate help. Give one clear instruction fast.',
  priority: true,
  triggerKeywords: ['emergency', 'urgent', 'help me now', 'crisis', 'call 911'],
})
```

### Session memory

Pass the same `sessionId` across calls and agents share the full conversation history automatically.

```ts
const sid = 'user-42';

await pipeline.run("I'm building a REST API in Express", sid);
await pipeline.run('What was I just building?', sid);
// → "You were building a REST API in Express."

pipeline.clearSession(sid);
```

---

## Full example: customer support pipeline with tools

```ts
import { Pipeline, Agent, OpenAIProvider } from 'agentmesh';
import type { AgentTool } from 'agentmesh';

const lookupOrder: AgentTool = {
  name: 'lookup_order',
  description: 'Look up an order by its ID',
  input_schema: {
    type: 'object',
    properties: {
      order_id: { type: 'string', description: 'The order ID' },
    },
    required: ['order_id'],
  },
  execute: async ({ order_id }) => ({
    id: order_id,
    status: 'shipped',
    eta: '2026-06-28',
    carrier: 'FedEx',
    tracking: '7489234892348',
  }),
};

const pipeline = new Pipeline({
  provider: new OpenAIProvider(process.env.OPENAI_API_KEY!),
  model: 'gpt-4o-mini',
  debug: true,
});

pipeline
  .addAgent(new Agent({
    name: 'escalation',
    description: 'Handles angry or threatening customers',
    systemPrompt: 'De-escalate calmly. Acknowledge frustration. Offer a concrete resolution.',
    priority: true,
    triggerKeywords: ['lawyer', 'lawsuit', 'furious', 'unacceptable', 'refund now'],
  }))
  .addAgent(new Agent({
    name: 'orders',
    description: 'Handles shipping, tracking, and order status questions',
    systemPrompt: 'You are a helpful order support agent. Always look up the order before responding.',
    tools: [lookupOrder],
    triggerKeywords: ['order', 'shipping', 'tracking', 'package', 'delivery', 'where is'],
  }))
  .addAgent(new Agent({
    name: 'general',
    description: 'Handles all other customer service questions',
    systemPrompt: 'You are a friendly and concise support agent.',
  }));

const result = await pipeline.run("Where is my order #88291? It's been two weeks.");

console.log(`Agent:   ${result.agentUsed}`);
console.log(`Routed:  ${result.routingReason}`);
console.log(`Tools:   ${result.toolsUsed.join(', ')}`);
console.log(`Time:    ${result.durationMs}ms`);
console.log(result.output);
```

---

## Bring your own provider

Implement `LLMProvider` to use any API — Groq, Mistral, local Ollama, whatever:

```ts
import type { LLMProvider, LLMResponse } from 'agentmesh';

class GroqProvider implements LLMProvider {
  async chat({ model, system, messages, tools }): Promise<LLMResponse> {
    // call your API here
    return { text: '...', toolCalls: [], stopReason: 'end_turn' };
  }

  async submitToolResults({ model, system, messages, toolResults, tools }): Promise<LLMResponse> {
    // submit tool results and get the next response
    return { text: '...', toolCalls: [], stopReason: 'end_turn' };
  }
}

const pipeline = new Pipeline({
  provider: new GroqProvider(),
  model: 'llama-3.1-8b-instant',
});
```

---

## API reference

### `new Pipeline(config)`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `provider` | `LLMProvider` | Yes | `AnthropicProvider` or `OpenAIProvider` |
| `model` | `string` | Yes | Default model ID for all agents |
| `sessionTtlMs` | `number` | No | Session expiry (default: 30 min) |
| `onToken` | `(t: string) => void` | No | Called with each agent response |
| `debug` | `boolean` | No | Log routing decisions to console |

### `pipeline.run(message, sessionId?)`

Routes the message, runs the agent, returns:

```ts
{
  output: string;        // the agent's response
  agentUsed: string;     // which agent handled it
  routingReason: string; // why it was routed there
  toolsUsed: string[];   // tool names called
  sessionId: string;     // pass this back to continue the conversation
  durationMs: number;    // total wall time
}
```

### `new Agent(config)`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `name` | `string` | Yes | Unique agent name |
| `description` | `string` | Yes | Used by the LLM router to pick agents |
| `systemPrompt` | `string` | Yes | The agent's instructions |
| `tools` | `AgentTool[]` | No | Tools the agent can call |
| `model` | `string` | No | Override the pipeline's default model |
| `maxIterations` | `number` | No | Max tool-use loops (default: 5) |
| `priority` | `boolean` | No | If true, checked first via keyword match |
| `triggerKeywords` | `string[]` | No | Keywords that route to this agent without an LLM call |

---

## Why not LangChain / CrewAI / other?

| | agentmesh | LangChain | CrewAI | OpenAI Agents SDK |
|--|--|--|--|--|
| Works with OpenAI | ✅ | ✅ | ✅ | ✅ |
| Works with Anthropic | ✅ | ✅ | ✅ | ❌ |
| Bring your own provider | ✅ | ✅ | ⚠️ | ❌ |
| Lines to build a pipeline | ~15 | 50+ | 40+ | ~20 |
| Priority short-circuit | ✅ | ❌ | ❌ | ❌ |
| Session memory built-in | ✅ | ⚠️ | ❌ | ⚠️ |
| Zero mandatory dependencies | ✅ | ❌ | ❌ | ❌ |

---

## License

MIT — Aarav Jain
