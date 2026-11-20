import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Flashlight,
  RefreshCw,
  AlertCircle,
  ImagePlus,
  ZoomIn,
  Focus,
  CheckCircle2,
} from 'lucide-react';
import { normalizeBarcodeInput } from '../utils/barcodeUtils.ts';
import { toPersianDigits } from '../utils/jalali.ts';
import {
  captureVideoScanImageData,
  decodeBarcodeFromImageFile,
  decodeImageDataWithWasm,
  ensureBarcodeWasmReady,
  isLinearBarcodeFormat,
  NATIVE_1D_DETECTOR_FORMATS,
  orderCamerasForBarcodeScanning,
} from '../utils/barcodeScannerEngine.ts';

interface CameraBarcodeViewportProps {
  active: boolean;
  onDetected: (normalizedCode: string) => void;
  compact?: boolean;
}

interface ExtendedTrackCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
  zoom?: { min: number; max: number; step?: number };
  focusMode?: string[];
  exposureMode?: string[];
  whiteBalanceMode?: string[];
}

const NATIVE_DETECTOR_FORMATS: string[] = [...NATIVE_1D_DETECTOR_FORMATS];

export const CameraBarcodeViewport: React.FC<CameraBarcodeViewportProps> = ({
  active,
  onDetected,
  compact = false,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const onDetectedRef = useRef(onDetected);
  const lastDetectionRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const autoSwitchedToMainRef = useRef(false);
  const digitalZoomRef = useRef(1);
  const focusResetTimerRef = useRef<number | null>(null);
  const detectedTimerRef = useRef<number | null>(null);

  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // Zoom state: hardware zoom if device supports it, else clean digital ROI zoom (1x..3x)
  const [hardwareZoomRange, setHardwareZoomRange] = useState<{
    min: number;
    max: number;
    step: number;
  } | null>(null);
  const [zoomValue, setZoomValue] = useState<number>(1);
  const [focusSupported, setFocusSupported] = useState(false);
  const [focusReticle, setFocusReticle] = useState<{
    xPct: number;
    yPct: number;
    active: boolean;
  } | null>(null);

  const [status, setStatus] = useState<'initializing' | 'ready' | 'error'>('initializing');
  const [wasmReady, setWasmReady] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [detectedPulse, setDetectedPulse] = useState(false);
  const [photoStatus, setPhotoStatus] = useState<{
    type: 'scanning' | 'error' | 'success';
    text: string;
  } | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    digitalZoomRef.current = hardwareZoomRange ? 1 : zoomValue;
  }, [zoomValue, hardwareZoomRange]);

  const emitDetection = useCallback((rawText: string) => {
    const normalized = normalizeBarcodeInput(rawText);
    if (!normalized) return;

    const now = Date.now();
    if (
      lastDetectionRef.current.code === normalized &&
      now - lastDetectionRef.current.at < 1500
    ) {
      return;
    }

    lastDetectionRef.current = { code: normalized, at: now };
    setDetectedPulse(true);
    if (detectedTimerRef.current !== null) {
      window.clearTimeout(detectedTimerRef.current);
    }
    detectedTimerRef.current = window.setTimeout(() => {
      setDetectedPulse(false);
    }, 320);

    onDetectedRef.current(normalized);
  }, []);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let activeStream: MediaStream | null = null;
    let scanTimer: number | null = null;
    let passCounter = 0;

    if (!scanCanvasRef.current) {
      scanCanvasRef.current = document.createElement('canvas');
    }

    const startCameraAndEngine = async () => {
      setStatus('initializing');
      setErrorMessage('');
      setTorchOn(false);
      setTorchSupported(false);
      setHardwareZoomRange(null);
      setZoomValue(1);
      setFocusSupported(false);
      setWasmReady('loading');

      // Kick off local WASM initialization immediately in parallel with camera startup
      const wasmPromise = ensureBarcodeWasmReady()
        .then(() => {
          if (!cancelled) setWasmReady('ready');
        })
        .catch(() => {
          if (!cancelled) setWasmReady('error');
        });

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
      ) {
        setStatus('error');
        setErrorMessage(
          'دسترسی به دوربین در این آدرس در دسترس نیست. لطفاً سایت را با آدرس امن باز کنید یا از دکمه اسکن عکس استفاده نمایید.'
        );
        return;
      }

      try {
        const videoConstraints: MediaTrackConstraints = selectedDeviceId
          ? {
              deviceId: { exact: selectedDeviceId },
              width: { ideal: 1920, min: 640 },
              height: { ideal: 1080, min: 480 },
            }
          : {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920, min: 640 },
              height: { ideal: 1080, min: 480 },
            };

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false,
          });
        } catch {
          // Retry with relaxed resolution if device rejects 1080p exact/ideal constraints
          stream = await navigator.mediaDevices.getUserMedia({
            video: selectedDeviceId
              ? { deviceId: { exact: selectedDeviceId } }
              : { facingMode: { ideal: 'environment' } },
            audio: false,
          });
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        activeStream = stream;
        const primaryTrack = stream.getVideoTracks()[0] || null;
        trackRef.current = primaryTrack;

        // Enumerate devices AFTER permission grant so labels are visible on Android
        if (navigator.mediaDevices.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
          if (!cancelled) {
            const { ordered, preferredDeviceId } = orderCamerasForBarcodeScanning(devices);
            setCameras(ordered);

            const currentTrackDeviceId =
              primaryTrack?.getSettings?.().deviceId || '';
            // If Android picked a non-preferred lens (e.g. ultra-wide / macro) on initial auto-open,
            // switch once cleanly to the highest-scored main rear autofocus lens.
            if (
              !selectedDeviceId &&
              !autoSwitchedToMainRef.current &&
              preferredDeviceId &&
              currentTrackDeviceId &&
              preferredDeviceId !== currentTrackDeviceId &&
              ordered.length > 1
            ) {
              autoSwitchedToMainRef.current = true;
              stream.getTracks().forEach((t) => t.stop());
              setSelectedDeviceId(preferredDeviceId);
              return;
            }

            if (!selectedDeviceId && currentTrackDeviceId) {
              setSelectedDeviceId(currentTrackDeviceId);
            }
          }
        }

        // Apply Android hardware autofocus, exposure, zoom, and torch capabilities
        if (primaryTrack && typeof primaryTrack.getCapabilities === 'function') {
          const caps = primaryTrack.getCapabilities() as ExtendedTrackCapabilities;
          setTorchSupported(Boolean(caps?.torch));

          const modes = Array.isArray(caps?.focusMode) ? caps.focusMode : [];
          setFocusSupported(
            modes.includes('continuous') || modes.includes('single-shot') || modes.includes('auto')
          );

          if (caps?.zoom && typeof caps.zoom.max === 'number' && caps.zoom.max > 1.05) {
            const minZ = Math.max(1, Number(caps.zoom.min || 1));
            const maxZ = Math.min(4, Number(caps.zoom.max));
            const stepZ = Number(caps.zoom.step || 0.1);
            setHardwareZoomRange({ min: minZ, max: maxZ, step: stepZ });
            setZoomValue(minZ);
          }

          const advancedConstraints: Record<string, unknown> = {};
          if (modes.includes('continuous')) {
            advancedConstraints.focusMode = 'continuous';
          }
          if (Array.isArray(caps?.exposureMode) && caps.exposureMode.includes('continuous')) {
            advancedConstraints.exposureMode = 'continuous';
          }
          if (
            Array.isArray(caps?.whiteBalanceMode) &&
            caps.whiteBalanceMode.includes('continuous')
          ) {
            advancedConstraints.whiteBalanceMode = 'continuous';
          }
          if (Object.keys(advancedConstraints).length > 0) {
            await primaryTrack
              .applyConstraints({
                advanced: [advancedConstraints as MediaTrackConstraintSet],
              })
              .catch(() => {});
          }
        }

        const videoEl = videoRef.current;
        if (!videoEl) return;

        videoEl.srcObject = stream;
        await videoEl.play().catch(() => {});

        if (cancelled) return;
        setStatus('ready');

        await wasmPromise;
        if (cancelled) return;

        // Optional auxiliary native BarcodeDetector (never replaces WASM; runs alongside, 1D linear only)
        let nativeDetector: {
          detect: (
            source: ImageBitmapSource
          ) => Promise<Array<{ rawValue?: string; format?: string }>>;
        } | null = null;

        const NativeBarcodeDetectorCtor = (
          window as unknown as {
            BarcodeDetector?: {
              new (opts?: { formats?: string[] }): {
                detect: (
                  source: ImageBitmapSource
                ) => Promise<Array<{ rawValue?: string; format?: string }>>;
              };
              getSupportedFormats?: () => Promise<string[]>;
            };
          }
        ).BarcodeDetector;

        if (NativeBarcodeDetectorCtor) {
          try {
            let formatsToUse: string[] = NATIVE_DETECTOR_FORMATS;
            if (typeof NativeBarcodeDetectorCtor.getSupportedFormats === 'function') {
              const supported = await NativeBarcodeDetectorCtor.getSupportedFormats();
              formatsToUse = NATIVE_DETECTOR_FORMATS.filter((f) => supported.includes(f));
            }
            if (formatsToUse.length > 0) {
              nativeDetector = new NativeBarcodeDetectorCtor({ formats: formatsToUse });
            }
          } catch {
            nativeDetector = null;
          }
        }

        let scanning = false;
        const scheduleNextTick = () => {
          if (cancelled) return;
          scanTimer = window.setTimeout(runScanTick, 95);
        };

        const runScanTick = async () => {
          if (cancelled) return;
          const v = videoRef.current;
          const canvas = scanCanvasRef.current;

          if (!v || !canvas || v.readyState < 2 || scanning) {
            scheduleNextTick();
            return;
          }

          scanning = true;
          try {
            const currentPass = passCounter++;
            const imageData = captureVideoScanImageData(
              v,
              canvas,
              currentPass,
              digitalZoomRef.current
            );

            if (imageData) {
              const wasmPromiseRead = decodeImageDataWithWasm(imageData).catch(() => null);
              const nativePromiseRead =
                nativeDetector && currentPass % 2 === 0
                  ? nativeDetector
                      .detect(canvas)
                      .then((items) => {
                        const firstValid = items?.find(
                          (item) => item?.rawValue && isLinearBarcodeFormat(item.format)
                        );
                        return firstValid?.rawValue
                          ? { code: firstValid.rawValue, format: firstValid.format || 'native' }
                          : null;
                      })
                      .catch(() => null)
                  : Promise.resolve(null);

              const [wasmMatch, nativeMatch] = await Promise.all([
                wasmPromiseRead,
                nativePromiseRead,
              ]);

              if (!cancelled) {
                if (wasmMatch?.code) {
                  emitDetection(wasmMatch.code);
                } else if (nativeMatch?.code) {
                  emitDetection(nativeMatch.code);
                }
              }
            }
          } catch {
            // Ignore transient frame failures
          } finally {
            scanning = false;
            scheduleNextTick();
          }
        };

        runScanTick();
      } catch (err: unknown) {
        if (cancelled) return;
        const name = (err as { name?: string })?.name || '';
        setStatus('error');
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setErrorMessage(
            'اجازه دسترسی به دوربین داده نشد. دسترسی دوربین را در تنظیمات مرورگر فعال کنید یا از دکمه اسکن از عکس استفاده نمایید.'
          );
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setErrorMessage('دوربینی روی این دستگاه شناسایی نشد. می‌توانید از اسکن عکس استفاده کنید.');
        } else {
          setErrorMessage(
            'راه‌اندازی دوربین با مشکل مواجه شد. مطمئن شوید دوربین در برنامه دیگری باز نیست.'
          );
        }
      }
    };

    startCameraAndEngine();

    return () => {
      cancelled = true;
      if (scanTimer !== null) {
        window.clearTimeout(scanTimer);
      }
      if (focusResetTimerRef.current !== null) {
        window.clearTimeout(focusResetTimerRef.current);
      }
      if (detectedTimerRef.current !== null) {
        window.clearTimeout(detectedTimerRef.current);
      }
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
      }
      trackRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [active, selectedDeviceId, retryNonce, emitDetection]);

  const handleToggleTorch = async () => {
    const track = trackRef.current;
    if (!track || !torchSupported) return;
    const nextState = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: nextState } as MediaTrackConstraintSet],
      });
      setTorchOn(nextState);
    } catch {
      // Torch constraint rejected on this hardware
    }
  };

  const handleApplyZoom = async (nextZoom: number) => {
    const clamped = hardwareZoomRange
      ? Math.max(hardwareZoomRange.min, Math.min(hardwareZoomRange.max, nextZoom))
      : Math.max(1, Math.min(3, nextZoom));
    setZoomValue(clamped);

    const track = trackRef.current;
    if (hardwareZoomRange && track) {
      try {
        await track.applyConstraints({
          advanced: [{ zoom: clamped } as MediaTrackConstraintSet],
        });
      } catch {
        // Fallback smoothly if zoom constraint fails dynamically
      }
    }
  };

  const handleCycleCamera = () => {
    if (cameras.length < 2) return;
    const currentIdx = cameras.findIndex((c) => c.deviceId === selectedDeviceId);
    const nextCamera = cameras[(currentIdx + 1) % cameras.length];
    if (nextCamera?.deviceId) {
      setSelectedDeviceId(nextCamera.deviceId);
    }
  };

  const handleTapToFocus = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (status !== 'ready') return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const relX = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
    const relY = Math.max(0.05, Math.min(0.95, (e.clientY - rect.top) / rect.height));

    setFocusReticle({ xPct: relX * 100, yPct: relY * 100, active: true });
    if (focusResetTimerRef.current !== null) {
      window.clearTimeout(focusResetTimerRef.current);
    }
    focusResetTimerRef.current = window.setTimeout(() => {
      setFocusReticle(null);
    }, 950);

    const track = trackRef.current;
    if (!track || typeof track.getCapabilities !== 'function') return;

    const caps = track.getCapabilities() as ExtendedTrackCapabilities;
    const modes = Array.isArray(caps?.focusMode) ? caps.focusMode : [];
    const poi = [{ x: relX, y: relY }];

    try {
      if (modes.includes('single-shot')) {
        await track.applyConstraints({
          advanced: [{ focusMode: 'single-shot', pointsOfInterest: poi } as MediaTrackConstraintSet],
        });
        if (modes.includes('continuous')) {
          window.setTimeout(() => {
            trackRef.current
              ?.applyConstraints({
                advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
              })
              .catch(() => {});
          }, 700);
        }
      } else if (modes.includes('continuous')) {
        await track.applyConstraints({
          advanced: [{ focusMode: 'continuous', pointsOfInterest: poi } as MediaTrackConstraintSet],
        });
      }
    } catch {
      // Some Android WebViews disallow pointsOfInterest; try focusMode pulse alone
      if (modes.includes('single-shot') && modes.includes('continuous')) {
        track
          .applyConstraints({
            advanced: [{ focusMode: 'single-shot' } as MediaTrackConstraintSet],
          })
          .then(() => {
            window.setTimeout(() => {
              trackRef.current
                ?.applyConstraints({
                  advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
                })
                .catch(() => {});
            }, 600);
          })
          .catch(() => {});
      }
    }
  };

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setPhotoStatus({ type: 'scanning', text: 'در حال تحلیل تصویر و خواندن بارکد...' });
    try {
      const match = await decodeBarcodeFromImageFile(file);
      if (match?.code) {
        setPhotoStatus({
          type: 'success',
          text: `بارکد ${match.code} از تصویر خوانده شد`,
        });
        emitDetection(match.code);
        window.setTimeout(() => setPhotoStatus(null), 2600);
      } else {
        setPhotoStatus({
          type: 'error',
          text: 'بارکدی در تصویر یافت نشد. نزدیک‌تر و با نور کافی عکس بگیرید.',
        });
        window.setTimeout(() => setPhotoStatus(null), 3800);
      }
    } catch {
      setPhotoStatus({
        type: 'error',
        text: 'خطا در خواندن فایل تصویر؛ لطفاً دوباره امتحان کنید.',
      });
      window.setTimeout(() => setPhotoStatus(null), 3500);
    }
  };

  const currentCameraIndex = Math.max(
    0,
    cameras.findIndex((c) => c.deviceId === selectedDeviceId)
  );
  const zoomMax = hardwareZoomRange ? hardwareZoomRange.max : 3;
  const zoomMin = hardwareZoomRange ? hardwareZoomRange.min : 1;
  const zoomStep = hardwareZoomRange ? hardwareZoomRange.step : 0.25;
  const zoomPresets = [1, 1.5, 2].filter((z) => z >= zoomMin - 0.01 && z <= zoomMax + 0.01);
  const isUsingDigitalZoom = !hardwareZoomRange && zoomValue > 1.01;

  return (
    <div className="space-y-2">
      <div
        className={`relative w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 select-none ${
          compact ? 'h-64 sm:h-72' : 'h-72 sm:h-80'
        }`}
      >
        {/* Interactive Tap-to-Focus Video Surface */}
        <div
          onClick={handleTapToFocus}
          className="relative w-full h-full cursor-crosshair overflow-hidden"
        >
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            style={
              isUsingDigitalZoom
                ? { transform: `scale(${zoomValue})`, transformOrigin: 'center center' }
                : undefined
            }
            className="w-full h-full object-cover transition-transform duration-150 ease-out"
          />

          {/* Top Scrim & Minimal Status/Lens Row */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute top-0 inset-x-0 p-2.5 bg-gradient-to-b from-slate-950/85 via-slate-950/40 to-transparent flex items-center justify-between gap-2 z-10"
          >
            <div className="flex items-center gap-2 text-xs text-slate-200 font-medium min-w-0">
              <span className="truncate">
                {status !== 'ready'
                  ? 'در حال اتصال به دوربین...'
                  : wasmReady === 'error'
                  ? 'خطا در بارگذاری موتور اسکن'
                  : wasmReady === 'loading'
                  ? 'در حال آماده‌سازی موتور اسکن...'
                  : focusSupported
                  ? 'فوکوس خودکار فعال · فقط بارکد خطی'
                  : 'اسکن زنده فعال · فقط بارکد خطی'}
              </span>
            </div>

            {cameras.length > 1 && (
              <button
                type="button"
                onClick={handleCycleCamera}
                title="تعویض لنز دوربین"
                className="min-h-[40px] min-w-[40px] px-3 py-1.5 rounded-xl bg-slate-950/80 hover:bg-slate-900 text-slate-100 border border-slate-700/80 text-xs font-medium inline-flex items-center gap-1.5 transition whitespace-nowrap shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>
                  لنز {toPersianDigits(currentCameraIndex + 1)}/{toPersianDigits(cameras.length)}
                </span>
              </button>
            )}
          </div>

          {/* Central Viewfinder Reticle */}
          {status === 'ready' && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-10">
              <div
                className={`relative w-72 max-w-[82%] h-36 rounded-xl border transition-colors duration-150 ${
                  detectedPulse
                    ? 'border-emerald-400 bg-emerald-500/10'
                    : 'border-indigo-400/45 bg-slate-950/10'
                }`}
              >
                <span
                  className={`absolute -top-0.5 -right-0.5 w-6 h-6 border-t-[3px] border-r-[3px] rounded-tr-lg transition-colors duration-150 ${
                    detectedPulse ? 'border-emerald-300' : 'border-emerald-400'
                  }`}
                />
                <span
                  className={`absolute -top-0.5 -left-0.5 w-6 h-6 border-t-[3px] border-l-[3px] rounded-tl-lg transition-colors duration-150 ${
                    detectedPulse ? 'border-emerald-300' : 'border-emerald-400'
                  }`}
                />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-[3px] border-r-[3px] rounded-br-lg transition-colors duration-150 ${
                    detectedPulse ? 'border-emerald-300' : 'border-emerald-400'
                  }`}
                />
                <span
                  className={`absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-[3px] border-l-[3px] rounded-bl-lg transition-colors duration-150 ${
                    detectedPulse ? 'border-emerald-300' : 'border-emerald-400'
                  }`}
                />
                <div
                  className={`absolute inset-x-3 top-1/2 -translate-y-1/2 h-[2px] transition-colors duration-150 ${
                    detectedPulse ? 'bg-emerald-300' : 'bg-emerald-400/75'
                  }`}
                />
              </div>
            </div>
          )}

          {/* Animated Tap-to-Focus Ring */}
          {focusReticle && (
            <div
              style={{
                left: `${focusReticle.xPct}%`,
                top: `${focusReticle.yPct}%`,
              }}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full border-2 border-amber-400 flex items-center justify-center animate-ping"
            >
              <Focus className="w-4 h-4 text-amber-300" />
            </div>
          )}

          {/* Bottom Thumb-Zone Controls Bar */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-0 inset-x-0 px-2.5 pt-5 pb-2.5 bg-gradient-to-t from-slate-950/95 via-slate-950/75 to-transparent flex flex-wrap items-center justify-between gap-2 z-10"
          >
            {/* Flash + Photo/Gallery Scan Buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              {torchSupported && (
                <button
                  type="button"
                  onClick={handleToggleTorch}
                  title={torchOn ? 'خاموش کردن چراغ‌قوه' : 'روشن کردن چراغ‌قوه'}
                  aria-label={torchOn ? 'خاموش کردن چراغ‌قوه' : 'روشن کردن چراغ‌قوه'}
                  className={`min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
                    torchOn
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-900/90 text-slate-100 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  <Flashlight className="w-4 h-4" />
                  <span>فلش</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                title="گرفتن عکس یا انتخاب تصویر از گالری"
                className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-100 border border-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition whitespace-nowrap"
              >
                <ImagePlus className="w-4 h-4 text-indigo-400" />
                <span>اسکن از عکس</span>
              </button>
            </div>

            {/* Hardware / Digital Zoom Presets + Slider */}
            {status === 'ready' && (
              <div className="flex items-center gap-1.5 flex-1 min-w-[165px] max-w-[270px] justify-end">
                <ZoomIn className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden sm:block" />
                <div className="flex items-center gap-1 bg-slate-900/90 p-0.5 rounded-xl border border-slate-700/80">
                  {zoomPresets.map((preset) => {
                    const isActive = Math.abs(zoomValue - preset) < 0.12;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleApplyZoom(preset)}
                        className={`min-h-[36px] min-w-[36px] px-2 rounded-lg text-[11px] font-mono tabular-nums font-bold transition ${
                          isActive
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {preset}x
                      </button>
                    );
                  })}
                </div>
                <input
                  type="range"
                  aria-label="بزرگ‌نمایی دوربین"
                  min={zoomMin}
                  max={zoomMax}
                  step={zoomStep}
                  value={zoomValue}
                  onChange={(e) => handleApplyZoom(Number(e.target.value))}
                  dir="ltr"
                  className="w-20 sm:w-24 accent-indigo-500 cursor-pointer"
                />
              </div>
            )}
          </div>
        </div>

        {/* Initializing Overlay */}
        {status === 'initializing' && (
          <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-2 text-slate-300 text-xs z-20">
            <Camera className="w-7 h-7 text-indigo-400 animate-pulse" />
            <span>در حال فعال‌سازی دوربین و موتور اسکن پرسرعت...</span>
          </div>
        )}

        {/* Error Overlay (keeps Photo Scan available even if live camera is blocked) */}
        {status === 'error' && (
          <div className="absolute inset-0 bg-slate-950/95 p-4 flex flex-col items-center justify-center text-center gap-3 z-20">
            <AlertCircle className="w-7 h-7 text-rose-400" />
            <p className="text-xs text-rose-200 max-w-sm leading-relaxed">{errorMessage}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setRetryNonce((n) => n + 1)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold inline-flex items-center gap-1.5 transition"
              >
                <RefreshCw className="w-4 h-4" />
                <span>تلاش مجدد دوربین</span>
              </button>

              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-bold inline-flex items-center gap-1.5 transition"
              >
                <ImagePlus className="w-4 h-4 text-indigo-400" />
                <span>گرفتن عکس / انتخاب از گالری</span>
              </button>
            </div>
          </div>
        )}

        {/* Hidden Image File Picker (supports both Camera capture and Gallery on Android) */}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoFileChange}
          className="hidden"
        />
      </div>

      {/* Inline Photo Scan Feedback or Tap-to-Focus Hint */}
      {photoStatus ? (
        <div
          className={`px-3 py-2 rounded-xl border text-xs flex items-center gap-2 ${
            photoStatus.type === 'error'
              ? 'bg-rose-950/50 border-rose-800/70 text-rose-200'
              : photoStatus.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-800/70 text-emerald-200'
              : 'bg-indigo-950/50 border-indigo-800/70 text-indigo-200'
          }`}
        >
          {photoStatus.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : photoStatus.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
          )}
          <span>{photoStatus.text}</span>
        </div>
      ) : (
        <p className="text-[11px] text-slate-400">
          برای بارکدهای ریز می‌توانید روی تصویر لمس کنید تا فوکوس شود، زوم را روی 1.5x یا 2x بگذارید یا با «اسکن از عکس» عکس شفاف بگیرید.
        </p>
      )}
    </div>
  );
};
