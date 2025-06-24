// src/App.tsx – Tetris Solo with Audio Visualization (fixed)
import React, { useEffect, useRef, useState } from 'react';

// Constants
const ROWS = 20;
const COLS = 10;
const BLOCK = 30;
const START_SPEED = 500;
const PREVIEW_X = COLS * BLOCK + 20;

// Color palette (O, I, T, S, Z, L, J)
const COLORS = ['#faca0d', '#00e5ff', '#a335ee', '#3cff3c', '#ff4949', '#ff9b00', '#3c59ff'];

// Piece type
type Piece = { shape: number[][]; x: number; y: number; colorIdx: number };

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
const rand = (n: number) => Math.floor(Math.random()*n);
const randomPiece = (): Piece => {
  const colorIdx = rand(SHAPES.length);
  const shape = SHAPES[colorIdx];
  return { shape, x: Math.floor((COLS-shape[0].length)/2), y: 0, colorIdx };
};
const rotate = (m: number[][]) => m[0].map((_,i)=>m.map(r=>r[i]).reverse());

export default function App() {
  // Refs
  const gameCanvas = useRef<HTMLCanvasElement>(null);
  const audioCanvas = useRef<HTMLCanvasElement>(null);
  const audioEl = useRef<HTMLAudioElement>(null);
  const audioCtx = useRef<AudioContext|null>(null);
  const analyser = useRef<AnalyserNode|null>(null);

  // State
  const [grid, setGrid] = useState<number[][]>(emptyGrid());
  const [piece, setPiece] = useState<Piece>(randomPiece());
  const [nextPiece, setNextPiece] = useState<Piece>(randomPiece());
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(0);
  const [started, setStarted] = useState(false);
  const [over, setOver] = useState(false);
  const [countdown, setCountdown] = useState<number|null>(null);

  // Initialize AudioContext and Analyser once
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

  // Visualize audio when game started
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
        ctx2.fillRect(0,0,canvas.width,canvas.height);
        const barW = canvas.width / bufferLen;
        let x = 0;
        for (let i=0; i<bufferLen; i++) {
          const h = (data[i]/255)*canvas.height;
          ctx2.fillStyle = '#0f0';
          ctx2.fillRect(x, canvas.height - h, barW, h);
          x += barW;
        }
      };
      draw();
    }
  }, [started]);

  // Collision and merge functions
  const collides = (g:number[][], p:Piece) => p.shape.some((row,dy)=>row.some((v,dx)=>v && (
    p.y+dy>=ROWS || p.x+dx<0 || p.x+dx>=COLS || (p.y+dy>=0 && g[p.y+dy][p.x+dx])
  )));
  const merge = (g:number[][], p:Piece) => {
    const ng = g.map(r=>[...r]);
    p.shape.forEach((row,dy)=>row.forEach((v,dx)=>{
      if(v && p.y+dy>=0) ng[p.y+dy][p.x+dx] = p.colorIdx+1;
    }));
    return ng;
  };
  const clearLines = (g:number[][])=>{
    const kept = g.filter(r=>r.some(c=>c===0));
    const cleared = ROWS-kept.length;
    while(kept.length<ROWS) kept.unshift(Array(COLS).fill(0));
    return { newGrid:kept, cleared };
  };

  // Gravity loop
  useEffect(()=>{
    if(!started||over) return;
    const speed = Math.max(100, START_SPEED-level*20);
    const id = setInterval(()=>{
      setPiece(p=>{
        const nxt = {...p, y:p.y+1};
        if(collides(grid,nxt)){
          if(p.y===0){ setOver(true); return p; }
          const merged=merge(grid,p);
          const { newGrid, cleared } = clearLines(merged);
          setGrid(newGrid);
          setScore(s=>s+10+cleared*100);
          setLevel(l=>l+cleared);
          setPiece(nextPiece);
          setNextPiece(randomPiece());
          return nextPiece;
        }
        return nxt;
      });
    }, speed);
    return ()=>clearInterval(id);
  }, [grid, level, started, over, nextPiece]);

  // Controls
  useEffect(()=>{
    const onKey = (e:KeyboardEvent)=>{
      if(!started||over) return;
      setPiece(p=>{
        let np={...p};
        if(e.key==='ArrowLeft') np.x--;
        if(e.key==='ArrowRight') np.x++;
        if(e.key==='ArrowDown') np.y++;
        if(e.key===' ') np.shape=rotate(p.shape);
        if(e.key==='ArrowUp') while(!collides(grid,{...np,y:np.y+1})) np.y++;
        return collides(grid,np)?p:np;
      });
      if(e.key==='r') resetGame();
    };
    window.addEventListener('keydown', onKey);
    return ()=>window.removeEventListener('keydown', onKey);
  }, [started, over, grid]);

  // Drawing
  useEffect(()=>{
    const c = gameCanvas.current; if(!c) return;
    const ctx = c.getContext('2d'); if(!ctx) return;
    ctx.fillStyle='#111'; ctx.fillRect(0,0,c.width,c.height);
    grid.forEach((row,y)=>row.forEach((v,x)=>{
      if(v){ ctx.fillStyle=COLORS[v-1]; ctx.fillRect(x*BLOCK,y*BLOCK,BLOCK,BLOCK); }
      ctx.strokeStyle='#333'; ctx.strokeRect(x*BLOCK,y*BLOCK,BLOCK,BLOCK);
    }));
    piece.shape.forEach((row,dy)=>row.forEach((v,dx)=>{
      if(v){ ctx.fillStyle=COLORS[piece.colorIdx]; ctx.fillRect((piece.x+dx)*BLOCK,(piece.y+dy)*BLOCK,BLOCK,BLOCK); ctx.strokeStyle='#000'; ctx.strokeRect((piece.x+dx)*BLOCK,(piece.y+dy)*BLOCK,BLOCK,BLOCK); }
    }));
    nextPiece.shape.forEach((row,dy)=>row.forEach((v,dx)=>{
      if(v){ ctx.fillStyle=COLORS[nextPiece.colorIdx]; ctx.fillRect(PREVIEW_X+dx*BLOCK,dy*BLOCK,BLOCK,BLOCK); ctx.strokeStyle='#333'; ctx.strokeRect(PREVIEW_X+dx*BLOCK,dy*BLOCK,BLOCK,BLOCK); }
    }));
  }, [grid, piece, nextPiece]);

  // Reset & Start functions
  const resetGame=()=>{ setStarted(false); setOver(false); setCountdown(null); setScore(0); setLevel(0); setGrid(emptyGrid()); setPiece(randomPiece()); setNextPiece(randomPiece()); };
  const startGame=()=>{
    let t=3; setCountdown(t);
    const id=setInterval(()=>{ t--; if(t===0){ clearInterval(id); setCountdown(null); setStarted(true); audioCtx.current?.resume().then(()=>{ audioEl.current?.play().catch(()=>{}); }); } else setCountdown(t); },1000);
  };

  // JSX
  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-black text-white">
      {/* Playlist & Visualization */}
      <div className="absolute top-4 left-4 flex flex-col items-start">
        <span className="text-sm">Now Playing: Tetris 99 - Main Theme.mp3</span>
        <canvas ref={audioCanvas} width={200} height={50} className="border border-gray-600 mb-2" />
        <audio ref={audioEl} src="/t.mp3" preload="auto" loop />
      </div>
      {/* Start / Countdown */}
      {!started && countdown===null && (
        <div className="space-y-4">
          <button onClick={startGame} className="px-6 py-2 bg-cyan-500 rounded">Start Solo</button>
          <button disabled className="px-6 py-2 bg-gray-600 rounded opacity-50">VS AI soon</button>
        </div>
      )}
      {countdown!==null && (
        <div className="text-6xl font-bold">{countdown===0?'GO!':countdown}</div>
      )}
      {/* Game Canvas */}
      {started && (
        <>
          <canvas ref={gameCanvas} width={COLS*BLOCK+150} height={ROWS*BLOCK} className="shadow-2xl" />
          <div className="mt-4">Score: {score} Level: {level}</div>
          {over && <div className="text-red-500 mt-2">GAME OVER - Press R</div>}
        </>
      )}
    </div>
  );
}
