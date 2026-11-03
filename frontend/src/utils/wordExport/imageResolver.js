const MAX_WORD_IMAGE_WIDTH = 900;
const JPEG_QUALITY = 0.82;

function loadImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth || 480, height: image.naturalHeight || 320 });
    };
    image.onerror = () => resolve({ width: 480, height: 320 });
    image.src = dataUrl;
  });
}

async function fetchImageDataUrl(src) {
  const response = await fetch(src, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(`Image fetch failed: ${response.status}`);
  }
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function compressImageForWord(dataUrl, naturalWidth, naturalHeight) {
  let width = naturalWidth || 480;
  let height = naturalHeight || 320;
  if (width > MAX_WORD_IMAGE_WIDTH) {
    height = Math.round(height * (MAX_WORD_IMAGE_WIDTH / width));
    width = MAX_WORD_IMAGE_WIDTH;
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("canvas unsupported"));
        return;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("image compression failed"));
            return;
          }
          blob.arrayBuffer().then((buffer) => {
            resolve({
              bytes: new Uint8Array(buffer),
              mime: "image/jpeg",
              width,
              height,
            });
          }, reject);
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    };
    image.onerror = () => reject(new Error("image load failed"));
    image.src = dataUrl;
  });
}

export async function resolveBlockImages(blocks) {
  const resolved = [];

  for (const block of blocks) {
    if (block.type !== "image" || !block.src) {
      resolved.push(block);
      continue;
    }

    try {
      const dataUrl = await fetchImageDataUrl(block.src);
      const dimensions = await loadImageDimensions(dataUrl);
      const compressed = await compressImageForWord(dataUrl, dimensions.width, dimensions.height);
      resolved.push({
        ...block,
        width: compressed.width,
        height: compressed.height,
        mime: compressed.mime,
        bytes: compressed.bytes,
      });
    } catch {
      resolved.push(block);
    }
  }

  return resolved;
}
