import test from "node:test";
import assert from "node:assert/strict";
import { putVideo } from "../src/scripts/qr-upload.mjs";

const PART_SIZE = 5 * 1024 ** 2;
const flush = () => new Promise(resolve => setImmediate(resolve));

function multipart(size, partSize = PART_SIZE) {
  return {
    mode: "multipart", partSize,
    parts: Array.from({ length: Math.ceil(size / partSize) }, (_, index) => ({
      partNumber: index + 1, url: `https://upload.example/part-${index + 1}`,
      method: "PUT", headers: { "X-Part": String(index + 1) },
    })),
  };
}

function xhrFixture(t, outcomes) {
  const requests = [];
  const previous = Object.getOwnPropertyDescriptor(globalThis, "XMLHttpRequest");
  globalThis.XMLHttpRequest = class {
    upload = {};
    headers = {};
    status = 200;
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(key, value) { this.headers[key] = value; }
    send(body) {
      this.body = body;
      requests.push(this);
      if (outcomes) {
        const outcome = outcomes[requests.length - 1];
        queueMicrotask(() => {
          if (outcome === "network") this.onerror();
          else { this.status = outcome; this.onload(); }
        });
      }
    }
  };
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "XMLHttpRequest", previous);
    else delete globalThis.XMLHttpRequest;
  });
  return requests;
}

test("multipart sends real 5 MiB slices sequentially with aggregate progress and an exact final remainder", async t => {
  const bytes = Uint8Array.from({ length: PART_SIZE * 2 + 17 }, (_, index) => index % 251);
  const file = new File([bytes], "video.mp4", { type: "video/mp4" });
  const target = multipart(file.size), requests = xhrFixture(t), progress = [];
  let finished = false;
  const uploading = putVideo(file, target, value => progress.push(value)).then(() => { finished = true; });
  for (let index = 0; index < target.parts.length; index++) {
    assert.equal(requests.length, index + 1, "Do not start the next part before this response succeeds");
    assert.equal(finished, false);
    const request = requests[index], offset = index * PART_SIZE;
    const expected = bytes.slice(offset, Math.min(offset + PART_SIZE, file.size));
    assert.ok(request.body instanceof Blob);
    assert.deepEqual(new Uint8Array(await request.body.arrayBuffer()), expected);
    assert.equal(request.body.size, index === 2 ? 17 : PART_SIZE);
    assert.equal(request.method, "PUT");
    assert.equal(request.url, target.parts[index].url);
    assert.deepEqual(request.headers, target.parts[index].headers);
    const count = progress.length;
    request.upload.onprogress({ lengthComputable: false });
    assert.equal(progress.length, count);
    request.upload.onprogress({ lengthComputable: true, loaded: expected.length / 2, total: expected.length });
    assert.equal(progress.at(-1), Math.round((offset + expected.length / 2) / file.size * 100));
    request.onload();
    await flush();
  }
  assert.equal(await uploading, undefined, "No ETag or receipt is needed");
  assert.equal(finished, true);
  assert.equal(progress.at(-1), 100);
  assert.ok(progress.every((value, index) => value >= 0 && value <= 100 && (!index || value >= progress[index - 1])));
  assert.equal(requests.length, 3);
});

for (const size of [6, 7, 8, 14]) {
  test(`multipart sends exactly ceil(size / partSize) parts for ${size} bytes`, async t => {
    const bytes = Uint8Array.from({ length: size }, (_, index) => index + 1);
    const file = new Blob([bytes]), target = multipart(file.size, 7);
    const requests = xhrFixture(t, target.parts.map(() => 204));
    await putVideo(file, target);
    assert.equal(requests.length, target.parts.length);
    const actual = new Uint8Array(await new Blob(requests.map(row => row.body)).arrayBuffer());
    assert.deepEqual(actual, bytes);
    assert.equal(requests.at(-1).body.size, size % 7 || 7);
  });
}

for (const method of [undefined, "POST"]) {
  test(`legacy descriptor sends the original file with ${method || "default PUT"}`, async t => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], "small.mp4", { type: "video/mp4" });
    const requests = xhrFixture(t), progress = [];
    const target = { url: "/legacy-upload", method, headers: { "Content-Type": file.type } };
    const uploading = putVideo(file, target, value => progress.push(value));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body, file);
    assert.equal(requests[0].method, method || "PUT");
    assert.equal(requests[0].url, target.url);
    assert.deepEqual(requests[0].headers, target.headers);
    requests[0].upload.onprogress({ lengthComputable: true, loaded: 1, total: 4 });
    assert.deepEqual(progress, [25]);
    requests[0].status = 201;
    requests[0].onload();
    assert.equal(await uploading, undefined);
  });
}

for (const outcome of [524, "network"]) {
  test(`multipart stops on a middle ${outcome} failure without retries or success`, async t => {
    const bytes = Uint8Array.from({ length: 17 }, (_, index) => index + 1);
    const file = new Blob([bytes]), requests = xhrFixture(t, [200, outcome, 200]);
    let completed = false;
    await assert.rejects(putVideo(file, multipart(file.size, 7)).then(() => { completed = true; }), error => {
      if (outcome === "network") {
        assert.equal(error.network, true);
        assert.equal(error.status, undefined);
      } else {
        assert.equal(error.code, "TRIAL_UPLOAD_FAILED");
        assert.equal(error.status, 524);
      }
      return true;
    });
    assert.equal(completed, false);
    assert.equal(requests.length, 2);
    for (let index = 0; index < requests.length; index++) {
      assert.deepEqual(new Uint8Array(await requests[index].body.arrayBuffer()), bytes.slice(index * 7, index * 7 + 7));
    }
  });
}

test("invalid descriptors are rejected before any part is sent, including malformed later parts", async t => {
  const file = new Blob([new Uint8Array(17)]), valid = () => multipart(file.size, 7);
  const requests = xhrFixture(t);
  const invalid = [
    ["missing target", undefined],
    ["unknown mode with a legacy URL", { ...valid(), mode: "other", url: "/legacy-upload" }],
    ...[0, -1, 1.5, NaN, Infinity, "7", PART_SIZE + 1].map(partSize =>
      [`part size ${partSize}`, { ...valid(), partSize }]),
    ["missing parts", { ...valid(), parts: undefined }],
    ["too few parts", { ...valid(), parts: valid().parts.slice(0, 2) }],
    ["too many parts", { ...valid(), parts: [...valid().parts, valid().parts[0]] }],
    ["sparse parts", { ...valid(), parts: new Array(3) }],
    ...[
      ["missing number", { partNumber: undefined }],
      ["string number", { partNumber: "3" }],
      ["duplicate number", { partNumber: 2 }],
      ["out of order", { partNumber: 1 }],
      ["missing URL", { url: undefined }],
      ["empty URL", { url: "" }],
      ["invalid URL", { url: "not a URL" }],
      ["non-HTTP URL", { url: "data:text/plain,video" }],
      ["wrong method", { method: "POST" }],
    ].map(([name, change]) => {
      const target = valid();
      Object.assign(target.parts[2], change);
      return [name, target];
    }),
    ["null last part", { ...valid(), parts: [...valid().parts.slice(0, 2), null] }],
  ];
  for (const [name, target] of invalid) {
    await assert.rejects(putVideo(file, target), /service/, name);
    assert.equal(requests.length, 0, name);
  }
});
