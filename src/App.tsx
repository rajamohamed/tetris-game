// src/App.tsx – Tetris AAA Experience (Stable Version)
import React, { useEffect, useRef, useState, useCallback } from 'react';

// Constants
const ROWS = 20;
const COLS = 10;
const BLOCK = 30;
const START_SPEED = 500;
const PREVIEW_X = COLS * BLOCK + 20;
const HOLD_X = -120;

// Color palette (O, I, T, S, Z, L, J)
const COLORS = [
  '#FFD700', // O - Gold
  '#00E5FF', // I - Cyan
  '#A335EE', // T - Purple
  '#3CFF3C', // S - Green
  '#FF4949', // Z - Red
  '#FF9B00', // L - Orange
  '#3C59FF'  // J - Blue
];

// Piece type
type Piece = { 
  shape: number[][]; 
  x: number; 
  y: number; 
  colorIdx: number;
};

// Tetromino shapes
const SHAPES: number[][][] = [
  [[1,1],[1,1]], // O
  [[1,1,1,1]],   // I
  [[0,1,0],[1,1,1]], // T
  [[0,1,1],[1,1,0]], // S
  [[1,1,0],[0,1,1]], // Z
  [[1,0,0],[1,1,1]], // L
  [[0,0,1],[1,1,1]], // J
];

// Utilities
const emptyGrid = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0));

// Simple piece bag system
class PieceBag {
  private bag: number[] = [];
  
  constructor() {
    this.refillBag();
  }
  
  private refillBag() {
    this.bag = [0,1,2,3,4,5,6];
    // Fisher-Yates shuffle
    for (let i = this.bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
    }
  }
  
  next(): Piece {
    if (this.bag.length === 0) this.refillBag();
    const colorIdx = this.bag.pop()!;
    const shape = SHAPES[colorIdx];
    return { 
      shape, 
      x: Math.floor((COLS-shape[0].length)/2), 
      y: 0, 
      colorIdx
    };
  }
}

// Simple rotation function
const rotate = (shape: number[][]): number[][] => {
  const rows = shape.length;
  const cols = shape[0].length;
  const rotated = Array.from({ length: cols }, () => Array(rows).fill(0));
  
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      rotated[j][rows - 1 - i] = shape[i][j];
    }
  }
  
  return rotated;
};

// Collision detection
const collides = (grid: number[][], piece: Piece): boolean => {
  return piece.shape.some((row, dy) => 
    row.some((cell, dx) => {
      if (!cell) return false;
      const newX = piece.x + dx;
      const newY = piece.y + dy;
      return newX < 0 || newX >= COLS || newY >= ROWS || (newY >= 0 && grid[newY][newX]);
    })
  );
};

// Ghost piece calculation
const getGhostPiece = (piece: Piece, grid: number[][]): Piece => {
  let ghost = { ...piece };
  while (!collides(grid, { ...ghost, y: ghost.y + 1 })) {
    ghost.y++;
  }
  return ghost;
};

// Line clearing
const clearLines = (grid: number[][]): { newGrid: number[][], cleared: number } => {
  const kept = grid.filter(row => row.some(cell => cell === 0));
  const cleared = ROWS - kept.length;
  
  while (kept.length < ROWS) {
    kept.unshift(Array(COLS).fill(0));
  }
  
  return { newGrid: kept, cleared };
};

// Scoring system
const calculateScore = (lines: number, level: number): number => {
  let baseScore = 0;
  if (lines === 1) baseScore = 100;
  else if (lines === 2) baseScore = 300;
  else if (lines === 3) baseScore = 500;
  else if (lines === 4) baseScore = 800; // Tetris!
  
  return baseScore * (level + 1);
};

// Mobile detection
const isMobile = () => /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);

export default function App() {
  // Refs
  const gameCanvas = useRef<HTMLCanvasElement>(null);
  const audioCanvas = useRef<HTMLCanvasElement>(null);
  const audioEl = useRef<HTMLAudioElement>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const gameOverAudio = useRef<HTMLAudioElement>(null);

  // Game state
  const [grid, setGrid] = useState<number[][]>(emptyGrid());
  const [piece, setPiece] = useState<Piece | null>(null);
  const [nextPieces, setNextPieces] = useState<Piece[]>([]);
  const [holdPiece, setHoldPiece] = useState<Piece | null>(null);
  const [canHold, setCanHold] = useState(true);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(0);
  const [lines, setLines] = useState(0);
  const [started, setStarted] = useState(false);
  const [over, setOver] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  // Piece bag
  const pieceBag = useRef<PieceBag>(new PieceBag());

  // Initialize game
  useEffect(() => {
    setIsMobileDevice(isMobile());
    
    // Initialize piece bag and first pieces
    const initialPieces = [pieceBag.current.next(), pieceBag.current.next(), pieceBag.current.next()];
    setNextPieces(initialPieces);
    setPiece(initialPieces[0]);
  }, []);

  // Lock piece and spawn new one
  const lockPiece = useCallback(() => {
    if (!piece) return;
    
    const merged = grid.map(row => [...row]);
    piece.shape.forEach((row, dy) => {
      row.forEach((cell, dx) => {
        if (cell && piece.y + dy >= 0) {
          merged[piece.y + dy][piece.x + dx] = piece.colorIdx + 1;
        }
      });
    });
    
    const { newGrid, cleared } = clearLines(merged);
    setGrid(newGrid);
    
    if (cleared > 0) {
      const newScore = calculateScore(cleared, level);
      setScore(s => s + newScore);
      setLines(l => l + cleared);
    }
    
    // Spawn new piece
    const newPiece = nextPieces[0];
    const newNextPieces = [...nextPieces.slice(1), pieceBag.current.next()];
    setNextPieces(newNextPieces);
    setPiece(newPiece);
    setCanHold(true);
    
    // Check game over
    if (collides(newGrid, newPiece)) {
      setOver(true);
    }
  }, [piece, grid, level, nextPieces]);

  // Rotate piece
  const rotatePiece = useCallback(() => {
    if (!piece) return;
    const rotatedShape = rotate(piece.shape);
    const rotatedPiece = { ...piece, shape: rotatedShape };
    
    if (!collides(grid, rotatedPiece)) {
      setPiece(rotatedPiece);
    }
  }, [piece, grid]);

  // Hard drop
  const hardDrop = useCallback(() => {
    if (!piece) return;
    let droppedPiece = { ...piece };
    let dropDistance = 0;
    
    while (!collides(grid, { ...droppedPiece, y: droppedPiece.y + 1 })) {
      droppedPiece.y++;
      dropDistance++;
    }
    
    setPiece(droppedPiece);
    setScore(s => s + dropDistance * 2);
  }, [piece, grid]);

  // Hold piece
  const holdPieceAction = useCallback(() => {
    if (!piece || !canHold) return;
    
    if (holdPiece) {
      const newHold = { ...piece, x: Math.floor((COLS - piece.shape[0].length) / 2), y: 0 };
      setPiece({ ...holdPiece, x: Math.floor((COLS - holdPiece.shape[0].length) / 2), y: 0 });
      setHoldPiece(newHold);
    } else {
      setHoldPiece({ ...piece, x: Math.floor((COLS - piece.shape[0].length) / 2), y: 0 });
      const newPiece = nextPieces[0];
      const newNextPieces = [...nextPieces.slice(1), pieceBag.current.next()];
      setNextPieces(newNextPieces);
      setPiece(newPiece);
    }
    setCanHold(false);
  }, [piece, holdPiece, canHold, nextPieces]);

  // Gravity loop
  useEffect(() => {
    if (!started || over || paused || !piece) return;
    
    const speed = Math.max(100, START_SPEED - level * 30);
    const id = setInterval(() => {
      setPiece(p => {
        if (!p) return p;
        const next = { ...p, y: p.y + 1 };
        if (collides(grid, next)) {
          lockPiece();
          return p;
        }
        return next;
      });
    }, speed);
    
    return () => clearInterval(id);
  }, [grid, level, started, over, paused, piece, lockPiece]);

  // Level progression
  useEffect(() => {
    const newLevel = Math.floor(lines / 10);
    if (newLevel !== level) {
      setLevel(newLevel);
    }
  }, [lines, level]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!started || over || paused) return;
      
      switch (e.key) {
        case 'ArrowLeft':
          setPiece(p => {
            if (!p) return p;
            const newPiece = { ...p, x: p.x - 1 };
            return collides(grid, newPiece) ? p : newPiece;
          });
          break;
        case 'ArrowRight':
          setPiece(p => {
            if (!p) return p;
            const newPiece = { ...p, x: p.x + 1 };
            return collides(grid, newPiece) ? p : newPiece;
          });
          break;
        case 'ArrowDown':
          setPiece(p => {
            if (!p) return p;
            const newPiece = { ...p, y: p.y + 1 };
            if (collides(grid, newPiece)) {
              lockPiece();
              return p;
            }
            return newPiece;
          });
          break;
        case 'ArrowUp':
          hardDrop();
          break;
        case ' ':
          rotatePiece();
          break;
        case 'c':
        case 'C':
          holdPieceAction();
          break;
        case 'p':
        case 'P':
          setPaused(p => !p);
          break;
        case 'r':
        case 'R':
          resetGame();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [started, over, paused, grid, lockPiece, hardDrop, holdPieceAction]);

  // Touch controls for mobile
  useEffect(() => {
    if (!isMobileDevice || !started || over || paused) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      const deltaTime = Date.now() - startTime;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (distance < 30) {
        // Tap - rotate
        if (deltaTime < 300) {
          rotatePiece();
        }
      } else {
        // Swipe
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          // Horizontal swipe
          if (deltaX > 0) {
            // Right swipe
            setPiece(p => {
              if (!p) return p;
              const newPiece = { ...p, x: p.x + 1 };
              return collides(grid, newPiece) ? p : newPiece;
            });
          } else {
            // Left swipe
            setPiece(p => {
              if (!p) return p;
              const newPiece = { ...p, x: p.x - 1 };
              return collides(grid, newPiece) ? p : newPiece;
            });
          }
        } else {
          // Vertical swipe
          if (deltaY > 0) {
            // Down swipe - soft drop
            setPiece(p => {
              if (!p) return p;
              const newPiece = { ...p, y: p.y + 1 };
              if (collides(grid, newPiece)) {
                lockPiece();
                return p;
              }
              return newPiece;
            });
          } else {
            // Up swipe - hard drop
            hardDrop();
          }
        }
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isMobileDevice, started, over, paused, grid, lockPiece, hardDrop, rotatePiece]);

  // Drawing
  useEffect(() => {
    const canvas = gameCanvas.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid
    grid.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell > 0) {
          const color = COLORS[cell - 1];
          ctx.fillStyle = color;
          ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK);
          
          // Add highlight
          ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, 2);
          ctx.fillRect(x * BLOCK, y * BLOCK, 2, BLOCK);
        }
        ctx.strokeStyle = '#333';
        ctx.strokeRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK);
      });
    });
    
    // Draw ghost piece
    if (piece) {
      const ghost = getGhostPiece(piece, grid);
      ghost.shape.forEach((row, dy) => {
        row.forEach((cell, dx) => {
          if (cell) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fillRect((ghost.x + dx) * BLOCK, (ghost.y + dy) * BLOCK, BLOCK, BLOCK);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.strokeRect((ghost.x + dx) * BLOCK, (ghost.y + dy) * BLOCK, BLOCK, BLOCK);
          }
        });
      });
    }
    
    // Draw current piece
    if (piece) {
      piece.shape.forEach((row, dy) => {
        row.forEach((cell, dx) => {
          if (cell) {
            const color = COLORS[piece.colorIdx];
            ctx.fillStyle = color;
            ctx.fillRect((piece.x + dx) * BLOCK, (piece.y + dy) * BLOCK, BLOCK, BLOCK);
            
            // Add highlight
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect((piece.x + dx) * BLOCK, (piece.y + dy) * BLOCK, BLOCK, 2);
            ctx.fillRect((piece.x + dx) * BLOCK, (piece.y + dy) * BLOCK, 2, BLOCK);
            
            ctx.strokeStyle = '#000';
            ctx.strokeRect((piece.x + dx) * BLOCK, (piece.y + dy) * BLOCK, BLOCK, BLOCK);
          }
        });
      });
    }
    
    // Draw next pieces
    nextPieces.forEach((nextPiece, index) => {
      const yOffset = index * 80;
      nextPiece.shape.forEach((row, dy) => {
        row.forEach((cell, dx) => {
          if (cell) {
            ctx.fillStyle = COLORS[nextPiece.colorIdx];
            ctx.fillRect(PREVIEW_X + dx * BLOCK, yOffset + dy * BLOCK, BLOCK, BLOCK);
            ctx.strokeStyle = '#333';
            ctx.strokeRect(PREVIEW_X + dx * BLOCK, yOffset + dy * BLOCK, BLOCK, BLOCK);
          }
        });
      });
    });
    
    // Draw hold piece
    if (holdPiece) {
      const holdY = 100;
      holdPiece.shape.forEach((row, dy) => {
        row.forEach((cell, dx) => {
          if (cell) {
            ctx.fillStyle = canHold ? COLORS[holdPiece.colorIdx] : '#666';
            ctx.fillRect(HOLD_X + dx * BLOCK, holdY + dy * BLOCK, BLOCK, BLOCK);
            ctx.strokeStyle = '#333';
            ctx.strokeRect(HOLD_X + dx * BLOCK, holdY + dy * BLOCK, BLOCK, BLOCK);
          }
        });
      });
    }
  }, [grid, piece, nextPieces, holdPiece, canHold]);

  // Reset & Start functions
  const resetGame = () => {
    setStarted(false);
    setOver(false);
    setCountdown(null);
    setScore(0);
    setLevel(0);
    setLines(0);
    setGrid(emptyGrid());
    setHoldPiece(null);
    setCanHold(true);
    
    // Reset piece bag
    pieceBag.current = new PieceBag();
    const initialPieces = [pieceBag.current.next(), pieceBag.current.next(), pieceBag.current.next()];
    setNextPieces(initialPieces);
    setPiece(initialPieces[0]);
  };

  const startGame = () => {
    let t = 3;
    setCountdown(t);
    const id = setInterval(() => {
      t--;
      if (t === 0) {
        clearInterval(id);
        setCountdown(null);
        setStarted(true);
        audioCtx.current?.resume().then(() => {
          audioEl.current?.play().catch(() => {});
        });
      } else {
        setCountdown(t);
      }
    }, 1000);
  };

  // Audio visualization
  useEffect(() => {
    if (audioEl.current && !audioCtx.current) {
      const ctx = new AudioContext();
      const src = ctx.createMediaElementSource(audioEl.current);
      const anl = ctx.createAnalyser();
      src.connect(anl);
      anl.connect(ctx.destination);
      anl.fftSize = 256;
      audioCtx.current = ctx;
      analyser.current = anl;
    }
  }, []);

  useEffect(() => {
    if (!started) return;
    const canvas = audioCanvas.current;
    const anl = analyser.current;
    if (canvas && anl) {
      const ctx2 = canvas.getContext('2d');
      const bufferLen = anl.frequencyBinCount;
      const data = new Uint8Array(bufferLen);
      const draw = () => {
        requestAnimationFrame(draw);
        anl.getByteFrequencyData(data);
        if (!ctx2) return;
        ctx2.fillStyle = '#000';
        ctx2.fillRect(0, 0, canvas.width, canvas.height);
        const barW = canvas.width / bufferLen;
        let x = 0;
        for (let i = 0; i < bufferLen; i++) {
          const h = (data[i] / 255) * canvas.height;
          ctx2.fillStyle = '#0f0';
          ctx2.fillRect(x, canvas.height - h, barW, h);
          x += barW;
        }
      };
      draw();
    }
  }, [started]);

  // Game over audio
  useEffect(() => {
    if (over) {
      if (gameOverAudio.current) {
        gameOverAudio.current.currentTime = 0;
        gameOverAudio.current.play().catch(() => {});
      }
      if (audioEl.current) {
        audioEl.current.pause();
      }
    }
  }, [over]);

  // Restart background music
  useEffect(() => {
    if (started && !over && audioEl.current) {
      audioEl.current.currentTime = 0;
      audioEl.current.play().catch(() => {});
    }
  }, [started, over]);

  return (
    <div className={`relative flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white ${isMobileDevice && started && !over ? 'pb-20' : ''}`}>
      {/* Audio Visualization */}
      <div className="absolute top-4 left-4 flex flex-col items-start z-10">
        <span className="text-sm text-cyan-400 font-mono">Now Playing: Tetris 99 - Main Theme.mp3</span>
        <canvas ref={audioCanvas} width={200} height={50} className="border border-cyan-500 mb-2 rounded" />
        <audio ref={audioEl} src="/t.mp3" preload="auto" loop />
      </div>

      {/* Pause Button */}
      <button
        onClick={() => setPaused(p => !p)}
        className="absolute top-4 right-4 z-20 bg-gray-800 hover:bg-cyan-500 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg border border-cyan-400 text-2xl transition-all duration-200"
        aria-label="Pause"
      >
        {paused ? '▶️' : '⏸️'}
      </button>

      {/* Controls Info (Desktop only) */}
      {!isMobileDevice && (
        <div className="absolute top-4 right-20 bg-gray-900 bg-opacity-90 rounded-lg p-4 text-xs z-10 border border-cyan-400 shadow-lg backdrop-blur-sm">
          <div className="font-bold mb-2 text-cyan-400">Controls:</div>
          <div>←/→ : Move</div>
          <div>↓ : Soft Drop</div>
          <div>Space : Rotate</div>
          <div>↑ : Hard Drop</div>
          <div>C : Hold</div>
          <div>P : Pause</div>
          <div>R : Reset</div>
        </div>
      )}

      {/* Start Menu */}
      {!started && countdown === null && (
        <div className="space-y-6 text-center">
          <h1 className="text-6xl font-bold text-cyan-400 mb-8" style={{textShadow: '0 0 20px #00e5ff'}}>
            TETRIS AAA
          </h1>
          <div className="space-y-4">
            <button 
              onClick={startGame} 
              className="px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white text-xl font-bold rounded-lg shadow-lg border-2 border-cyan-400 transition-all duration-200 transform hover:scale-105"
            >
              Start Marathon
            </button>
            <button 
              disabled 
              className="px-8 py-4 bg-gray-600 text-white text-xl font-bold rounded-lg opacity-50 cursor-not-allowed"
            >
              Sprint Mode (Coming Soon)
            </button>
            <button 
              disabled 
              className="px-8 py-4 bg-gray-600 text-white text-xl font-bold rounded-lg opacity-50 cursor-not-allowed"
            >
              Ultra Mode (Coming Soon)
            </button>
          </div>
        </div>
      )}

      {/* Countdown */}
      {countdown !== null && (
        <div className="text-8xl font-bold text-cyan-400 animate-pulse" style={{textShadow: '0 0 30px #00e5ff'}}>
          {countdown === 0 ? 'GO!' : countdown}
        </div>
      )}

      {/* Game Stats */}
      {started && !over && (
        <div className="absolute top-20 right-4 z-20 bg-gray-900 bg-opacity-90 rounded-lg px-6 py-4 text-white shadow-lg backdrop-blur-sm border border-cyan-400">
          <div className="text-center space-y-2">
            <div className="text-2xl font-bold text-cyan-400">Score</div>
            <div className="text-xl font-mono">{score.toLocaleString()}</div>
            <div className="text-lg text-yellow-400">Level {level}</div>
            <div className="text-sm text-green-400">Lines {lines}</div>
          </div>
        </div>
      )}

      {/* Game Canvas */}
      {started && (
        <div className="relative">
          <canvas 
            ref={gameCanvas} 
            width={COLS * BLOCK + 200} 
            height={ROWS * BLOCK} 
            className="shadow-2xl border-2 border-cyan-400 rounded-lg"
          />
          
          {/* Hold Label */}
          <div className="absolute top-0 left-0" style={{ left: `${HOLD_X + BLOCK}px`, width: `${BLOCK * 4}px`, textAlign: 'center' }}>
            <div className="text-sm font-bold text-cyan-400 mb-2">HOLD</div>
          </div>
          
          {/* Next Label */}
          <div className="absolute top-0 right-0" style={{ right: '10px', width: `${BLOCK * 4}px`, textAlign: 'center' }}>
            <div className="text-sm font-bold text-cyan-400 mb-2">NEXT</div>
          </div>
        </div>
      )}

      {/* Mobile Controls Info */}
      {isMobileDevice && started && !over && (
        <div className="fixed bottom-4 left-4 right-4 z-30 bg-gray-900 bg-opacity-90 rounded-lg p-3 text-center text-xs backdrop-blur-sm border border-cyan-400">
          <div className="text-cyan-400 font-bold mb-1">Touch Controls:</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>Swipe ←/→ : Move</div>
            <div>Swipe ↓ : Soft Drop</div>
            <div>Swipe ↑ : Hard Drop</div>
            <div>Tap : Rotate</div>
          </div>
        </div>
      )}

      {/* Pause Screen */}
      {paused && started && !over && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-3xl shadow-2xl p-8 border-2 border-cyan-400">
            <div className="text-4xl font-bold text-cyan-400 mb-8 text-center">PAUSED</div>
            <div className="space-y-4">
              <button
                onClick={() => setPaused(false)}
                className="w-48 h-12 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-bold rounded-lg transition-all duration-200"
              >
                RESUME
              </button>
              <button
                onClick={() => { resetGame(); setPaused(false); }}
                className="w-48 h-12 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-bold rounded-lg transition-all duration-200"
              >
                NEW GAME
              </button>
              <button
                onClick={() => resetGame()}
                className="w-48 h-12 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white font-bold rounded-lg transition-all duration-200"
              >
                EXIT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over Screen */}
      {over && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90 backdrop-blur-sm">
          <div className="text-center space-y-8">
            <div className="text-6xl md:text-8xl font-bold text-red-500 animate-pulse" style={{textShadow: '0 0 30px #ff0000'}}>
              GAME OVER
            </div>
            <div className="text-2xl text-white mb-8">
              <div>Final Score: {score.toLocaleString()}</div>
              <div>Level Reached: {level}</div>
              <div>Lines Cleared: {lines}</div>
            </div>
            <div className="space-x-4">
              <button
                onClick={() => { resetGame(); setPaused(false); }}
                className="px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white text-xl font-bold rounded-lg transition-all duration-200"
              >
                PLAY AGAIN
              </button>
              <button
                onClick={() => resetGame()}
                className="px-8 py-4 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white text-xl font-bold rounded-lg transition-all duration-200"
              >
                MAIN MENU
              </button>
            </div>
          </div>
          <audio ref={gameOverAudio} src="/gameover.mp3" preload="auto" />
        </div>
      )}
    </div>
  );
}