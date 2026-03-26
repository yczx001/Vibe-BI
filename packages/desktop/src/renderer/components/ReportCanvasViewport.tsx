import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface ReportCanvasViewportProps {
  children: React.ReactNode;
  contentKey?: string | number | null;
  width?: number;
  height?: number;
  zoomMode: 'fit' | 'manual';
  fitZoomPercent: number;
  manualZoomPercent: number;
  onZoomModeChange: (mode: 'fit' | 'manual') => void;
  onFitZoomPercentChange: (value: number) => void;
  onManualZoomPercentChange: (value: number) => void;
}

const MIN_ZOOM_PERCENT = 30;
const MAX_ZOOM_PERCENT = 180;
const FIT_MARGIN = 88;
const FIT_SCALE_FACTOR = 0.94;
const CANVAS_PADDING = 28;
const WORKSPACE_SCROLL_GUTTER_X = 160;
const WORKSPACE_SCROLL_GUTTER_Y = 120;

function clampZoom(value: number): number {
  if (!Number.isFinite(value)) {
    return 100;
  }

  return Math.max(MIN_ZOOM_PERCENT, Math.min(MAX_ZOOM_PERCENT, Math.round(value)));
}

export function ReportCanvasViewport({
  children,
  contentKey,
  width = 1920,
  height = 1080,
  zoomMode,
  fitZoomPercent,
  manualZoomPercent,
  onZoomModeChange,
  onFitZoomPercentChange,
  onManualZoomPercentChange,
}: ReportCanvasViewportProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  const effectiveZoomPercent = zoomMode === 'fit' ? fitZoomPercent : manualZoomPercent;
  const scale = effectiveZoomPercent / 100;
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  const workspaceWidth = Math.max(
    Math.ceil(scaledWidth + CANVAS_PADDING * 2),
    viewportSize.width + WORKSPACE_SCROLL_GUTTER_X
  );
  const workspaceHeight = Math.max(
    Math.ceil(scaledHeight + CANVAS_PADDING * 2),
    viewportSize.height + WORKSPACE_SCROLL_GUTTER_Y
  );
  const canvasLeft = Math.max(CANVAS_PADDING, Math.round((workspaceWidth - scaledWidth) / 2));
  const canvasTop = CANVAS_PADDING;

  useEffect(() => {
    onZoomModeChange('fit');
  }, [contentKey, onZoomModeChange]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return undefined;
    }

    const updateFitZoom = () => {
      const nextSize = {
        width: Math.max(viewport.clientWidth, 0),
        height: Math.max(viewport.clientHeight, 0),
      };
      setViewportSize((previous) => (
        previous.width === nextSize.width && previous.height === nextSize.height
          ? previous
          : nextSize
      ));

      const availableWidth = Math.max(nextSize.width - FIT_MARGIN - CANVAS_PADDING * 2, width * 0.45);
      const nextFitZoom = clampZoom(Math.min((availableWidth / width) * 100 * FIT_SCALE_FACTOR, 100));
      onFitZoomPercentChange(nextFitZoom);
    };

    updateFitZoom();

    const observer = new ResizeObserver(() => {
      updateFitZoom();
    });
    observer.observe(viewport);

    return () => observer.disconnect();
  }, [onFitZoomPercentChange, width]);

  useEffect(() => {
    if (!isPanning) {
      return undefined;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const viewport = viewportRef.current;
      const panState = panRef.current;
      if (!viewport || !panState) {
        return;
      }

      viewport.scrollLeft = panState.scrollLeft - (event.clientX - panState.startX);
      viewport.scrollTop = panState.scrollTop - (event.clientY - panState.startY);
    };

    const stopPanning = () => {
      setIsPanning(false);
      panRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopPanning);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopPanning);
    };
  }, [isPanning]);

  const applyManualZoom = (nextZoom: number) => {
    const clamped = clampZoom(nextZoom);
    onZoomModeChange('manual');
    onManualZoomPercentChange(clamped);
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest('button, input, textarea, select, option, a, [role="button"]')) {
      return;
    }

    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    panRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    setIsPanning(true);
    event.preventDefault();
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!(event.ctrlKey || event.metaKey)) {
      return;
    }

    event.preventDefault();
    applyManualZoom(effectiveZoomPercent + (event.deltaY < 0 ? 8 : -8));
  };

  const containerStyle = useMemo<React.CSSProperties>(() => ({
    width,
    height,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    background: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    border: '1px solid rgba(20, 37, 56, 0.14)',
    boxShadow: '0 24px 60px rgba(15, 23, 42, 0.12)',
  }), [height, scale, width]);

  return (
    <div
      style={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        ref={viewportRef}
        className="vibe-report-canvas-scroll-region"
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        style={{
          height: '100%',
          minHeight: 0,
          overflowX: 'scroll',
          overflowY: 'scroll',
          borderRadius: 16,
          border: `1px solid ${shellPalette.border}`,
          background: `
            linear-gradient(180deg, rgba(255,255,255,0.58) 0%, rgba(244,247,250,0.86) 100%),
            repeating-linear-gradient(
              0deg,
              rgba(148, 163, 184, 0.08) 0,
              rgba(148, 163, 184, 0.08) 1px,
              transparent 1px,
              transparent 20px
            ),
            repeating-linear-gradient(
              90deg,
              rgba(148, 163, 184, 0.08) 0,
              rgba(148, 163, 184, 0.08) 1px,
              transparent 1px,
              transparent 20px
            )
          `,
          cursor: isPanning ? 'grabbing' : 'grab',
          userSelect: isPanning ? 'none' : 'auto',
          scrollbarGutter: 'stable both-edges',
          scrollbarWidth: 'thin',
          scrollbarColor: `${shellPalette.borderStrong} rgba(255,255,255,0.52)`,
          overscrollBehavior: 'contain',
        }}
      >
        <div
          style={{
            width: workspaceWidth,
            height: workspaceHeight,
            minWidth: '100%',
            minHeight: '100%',
            position: 'relative',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: canvasLeft,
              top: canvasTop,
              width: scaledWidth,
              height: scaledHeight,
              flexShrink: 0,
            }}
          >
            <div style={containerStyle}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
