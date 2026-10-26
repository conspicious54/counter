import test from "node:test";
import assert from "node:assert/strict";
import {
  captureCommand,
  nativeCaptureHandler,
  recordingBlob,
  subscribeCapture,
} from "../lib/native-capture";

test("native capture routes commands and results by request ID and detaches on switch", () => {
  const target = new EventTarget();
  const messages: object[] = [];
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: Object.assign(target, {
      webkit: {
        messageHandlers: { counterCapture: { postMessage: (body: object) => messages.push(body) } },
      },
    }),
  });
  try {
    assert.ok(nativeCaptureHandler());
    const received: string[] = [];
    const unsubscribe = subscribeCapture("current", (event) => received.push(event.code!));
    captureCommand("scan.start", "current");
    assert.deepEqual(messages, [{ action: "scan.start", id: "current" }]);
    const send = (id: string) => {
      const event = new Event("counter-capture");
      Object.assign(event, { detail: { id, type: "barcode", code: "791943102043" } });
      target.dispatchEvent(event);
    };
    send("old");
    assert.deepEqual(received, []);
    send("current");
    assert.deepEqual(received, ["791943102043"]);
    unsubscribe();
    send("current");
    assert.equal(received.length, 1);
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
test("ordinary browsers use web capture without a native bridge", () => {
  assert.equal(nativeCaptureHandler(), undefined);
  assert.doesNotThrow(() => captureCommand("voice.cancel", "gone"));
});
test("native recording becomes an exact m4a upload and rejects empty or invalid payloads", async () => {
  const bytes = Uint8Array.from([0, 0, 0, 24, 102, 116, 121, 112, 77, 52, 65, 32, 255]);
  const blob = recordingBlob(Buffer.from(bytes).toString("base64"));
  assert.equal(blob.type, "audio/mp4");
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
  assert.throws(() => recordingBlob(""));
  assert.throws(() => recordingBlob("not base64!!"));
});
