'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Camera, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

  const startCamera = async () => {
    setIsInitializing(true);
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
      // Clean up camera stream tracks when unmounting
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleCapture = () => {
    if (!videoRef.current) return;

    try {
      const video = videoRef.current;
      const originalWidth = video.videoWidth || 640;
      const originalHeight = video.videoHeight || 480;

      // Optimize for high concurrency & free-tier storage:
      // Scale to max width 640px (crisp portrait headshot, ~35KB vs ~300KB)
      const targetWidth = Math.min(640, originalWidth);
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

      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

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
        0.8
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
          className="w-full h-full object-cover transform scale-x-[-1]"
        />

        {/* Guiding Oval Target */}
        {hasPermission && !isInitializing && (
          <div className="absolute inset-0 pointer-events-none border-2 border-white/20 rounded-xl m-6 flex items-center justify-center">
            <div className="w-48 h-60 border-2 border-dashed border-white/50 rounded-full"></div>
          </div>
        )}
      </div>

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
          disabled={isInitializing || !!errorMessage}
          className="px-8 shadow-md"
        >
          <Camera className="w-5 h-5 mr-2" />
          Capture Photo
        </Button>
      </div>
    </div>
  );
}
