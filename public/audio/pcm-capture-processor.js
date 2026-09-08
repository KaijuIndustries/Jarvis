class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(4096);
    this._offset = 0;
    this.port.onmessage = (event) => {
      if (event.data === "flush") {
        this._flush();
        this.port.postMessage({ type: "flushed" });
      }
    };
  }

  _flush() {
    if (this._offset === 0) return;
    const out = this._buffer.slice(0, this._offset);
    this.port.postMessage(out, [out.buffer]);
    this._buffer = new Float32Array(4096);
    this._offset = 0;
  }

  _append(samples) {
    let start = 0;
    while (start < samples.length) {
      const space = this._buffer.length - this._offset;
      const take = Math.min(space, samples.length - start);
      this._buffer.set(samples.subarray(start, start + take), this._offset);
      this._offset += take;
      start += take;
      if (this._offset === this._buffer.length) {
        this.port.postMessage(this._buffer, [this._buffer.buffer]);
        this._buffer = new Float32Array(4096);
        this._offset = 0;
      }
    }
  }

  process(inputs) {
    const channels = inputs[0];
    if (!channels || channels.length === 0) return true;
    const left = channels[0];
    if (!left || left.length === 0) return true;
    const right = channels[1];
    if (right && right.length === left.length) {
      const mixed = new Float32Array(left.length);
      for (let i = 0; i < left.length; i += 1) {
        mixed[i] = (left[i] + right[i]) * 0.5;
      }
      this._append(mixed);
    } else {
      this._append(left);
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
