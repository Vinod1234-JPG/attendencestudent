'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Camera, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Capture settings: a 960px-wide frame stays sharp on a large display; frames darker than this are rejected.
const CAPTURE_MAX_WIDTH = 960;
const JPEG_QUALITY = 0.85;
const MIN_BRIGHTNESS = 40; // mean luminance, 0-255
const WARMUP_MS = 600; // let the camera's auto-exposure settle after the first frame

/** Mean luminance (0-255) of a canvas, sampled on a small copy for speed. */
function meanBrightness(source: HTMLCanvasElement): number {
  const sample = document.createElement('canvas');
  sample.width = 48;
  sample.height = 36;
  const ctx = sample.getContext('2d');
  if (!ctx) return 255; // cannot measure: do not block the capture
  ctx.drawImage(source, 0, 0, sample.width, sample.height);
  const { data } = ctx.getImageData(0, 0, sample.width, sample.height);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return sum / (data.length / 4);
}

interface CameraViewProps {
  onCapture: (blob: Blob, dataUrl: string) => void;
  onCancel: () => void;
}

export function CameraView({ onCapture, onCancel }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [captureWarning, setCaptureWarning] = useState<string | null>(null);
  const warmupRef = useRef<number | null>(null);

  // Enable capture only once real frames are flowing, plus a short warm-up for auto-exposure.
  const handlePlaying = () => {
    if (warmupRef.current) window.clearTimeout(warmupRef.current);
    warmupRef.current = window.setTimeout(() => {
      const v = videoRef.current;
      if (v && v.readyState >= 2 && v.videoWidth > 0) setIsReady(true);
    }, WARMUP_MS);
  };

  const startCamera = async () => {
    setIsInitializing(true);
    setIsReady(false);
    setCaptureWarning(null);
    setErrorMessage(null);

    // Stop existing tracks if any
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported by this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setHasPermission(true);
    } catch (err: any) {
      console.error('Camera initialization failed:', err);
      setHasPermission(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage('Camera access was denied. Please allow camera permissions in your browser address bar.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorMessage('No camera hardware was detected on this device.');
      } else {
        setErrorMessage(err.message || 'Unable to initialize camera preview.');
      }
    } finally {
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    startCamera();

    return () => {
      if (warmupRef.current) window.clearTimeout(warmupRef.current);
      // Clean up camera stream tracks when unmounting
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !isReady || video.readyState < 2 || video.videoWidth === 0) return;
    setCaptureWarning(null);

    try {
      const originalWidth = video.videoWidth || 640;
      const originalHeight = video.videoHeight || 480;

      // Scale to a max width of 960px: sharp on a large screen without bloating storage.
      const targetWidth = Math.min(CAPTURE_MAX_WIDTH, originalWidth);
      const targetHeight = Math.round((originalHeight / originalWidth) * targetWidth);

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context unavailable');

      // Flip horizontal to match mirrored webcam preview
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Reject near-black frames (camera still waking up, covered lens, or a dark room).
      if (meanBrightness(canvas) < MIN_BRIGHTNESS) {
        setCaptureWarning('Photo is too dark — please face the light and retake.');
        return; // keep the camera running; nothing is captured
      }

      const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            // Stop camera tracks after successful capture
            if (streamRef.current) {
              streamRef.current.getTracks().forEach((t) => t.stop());
            }
            onCapture(blob, dataUrl);
          } else {
            setErrorMessage('Failed to capture frame. Please try again.');
          }
        },
        'image/jpeg',
        JPEG_QUALITY
      );
    } catch (err: any) {
      setErrorMessage(err.message || 'Capture failed.');
    }
  };

  const handleCancelClick = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    onCancel();
  };

  return (
    <div className="flex flex-col items-center max-w-xl mx-auto w-full">
      <div className="text-center mb-4">
        <h3 className="text-xl font-bold text-[#142D4E]">Capture Attendance Photograph</h3>
        <p className="text-xs text-[#667085] mt-1">
          Position your face clearly within the frame and click <strong>Capture Photo</strong>.
        </p>
      </div>

      {/* Video Container Frame */}
      <div className="relative w-full aspect-video max-h-[380px] bg-black rounded-2xl overflow-hidden border-4 border-[#142D4E] shadow-lg flex items-center justify-center">
        {isInitializing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0B1B30] text-white p-6 z-10">
            <RefreshCw className="w-8 h-8 text-[#2864B4] animate-spin mb-3" />
            <p className="text-xs text-[#EAF2FC]">Initializing camera sensor...</p>
          </div>
        )}

        {errorMessage && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0B1B30] text-white p-6 text-center z-10">
            <AlertCircle className="w-10 h-10 text-[#C0393A] mb-3" />
            <p className="text-sm font-semibold text-white mb-2">Camera Unavailable</p>
            <p className="text-xs text-[#CBD5E1] max-w-sm mb-4">{errorMessage}</p>
            <Button variant="secondary" size="sm" onClick={startCamera}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Try Again
            </Button>
          </div>
        )}

        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onPlaying={handlePlaying}
          className="w-full h-full object-cover transform scale-x-[-1]"
        />

        {/* Guiding Oval Target */}
        {hasPermission && !isInitializing && (
          <div className="absolute inset-0 pointer-events-none border-2 border-white/20 rounded-xl m-6 flex items-center justify-center">
            <div className="w-48 h-60 border-2 border-dashed border-white/50 rounded-full"></div>
          </div>
        )}
      </div>

      {captureWarning && (
        <div
          role="alert"
          className="mt-4 w-full flex items-center gap-2 rounded-lg border border-[#C0393A]/30 bg-[#FEF3F2] px-3.5 py-2.5 text-sm text-[#B42318]"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{captureWarning}</span>
        </div>
      )}
      {!captureWarning && hasPermission && !isInitializing && !isReady && (
        <p className="mt-4 text-xs text-[#667085]">Getting the camera ready…</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 mt-6 w-full justify-center">
        <Button
          variant="outline"
          size="lg"
          onClick={handleCancelClick}
          disabled={isInitializing}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="xl"
          onClick={handleCapture}
          disabled={isInitializing || !!errorMessage || !isReady}
          className="px-8 shadow-md"
        >
          <Camera className="w-5 h-5 mr-2" />
          Capture Photo
        </Button>
      </div>
    </div>
  );
}
