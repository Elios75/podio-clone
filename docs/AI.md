# AI endpoints (internal, session-authenticated)

All AI features are gated by the `ANTHROPIC_API_KEY` env var (501 when unset) and require a signed-in user (401 otherwise). Model defaults to `claude-sonnet-5`, overridable via `ANTHROPIC_MODEL`.

- `POST /api/ai/build-app` — `{prompt}` → full app definition (fields/views/automations) for the AI app builder at `/org/:org/:ws/ai-builder`.
- `POST /api/ai/formula` — `{prompt, fields: [{external_id, label, type}]}` → `{formula, explanation}` for calculation fields; formulas use `{external_id}` tokens plus `+ - * / ( ) .` only, validated server-side (422 on anything else, or when the request needs unsupported features like conditionals).
- `POST /api/ai/suggest-automations` — `{appName, itemName, fields (incl. category options), existing: [names]}` → `{suggestions: [{name, trigger, conditions?, actions, rationale}]}`; the automations page renders these with one-click Add.
