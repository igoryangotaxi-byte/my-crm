/**
 * OpenClaw plugin: one generic invoker that posts to Appli's Tool Gateway.
 * Auth: HMAC token minted by Appli is passed as APPLI_TOOL_TOKEN per request
 * via env AI_TOOL_GATEWAY_SECRET + X-Appli-Acting-As.
 */
export default {
  id: "appli-tools",
  register(api) {
    api.registerTool({
      name: "appli_invoke",
      description: "Call an Appli CRM tool (calendar, tasks, crm, analytics, mail, telegram).",
      parameters: {
        type: "object",
        properties: {
          tool: { type: "string" },
          args: { type: "object" },
          userId: { type: "string" },
          token: { type: "string" },
        },
        required: ["tool", "userId", "token"],
      },
      async execute(_id, params) {
        const base = process.env.APPLI_TOOL_GATEWAY_URL;
        if (!base) {
          return { content: [{ type: "text", text: "APPLI_TOOL_GATEWAY_URL is not set." }] };
        }
        const [namespace, action] = String(params.tool).split(".");
        const res = await fetch(`${base.replace(/\/$/, "")}/api/ai/tools/${namespace}/${action}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${params.token}`,
            "X-Appli-Acting-As": String(params.userId),
            "Content-Type": "application/json",
            "Idempotency-Key": `${params.userId}:${params.tool}:${Date.now()}`,
          },
          body: JSON.stringify(params.args ?? {}),
        });
        const json = await res.json();
        return { content: [{ type: "text", text: JSON.stringify(json) }], details: json };
      },
    });
  },
};
