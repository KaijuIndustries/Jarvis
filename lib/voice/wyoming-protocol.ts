export type WyomingEvent = {
  type: string;
  data: Record<string, unknown>;
  payload?: Buffer;
};

export class WyomingProtocolError extends Error {
  constructor(message = "Speech recognition returned an invalid response.") {
    super(message);
    this.name = "WyomingProtocolError";
  }
}

export function encodeWyomingEvent(event: WyomingEvent): Buffer {
  const header: Record<string, unknown> = { type: event.type };
  const parts: Buffer[] = [];

  const dataKeys = Object.keys(event.data);
  let dataBytes: Buffer | undefined;
  if (dataKeys.length > 0) {
    dataBytes = Buffer.from(JSON.stringify(event.data), "utf8");
    header.data_length = dataBytes.length;
  }
  if (event.payload && event.payload.length > 0) {
    header.payload_length = event.payload.length;
  }

  parts.push(Buffer.from(`${JSON.stringify(header)}\n`, "utf8"));
  if (dataBytes) parts.push(dataBytes);
  if (event.payload && event.payload.length > 0) parts.push(event.payload);
  return Buffer.concat(parts);
}

export class WyomingEventParser {
  private buffer = Buffer.alloc(0);

  push(chunk: Buffer): void {
    this.buffer =
      this.buffer.length === 0 ? Buffer.from(chunk) : Buffer.concat([this.buffer, chunk]);
  }

  pull(): WyomingEvent | null {
    const newline = this.buffer.indexOf(0x0a);
    if (newline < 0) return null;

    let header: Record<string, unknown>;
    try {
      header = JSON.parse(this.buffer.subarray(0, newline).toString("utf8")) as Record<
        string,
        unknown
      >;
    } catch {
      throw new WyomingProtocolError();
    }

    if (!header || typeof header.type !== "string") {
      throw new WyomingProtocolError();
    }

    const dataLength = asNonNegativeInt(header.data_length);
    const payloadLength = asNonNegativeInt(header.payload_length);
    let offset = newline + 1;
    if (this.buffer.length < offset + dataLength + payloadLength) return null;

    let data: Record<string, unknown> = {};
    if (header.data && typeof header.data === "object" && !Array.isArray(header.data)) {
      data = { ...(header.data as Record<string, unknown>) };
    }

    if (dataLength > 0) {
      try {
        const extra = JSON.parse(
          this.buffer.subarray(offset, offset + dataLength).toString("utf8"),
        ) as unknown;
        if (extra && typeof extra === "object" && !Array.isArray(extra)) {
          data = { ...data, ...(extra as Record<string, unknown>) };
        }
      } catch {
        throw new WyomingProtocolError();
      }
      offset += dataLength;
    }

    let payload: Buffer | undefined;
    if (payloadLength > 0) {
      payload = Buffer.from(this.buffer.subarray(offset, offset + payloadLength));
      offset += payloadLength;
    }

    this.buffer = this.buffer.subarray(offset);
    return { type: header.type, data, payload };
  }
}

function asNonNegativeInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}
