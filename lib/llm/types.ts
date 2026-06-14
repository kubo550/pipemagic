/**
 * Internal, provider-agnostic message + tool format. Adapters translate to and
 * from each provider's wire format (PRD §5.1) so the agent loop never sees a
 * provider-specific shape. Switching providers is an env change, not a rewrite.
 */

export type AgentRole = "user" | "assistant" | "tool";

export interface TextPart {
  type: "text";
  text: string;
}
export interface ToolCallPart {
  type: "tool_call";
  id: string;
  name: string;
  input: unknown;
}
export interface ToolResultPart {
  type: "tool_result";
  toolCallId: string;
  content: string;
  isError?: boolean;
}
export type ContentPart = TextPart | ToolCallPart | ToolResultPart;

export interface AgentMessage {
  role: AgentRole;
  content: ContentPart[];
}

/** A tool as advertised to the model: name + description + JSON Schema params. */
export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmRequest {
  system: string;
  messages: AgentMessage[];
  tools: ToolSchema[];
  maxTokens: number;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmToolCall {
  id: string;
  name: string;
  input: unknown;
}

export type StopReason = "end" | "tool_use" | "max_tokens";

export interface LlmResponse {
  text: string;
  toolCalls: LlmToolCall[];
  stopReason: StopReason;
  usage: LlmUsage;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}
