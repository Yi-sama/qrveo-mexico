const MAX_VIDEO_PART_BYTES = 5 * 1024 ** 2;

function sendFileOrBlob(body, target, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(target.method || "PUT", target.url);
    Object.entries(target.headers || {}).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(Math.min(1, event.loaded / event.total));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() :
      reject(Object.assign(new Error("upload"), { code: "TRIAL_UPLOAD_FAILED", status: xhr.status })));
    xhr.onerror = () => reject(Object.assign(new Error("network"), { network: true }));
    xhr.send(body);
  });
}

export async function putVideo(file, target, onProgress) {
  if (target?.mode === undefined) {
    if (!target?.url) throw new Error("service");
    return sendFileOrBlob(file, target, fraction => onProgress?.(Math.round(fraction * 100)));
  }
  const { partSize, parts } = target;
  if (target.mode !== "multipart" || !Number.isSafeInteger(partSize) || partSize < 1 ||
      partSize > MAX_VIDEO_PART_BYTES || !Number.isSafeInteger(file.size) || file.size < 1 ||
      !Array.isArray(parts) || parts.length !== Math.ceil(file.size / partSize)) throw new Error("service");
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (!part || part.partNumber !== index + 1 || part.method !== "PUT" ||
        typeof part.url !== "string") throw new Error("service");
    let url;
    try { url = new URL(part.url); } catch { throw new Error("service"); }
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("service");
  }
  for (let index = 0; index < parts.length; index++) {
    const offset = index * partSize, end = Math.min(offset + partSize, file.size);
    await sendFileOrBlob(file.slice(offset, end), parts[index], fraction =>
      onProgress?.(Math.round((offset + (end - offset) * fraction) / file.size * 100)));
    onProgress?.(Math.round(end / file.size * 100));
  }
}
