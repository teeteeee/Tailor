export type StreamEvent = { type: string; [key: string]: unknown };

/**
 * POST a body and read a newline-delimited JSON response, handing each line to
 * onEvent. Streaming routes report failures as an `error` line, since by then
 * the response headers are long since sent.
 */
export async function postNdjson(
  url: string,
  body: unknown,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `Request to ${url} failed.`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as StreamEvent;
      if (event.type === "error") throw new Error(String(event.error ?? "Something went wrong."));
      onEvent(event);
    }
  }
}
