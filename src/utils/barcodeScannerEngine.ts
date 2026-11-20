import {
  prepareZXingModule,
  readBarcodes,
  type ReaderOptions,
  type ReadResult,
} from 'zxing-wasm/reader';
import readerWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import {
  isLinearBarcodeFormat,
  NATIVE_1D_DETECTOR_FORMATS,
  normalizeBarcodeInput,
} from './barcodeUtils.ts';

let wasmInitPromise: Promise<void> | null = null;

/**
 * Ensures the ZXing-C++ WebAssembly reader is initialized from the locally bundled
 * Vite asset (100% offline/Net-Melli safe, zero external CDN dependency).
 */
export function ensureBarcodeWasmReady(): Promise<void> {
  if (!wasmInitPromise) {
    wasmInitPromise = prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) => {
          if (path.endsWith('.wasm')) {
            return readerWasmUrl;
          }
          return prefix + path;
        },
      },
      fireImmediately: true,
    })
      .then(() => undefined)
      .catch((err) => {
        wasmInitPromise = null;
        throw err;
      });
  }
  return wasmInitPromise;
}

export const TARGET_FORMATS: ReaderOptions['formats'] = ['AllLinear'];

export { isLinearBarcodeFormat, NATIVE_1D_DETECTOR_FORMATS };

export const LIVE_READER_OPTIONS: ReaderOptions = {
  formats: TARGET_FORMATS,
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  binarizer: 'LocalAverage',
  maxNumberOfSymbols: 3,
};

export const PHOTO_READER_OPTIONS: ReaderOptions = {
  formats: TARGET_FORMATS,
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  binarizer: 'LocalAverage',
  maxNumberOfSymbols: 4,
};

export interface DecodedBarcodeMatch {
  code: string;
  format: string;
}

export function pickFirstValidResult(results: ReadResult[]): DecodedBarcodeMatch | null {
  for (const r of results) {
    if (!isLinearBarcodeFormat(r.format)) continue;
    const raw = (r.text || '').trim();
    if (!raw) continue;
    const normalized = normalizeBarcodeInput(raw);
    if (normalized) {
      return {
        code: normalized,
        format: String(r.format || 'Barcode'),
      };
    }
  }
  return null;
}

/**
 * Scores video input devices so Android multi-camera devices pick the standard 1x rear
 * autofocus lens instead of ultra-wide, macro, depth, monochrome, or front lenses.
 */
export function orderCamerasForBarcodeScanning(devices: MediaDeviceInfo[]): {
  ordered: MediaDeviceInfo[];
  preferredDeviceId: string;
} {
  const videoInputs = devices.filter((d) => d.kind === 'videoinput');
  if (videoInputs.length === 0) {
    return { ordered: [], preferredDeviceId: '' };
  }

  const scoreCamera = (cam: MediaDeviceInfo, originalIdx: number): number => {
    const label = (cam.label || '').toLowerCase();
    let score = 0;

    if (!label) {
      // Without labels, rear cameras usually appear after or at index 0 depending on OEM;
      // keep neutral slight preference for earlier rear-facing candidates.
      return 10 - originalIdx;
    }

    if (/front|selfie|user|facing front/.test(label)) {
      score -= 200;
    }
    if (/back|rear|environment|facing back/.test(label)) {
      score += 100;
    }

    // Penalize secondary lenses that lack close autofocus or have heavy distortion
    if (/ultra[\s_-]?wide|0\.5x|0\.6x|macro|depth|tof|infrared|\bir\b|mono|bokeh/.test(label)) {
      score -= 80;
    } else if (/tele|telephoto|periscope|3x|5x|10x/.test(label)) {
      score -= 40;
    }

    // Prefer Android Camera2 index 0 / main / wide-angle primary sensor over auxiliary indices
    if (/camera2\s*0\b|camera\s*0\b|\bmain\b|\b1x\b/.test(label)) {
      score += 35;
    }

    // Slight tie-breaker preserving device enumeration order for same tier
    score -= originalIdx * 0.1;
    return score;
  };

  const ordered = [...videoInputs]
    .map((cam, idx) => ({ cam, score: scoreCamera(cam, idx) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.cam);

  return {
    ordered,
    preferredDeviceId: ordered[0]?.deviceId || '',
  };
}

/**
 * Fast luminance contrast stretching on RGBA ImageData in place.
 * Helps decode washed-out thermal stickers, glossy plastic wrap, or dim shelf barcodes.
 */
export function boostContrastInPlace(imageData: ImageData): ImageData {
  const data = imageData.data;
  const totalPixels = imageData.width * imageData.height;
  const step = totalPixels > 250000 ? 4 : 2;

  let minLum = 255;
  let maxLum = 0;

  for (let i = 0; i < data.length; i += 4 * step) {
    const lum = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  const range = maxLum - minLum;
  if (range < 18 || range > 235) {
    return imageData;
  }

  const scale = 255 / range;
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    const stretched = Math.max(0, Math.min(255, Math.round((lum - minLum) * scale)));
    data[i] = stretched;
    data[i + 1] = stretched;
    data[i + 2] = stretched;
  }

  return imageData;
}

/**
 * Computes source crop rectangle on the video frame matching what the user sees inside
 * the object-cover viewport (optionally zoomed digitally) and captures ImageData.
 */
export function captureVideoScanImageData(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  passIndex: number,
  digitalZoom = 1
): ImageData | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const cw = video.clientWidth || vw;
  const ch = video.clientHeight || vh;

  // Determine the visible rectangle rendered by CSS `object-cover`
  const videoAspect = vw / vh;
  const viewAspect = cw / ch;

  let visibleW = vw;
  let visibleH = vh;
  if (videoAspect > viewAspect) {
    visibleW = vh * viewAspect;
  } else {
    visibleH = vw / viewAspect;
  }

  // Apply digital zoom on top of visible area
  const zoom = Math.max(1, digitalZoom);
  visibleW = visibleW / zoom;
  visibleH = visibleH / zoom;

  const isFullFramePass = passIndex % 4 === 2;
  const isContrastRoiPass = passIndex % 4 === 3;

  // ROI pass zooms cleanly onto the central reticle region (~86% wide x ~56% tall of visible viewport)
  // giving 1D barcodes much higher pixel density and ignoring desk clutter.
  const cropW = Math.max(64, Math.min(vw, isFullFramePass ? visibleW : visibleW * 0.86));
  const cropH = Math.max(64, Math.min(vh, isFullFramePass ? visibleH : visibleH * 0.56));
  const sx = Math.max(0, (vw - cropW) / 2);
  const sy = Math.max(0, (vh - cropH) / 2);

  const maxTargetDim = isFullFramePass ? 960 : 1080;
  const scale = Math.min(1, maxTargetDim / Math.max(cropW, cropH));
  const dw = Math.max(64, Math.round(cropW * scale));
  const dh = Math.max(64, Math.round(cropH * scale));

  if (canvas.width !== dw) canvas.width = dw;
  if (canvas.height !== dh) canvas.height = dh;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, dw, dh);
  const imageData = ctx.getImageData(0, 0, dw, dh);

  if (isContrastRoiPass) {
    boostContrastInPlace(imageData);
  }

  return imageData;
}

export async function decodeImageDataWithWasm(
  imageData: ImageData,
  options: ReaderOptions = LIVE_READER_OPTIONS
): Promise<DecodedBarcodeMatch | null> {
  await ensureBarcodeWasmReady();
  const results = await readBarcodes(imageData, options);
  return pickFirstValidResult(results);
}

/**
 * Multi-pass decoder for camera-captured photos or gallery images.
 * Handles high-MP phone photos, low contrast thermal labels, and tight central crops.
 */
export async function decodeBarcodeFromImageFile(
  file: Blob
): Promise<DecodedBarcodeMatch | null> {
  await ensureBarcodeWasmReady();

  // Pass 1: Direct decode on raw blob
  try {
    const directResults = await readBarcodes(file, PHOTO_READER_OPTIONS);
    const directMatch = pickFirstValidResult(directResults);
    if (directMatch) return directMatch;
  } catch {
    // Fall through to canvas normalization passes
  }

  // Load image into canvas for scaled + cropped + contrast-enhanced passes
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to load image'));
      el.src = objectUrl;
    });

    const natW = img.naturalWidth || img.width;
    const natH = img.naturalHeight || img.height;
    if (!natW || !natH) return null;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    // Pass 2: Full image clamped to <= 1600px (sweet spot for ZXing-C++ adaptive threshold)
    const maxDim = 1600;
    const scale = Math.min(1, maxDim / Math.max(natW, natH));
    const fullW = Math.max(64, Math.round(natW * scale));
    const fullH = Math.max(64, Math.round(natH * scale));

    canvas.width = fullW;
    canvas.height = fullH;
    ctx.drawImage(img, 0, 0, fullW, fullH);

    const fullData = ctx.getImageData(0, 0, fullW, fullH);
    const fullMatch = pickFirstValidResult(await readBarcodes(fullData, PHOTO_READER_OPTIONS));
    if (fullMatch) return fullMatch;

    // Pass 3: Contrast-enhanced full frame
    const contrastedFull = new ImageData(
      new Uint8ClampedArray(fullData.data),
      fullW,
      fullH
    );
    boostContrastInPlace(contrastedFull);
    const contrastMatch = pickFirstValidResult(
      await readBarcodes(contrastedFull, PHOTO_READER_OPTIONS)
    );
    if (contrastMatch) return contrastMatch;

    // Pass 4: Central 65% crop at native/high resolution (for tiny serial barcodes inside wide shots)
    const roiW = Math.round(natW * 0.65);
    const roiH = Math.round(natH * 0.65);
    const roiX = Math.round((natW - roiW) / 2);
    const roiY = Math.round((natH - roiH) / 2);
    const roiScale = Math.min(1, 1400 / Math.max(roiW, roiH));
    const outRoiW = Math.max(64, Math.round(roiW * roiScale));
    const outRoiH = Math.max(64, Math.round(roiH * roiScale));

    canvas.width = outRoiW;
    canvas.height = outRoiH;
    ctx.drawImage(img, roiX, roiY, roiW, roiH, 0, 0, outRoiW, outRoiH);

    const roiData = ctx.getImageData(0, 0, outRoiW, outRoiH);
    const roiMatch = pickFirstValidResult(await readBarcodes(roiData, PHOTO_READER_OPTIONS));
    if (roiMatch) return roiMatch;

    boostContrastInPlace(roiData);
    return pickFirstValidResult(await readBarcodes(roiData, PHOTO_READER_OPTIONS));
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
