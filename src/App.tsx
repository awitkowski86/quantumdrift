import React, { useState, useEffect, useRef } from 'react';
import QuantumDrift from './QuantumDrift';

/* ── Landing page starfield helpers ───────────────────────────────── */
interface StarDot { x: number; y: number; size: number; speed: number; opacity: number; }

function useLandingStars(count: number) {
  const ref = useRef<StarDot[]>([]);
  if (ref.current.length === 0) {
    for (let i = 0; i < count; i++) {
      ref.current.push({
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 1 + Math.random() * 2,
        speed: 0.02 + Math.random() * 0.06,
        opacity: 0.3 + Math.random() * 0.7,
      });
    }
  }
  return ref.current;
}

const SYMS = ['ψ', 'φ', '∞', '⟨0|', '|1⟩', 'H', 'X', 'Z', '†', '⊗', 'Ψ', 'Φ'];

export default function App() {
  const [playing, setPlaying] = useState(false);
  const [phase, setPhase] = useState(0);
  const stars = useLandingStars(60);

  useEffect(() => {
    if (playing) return;
    let id: number;
    const tick = () => { setPhase(p => p + 0.02); id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing]);

  if (playing) {
    return <QuantumDrift onClose={() => setPlaying(false)} />;
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 30%, #0a1628 0%, #050a15 70%)',
      overflow: 'hidden',
    }}>
      {/* Starfield */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0 }}>
        {stars.map((s, i) => (
          <div key={i} style={{
            position: 'absolute',
            borderRadius: '50%',
            background: `rgba(180, 200, 255, ${0.3 + Math.sin(phase * s.speed * 30 + i) * 0.4})`,
            width: s.size, height: s.size,
            top: `${s.y}%`,
            left: `${((s.x - phase * s.speed * 50) % 120 + 120) % 120}%`,
          }} />
        ))}
        {/* Floating quantum symbols */}
        {SYMS.map((sym, i) => (
          <div key={`sym-${i}`} style={{
            position: 'absolute',
            fontSize: 14,
            color: `rgba(0, 163, 238, ${0.04 + Math.sin(phase * 0.5 + i) * 0.04})`,
            left: `${(i * 8.3 + 5) % 100}%`,
            top: `${((100 - phase * (0.3 + i * 0.05) * 10) % 120 + 120) % 120}%`,
            pointerEvents: 'none',
            transform: `rotate(${phase * 10 + i * 30}deg)`,
          }}>{sym}</div>
        ))}
      </div>

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 600, padding: '0 24px' }}>
        {/* Animated qubit hero — matches idle screen */}
        <div style={{ width: 100, height: 100, margin: '0 auto 32px', position: 'relative' }}>
          {/* Outer glow */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 60 + Math.sin(phase * 3) * 8, height: 60 + Math.sin(phase * 3) * 8,
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(0,163,238,0.35), transparent 70%)`,
            filter: 'blur(8px)',
          }} />
          {/* Main orb */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 22, height: 22, borderRadius: '50%',
            background: `radial-gradient(circle at 40% 35%, rgba(255,255,255,0.6), rgba(0,163,238,0.9) 60%, rgba(168,85,247,0.7))`,
            boxShadow: `0 0 ${16 + Math.sin(phase * 2) * 6}px rgba(0,163,238,0.6), 0 0 ${30 + Math.sin(phase * 3) * 10}px rgba(168,85,247,0.3)`,
          }} />
          {/* Orbiting dots */}
          {[0, 1, 2].map(i => {
            const a = phase * 2 + (i * Math.PI * 2) / 3;
            const orbitR = 28 + Math.sin(phase * 0.5 + i) * 4;
            const colors = ['#00a3ee', '#a855f7', '#ec4899'];
            return (
              <div key={i} style={{
                position: 'absolute',
                top: `calc(50% + ${Math.sin(a) * orbitR * 0.6}px)`,
                left: `calc(50% + ${Math.cos(a) * orbitR}px)`,
                width: 4, height: 4, borderRadius: '50%',
                background: colors[i],
                boxShadow: `0 0 6px ${colors[i]}`,
                transform: 'translate(-50%, -50%)',
              }} />
            );
          })}
          {/* Orbit rings */}
          {[0, 1].map(i => (
            <div key={`ring-${i}`} style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 2 * (19 + 8 + i * 7 + Math.sin(phase * (2 + i)) * 3),
              height: 2 * (19 + 8 + i * 7 + Math.sin(phase * (2 + i)) * 3),
              borderRadius: '50%',
              border: `1px solid rgba(${i === 0 ? '0,163,238' : '168,85,247'}, ${0.18 - i * 0.05})`,
              pointerEvents: 'none',
            }} />
          ))}
        </div>

        <h1 style={{
          fontSize: 'clamp(2rem, 6vw, 3.5rem)',
          fontWeight: 800,
          letterSpacing: -1,
          background: 'linear-gradient(135deg, #00a3ee 0%, #a855f7 50%, #ec4899 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: 12,
          filter: 'drop-shadow(0 0 30px rgba(0, 163, 238, 0.3))',
        }}>QUANTUM DRIFT</h1>

        <p style={{ fontSize: 14, color: '#64748b', marginBottom: 40, lineHeight: 1.6 }}>
          Fly fast. Stay entangled. Don't let the cats decide your fate.
        </p>

        <button
          onClick={() => setPlaying(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '14px 40px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 15, fontWeight: 700, color: '#fff',
            background: 'linear-gradient(135deg, rgba(0,163,238,0.15), rgba(168,85,247,0.15))',
            border: '1.5px solid rgba(0,163,238,0.4)',
            borderRadius: 12, cursor: 'pointer', letterSpacing: 1,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'rgba(0,163,238,0.8)';
            e.currentTarget.style.boxShadow = '0 0 30px rgba(0,163,238,0.2), 0 0 60px rgba(168,85,247,0.1)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(0,163,238,0.4)';
            e.currentTarget.style.boxShadow = 'none';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          ▶ &nbsp;INITIALIZE
        </button>

        {/* Controls */}
        <div style={{ marginTop: 48, display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[
            { keys: '←↑↓→', action: 'Move' },
            { keys: 'SPACE', action: 'Quantum Leap' },
            { keys: 'M', action: 'Mute' },
            { keys: 'ESC', action: 'Menu' },
          ].map(c => (
            <div key={c.keys} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#475569' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: 28, height: 24, padding: '0 6px',
                border: '1px solid rgba(100,116,139,0.3)', borderRadius: 5,
                fontSize: 10, fontWeight: 700, color: '#94a3b8',
                background: 'rgba(15,23,42,0.6)',
              }}>{c.keys}</span>
              {c.action}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
