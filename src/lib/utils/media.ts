const THUMBNAIL_MAX_EDGE = 960;
const THUMBNAIL_QUALITY = 0.82;

export async function fileToBytes(file: File): Promise<number[]> {
  const buffer = await file.arrayBuffer();
  return Array.from(new Uint8Array(buffer));
}

export async function createMediaPreviewDataUrl(file: File): Promise<string | undefined> {
  if (file.type.startsWith('image/')) {
    return createImageThumbnailDataUrl(file);
  }

  if (file.type.startsWith('video/')) {
    return createVideoThumbnailDataUrl(file);
  }

  return undefined;
}

export async function createImageThumbnailBytes(file: File): Promise<number[]> {
  return dataUrlToBytes(await createImageThumbnailDataUrl(file));
}

export async function createVideoThumbnailBytes(file: File): Promise<number[]> {
  return dataUrlToBytes(await createVideoThumbnailDataUrl(file));
}

async function createImageThumbnailDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    return drawThumbnail(bitmap.width, bitmap.height, (context, width, height) => {
      context.drawImage(bitmap, 0, 0, width, height);
    });
  } finally {
    bitmap.close();
  }
}

async function createVideoThumbnailDataUrl(file: File): Promise<string> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  const objectUrl = URL.createObjectURL(file);

  try {
    video.src = objectUrl;
    await waitForVideoMetadata(video);
    video.currentTime = Math.min(Math.max(video.duration * 0.08, 0.1), 1.2);
    await waitForVideoSeek(video);

    return drawThumbnail(video.videoWidth, video.videoHeight, (context, width, height) => {
      context.drawImage(video, 0, 0, width, height);
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
    video.removeAttribute('src');
    video.load();
  }
}

function drawThumbnail(
  sourceWidth: number,
  sourceHeight: number,
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void
): string {
  const scale = Math.min(THUMBNAIL_MAX_EDGE / Math.max(sourceWidth, sourceHeight), 1);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create thumbnail canvas context.');
  }

  draw(context, width, height);
  return canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY);
}

function dataUrlToBytes(dataUrl: string): number[] {
  const base64 = dataUrl.split(',')[1];
  if (!base64) {
    throw new Error('Invalid thumbnail data URL.');
  }

  return Array.from(Uint8Array.from(window.atob(base64), (character) => character.charCodeAt(0)));
}

function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', handleLoaded);
      video.removeEventListener('error', handleError);
    };
    const handleLoaded = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('Could not load video metadata for thumbnail generation.'));
    };

    video.addEventListener('loadedmetadata', handleLoaded, { once: true });
    video.addEventListener('error', handleError, { once: true });
  });
}

function waitForVideoSeek(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('error', handleError);
    };
    const handleSeeked = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('Could not seek video for thumbnail generation.'));
    };

    video.addEventListener('seeked', handleSeeked, { once: true });
    video.addEventListener('error', handleError, { once: true });
  });
}
