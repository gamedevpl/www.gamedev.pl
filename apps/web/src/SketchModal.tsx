import { useRef, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon';

type SketchModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSaveSketch: (dataUrl: string) => void;
};

const PALETTE = [
  '#00e4ac', // Turquoise
  '#38bdf8', // Blue
  '#f43f5e', // Red/Pink
  '#facc15', // Yellow
  '#a855f7', // Purple
  '#ffffff', // White
  '#000000', // Black
];

const BRUSH_SIZES = [
  { label: 'S', size: 3 },
  { label: 'M', size: 7 },
  { label: 'L', size: 15 },
];

export function SketchModal({ isOpen, onClose, onSaveSketch }: SketchModalProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState(PALETTE[0]);
  const [brushSize, setBrushSize] = useState(7);
  const [isEraser, setIsEraser] = useState(false);
  const [history, setHistory] = useState<ImageData[]>([]);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0b1017';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const initialData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory([initialData]);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(initCanvas, 50);
    }
  }, [isOpen, initCanvas]);

  if (!isOpen) return null;

  const saveStateToHistory = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory((prev) => [...prev, data]);
  };

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      if (e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      }
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCanvasCoords(e);
    ctx.strokeStyle = isEraser ? '#0b1017' : color;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      saveStateToHistory();
    }
  };

  const handleUndo = () => {
    if (history.length <= 1) return;
    const newHistory = history.slice(0, -1);
    const lastState = newHistory[newHistory.length - 1];
    setHistory(newHistory);

    const canvas = canvasRef.current;
    if (!canvas || !lastState) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(lastState, 0, 0);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#0b1017';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    saveStateToHistory();
  };

  const handleAttach = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSaveSketch(dataUrl);
    onClose();
  };

  return (
    <div className="sketch-modal-backdrop" onClick={onClose}>
      <div className="sketch-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="sketch-modal-header">
          <div>
            <h3 className="sketch-modal-title">
              <PixelIcon name="palette" size={18} /> {t('sketch.title')}
            </h3>
            <p className="sketch-modal-subtitle">{t('sketch.subtitle')}</p>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <PixelIcon name="close" size={16} />
          </button>
        </div>

        <div className="sketch-canvas-container">
          <canvas
            ref={canvasRef}
            width={520}
            height={340}
            className="sketch-canvas"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
        </div>

        <div className="sketch-toolbar">
          <div className="tool-group">
            <button
              type="button"
              className={`tool-btn ${!isEraser ? 'active' : ''}`}
              onClick={() => setIsEraser(false)}
            >
              <PixelIcon name="pencil" size={14} /> {t('sketch.pencil')}
            </button>
            <button type="button" className={`tool-btn ${isEraser ? 'active' : ''}`} onClick={() => setIsEraser(true)}>
              <PixelIcon name="eraser" size={14} /> {t('sketch.eraser')}
            </button>
          </div>

          <div className="tool-group palette-group">
            {PALETTE.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className={`color-swatch ${color === swatch && !isEraser ? 'selected' : ''}`}
                style={{ backgroundColor: swatch }}
                onClick={() => {
                  setColor(swatch);
                  setIsEraser(false);
                }}
                aria-label={`Select color ${swatch}`}
              />
            ))}
          </div>

          <div className="tool-group size-group">
            {BRUSH_SIZES.map(({ label, size }) => (
              <button
                key={size}
                type="button"
                className={`size-btn ${brushSize === size ? 'active' : ''}`}
                onClick={() => setBrushSize(size)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="tool-group action-group">
            <button type="button" className="action-btn" onClick={handleUndo} disabled={history.length <= 1}>
              <PixelIcon name="undo" size={14} /> {t('sketch.undo')}
            </button>
            <button type="button" className="action-btn danger" onClick={handleClear}>
              <PixelIcon name="trash" size={14} /> {t('sketch.clear')}
            </button>
          </div>
        </div>

        <div className="sketch-modal-footer">
          <button type="button" className="secondary-btn" onClick={onClose}>
            {t('sketch.cancel')}
          </button>
          <button type="button" className="primary-btn attach-btn" onClick={handleAttach}>
            <PixelIcon name="sparkle" size={14} /> {t('sketch.attach')}
          </button>
        </div>
      </div>
    </div>
  );
}
