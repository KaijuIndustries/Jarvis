import { Socket } from "node:net";
import { invalidAudio, VoiceError, voiceTimeout, voiceUnavailable } from "./errors";
import {
  encodeWyomingEvent,
  WyomingEventParser,
  WyomingProtocolError,
  type WyomingEvent,
} from "./wyoming-protocol";

export type { WyomingEvent } from "./wyoming-protocol";

const DEFAULT_CONNECT_MS = 4_000;

export async function withWyomingSocket<T>(options: {
  host: string;
  port: number;
  signal?: AbortSignal;
  connectTimeoutMs?: number;
  unavailable?: () => VoiceError;
  closed?: () => VoiceError;
  run: (connection: WyomingConnection) => Promise<T>;
}): Promise<T> {
  const unavailable = options.unavailable ?? voiceUnavailable;
  const closedError =
    options.closed ??
    (() =>
      new VoiceError(502, "Speech recognition closed the connection.", "whisper_closed"));
  if (options.signal?.aborted) {
    throw new VoiceError(499, "The request was cancelled.", "cancelled");
  }

  const socket = new Socket();
  socket.setNoDelay(true);
  const parser = new WyomingEventParser();
  const pending: WyomingEvent[] = [];
  const waiters: Array<(event: WyomingEvent) => void> = [];
  let socketClosed = false;
  let fail: ((error: Error) => void) | null = null;

  const connection = {
    write(event: WyomingEvent) {
      if (socketClosed) {
        throw unavailable();
      }
      socket.write(encodeWyomingEvent(event));
    },
    async read(): Promise<WyomingEvent> {
      if (pending.length > 0) {
        return pending.shift() as WyomingEvent;
      }
      if (socketClosed) {
        throw closedError();
      }
      return new Promise<WyomingEvent>((resolve, reject) => {
        waiters.push(resolve);
        fail = reject;
      });
    },
  } satisfies WyomingConnection;

  const onAbort = () => {
    destroy(new VoiceError(499, "The request was cancelled.", "cancelled"));
  };

  function destroy(error?: Error) {
    if (socketClosed) return;
    socketClosed = true;
    options.signal?.removeEventListener("abort", onAbort);
    socket.removeAllListeners();
    socket.destroy();
    const reject = fail;
    fail = null;
    waiters.length = 0;
    if (error && reject) reject(error);
  }

  options.signal?.addEventListener("abort", onAbort, { once: true });

  socket.on("data", (chunk: Buffer) => {
    try {
      parser.push(chunk);
      let event = parser.pull();
      while (event) {
        const waiter = waiters.shift();
        if (waiter) waiter(event);
        else pending.push(event);
        event = parser.pull();
      }
    } catch (error) {
      destroy(mapProtocolError(error, unavailable));
    }
  });

  socket.on("error", () => {
    destroy(unavailable());
  });

  socket.on("close", () => {
    destroy(closedError());
  });

  try {
    await connectSocket(
      socket,
      options.host,
      options.port,
      options.connectTimeoutMs,
      unavailable,
    );
    return await options.run(connection);
  } finally {
    destroy();
  }
}

export type WyomingConnection = {
  write(event: WyomingEvent): void;
  read(): Promise<WyomingEvent>;
};

function connectSocket(
  socket: Socket,
  host: string,
  port: number,
  timeoutMs = DEFAULT_CONNECT_MS,
  unavailable: () => VoiceError = voiceUnavailable,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = () => {
      cleanup();
      reject(unavailable());
    };
    const onTimeout = () => {
      cleanup();
      socket.destroy();
      reject(unavailable());
    };
    const onConnect = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      socket.off("error", onError);
      socket.off("timeout", onTimeout);
      socket.off("connect", onConnect);
      socket.setTimeout(0);
    };

    socket.setTimeout(timeoutMs);
    socket.once("error", onError);
    socket.once("timeout", onTimeout);
    socket.once("connect", onConnect);
    socket.connect({ host, port });
  });
}

function mapProtocolError(
  error: unknown,
  unavailable: () => VoiceError = voiceUnavailable,
): VoiceError {
  if (error instanceof VoiceError) return error;
  if (error instanceof WyomingProtocolError) {
    return new VoiceError(502, error.message, "wyoming_protocol");
  }
  return unavailable();
}

export async function transcribePcmOverWyoming(options: {
  host: string;
  port: number;
  language: string;
  pcm: Buffer;
  rate: number;
  width: number;
  channels: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<string> {
  if (options.pcm.length === 0) {
    throw invalidAudio("I didn't hear anything.");
  }

  const timeoutMs = options.timeoutMs ?? 45_000;
  const chunkBytes = 4096;

  return withWyomingSocket({
    host: options.host,
    port: options.port,
    signal: options.signal,
    run: async (connection) => {
      connection.write({
        type: "transcribe",
        data: { language: options.language },
      });
      connection.write({
        type: "audio-start",
        data: {
          rate: options.rate,
          width: options.width,
          channels: options.channels,
        },
      });

      for (let offset = 0; offset < options.pcm.length; offset += chunkBytes) {
        if (options.signal?.aborted) {
          throw new VoiceError(499, "The request was cancelled.", "cancelled");
        }
        connection.write({
          type: "audio-chunk",
          data: {
            rate: options.rate,
            width: options.width,
            channels: options.channels,
          },
          payload: options.pcm.subarray(offset, offset + chunkBytes),
        });
      }

      connection.write({ type: "audio-stop", data: {} });

      return await waitForTranscript(connection, timeoutMs, options.signal);
    },
  });
}

async function waitForTranscript(
  connection: WyomingConnection,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(voiceTimeout()), timeoutMs);
  });

  try {
    while (true) {
      if (signal?.aborted) {
        throw new VoiceError(499, "The request was cancelled.", "cancelled");
      }
      const event = await Promise.race([connection.read(), timeout]);
      if (event.type === "transcript") {
        return typeof event.data.text === "string" ? event.data.text : "";
      }
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
}
