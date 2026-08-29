type StatusIndicatorProps = {
  connected: boolean;
  checking: boolean;
  selectedModel: string | null;
};

export function StatusIndicator({
  connected,
  checking,
  selectedModel,
}: StatusIndicatorProps) {
  const label = checking
    ? "Checking Ollama"
    : connected
      ? selectedModel
        ? `Ollama · ${selectedModel}`
        : "Ollama connected"
      : "Ollama unavailable";

  const tone = checking ? "bg-warn" : connected ? "bg-ok" : "bg-err";

  return (
    <div
      className="flex min-w-0 items-center gap-2 text-[12px] text-muted"
      title={label}
      aria-live="polite"
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone}`} />
      <span className="truncate">{label}</span>
    </div>
  );
}
