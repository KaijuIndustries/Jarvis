export type ToolName = "web_search";

export type ToolContext = {
  model: string;
  signal?: AbortSignal;
};

export type ToolResult = {
  ok: boolean;
  tool: ToolName;
  /** Text the model may use. Never include secrets. */
  content: string;
  error?: string;
};

export type ToolInput = {
  query?: string;
};

export interface Tool {
  readonly name: ToolName;
  readonly description: string;
  execute(input: ToolInput, context: ToolContext): Promise<ToolResult>;
}
