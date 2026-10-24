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

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw frame onto canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          // Stop video tracks immediately upon capture
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
          }
          onCapture(blob, dataUrl);
        }
      },
      'image/jpeg',
      0.85
    );
  };

  return (
    <div className="flex flex-col items-center max-w-xl mx-auto w-full">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold text-[#142D4E]">Capture Attendance Photograph</h2>
        <p className="text-sm text-[#667085] mt-1">
          Position your face clearly within the frame and click Capture Photo.
        </p>
      </div>

      {/* Video Viewport / Error Fallback */}
      <div className="relative w-full aspect-[4/3] bg-[#0B1B30] rounded-xl overflow-hidden shadow-md border-2 border-[#142D4E]/20 flex items-center justify-center">
        {isInitializing && (
          <div className="text-center text-white p-4">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-[#2864B4]" />
            <p className="text-sm">Initializing camera preview...</p>
          </div>
        )}

        {!isInitializing && errorMessage && (
          <div className="p-6 text-center text-white max-w-sm">
            <AlertCircle className="w-10 h-10 text-[#C0393A] mx-auto mb-3" />
            <p className="text-sm font-medium mb-4">{errorMessage}</p>
            <Button variant="secondary" size="sm" onClick={startCamera}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry Camera
            </Button>
          </div>
        )}

        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transform scale-x-[-1] ${
            isInitializing || errorMessage ? 'hidden' : 'block'
          }`}
        />

        {/* Framing guide overlay */}
        {!isInitializing && !errorMessage && (
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
          onClick={onCancel}
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
