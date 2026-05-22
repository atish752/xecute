import { useEffect } from 'react';
import { motion } from 'framer-motion';

export default function SplashScreen({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0D0F14',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        gap: 16,
      }}
    >
      {/* Ambient glow */}
      <div style={{
        position: 'absolute',
        width: 300,
        height: 300,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(245,166,35,0.12) 0%, transparent 70%)',
        filter: 'blur(20px)',
      }} />

      {/* Logo */}
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 22, delay: 0.1 }}
        style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}
      >
        <span
          className="font-syne font-black text-glow-amber"
          style={{ fontSize: 64, color: '#F5A623', letterSpacing: '-0.04em', lineHeight: 1 }}
        >X</span>
        <span
          className="font-syne font-black"
          style={{ fontSize: 64, color: '#F0F2F7', letterSpacing: '-0.04em', lineHeight: 1 }}
        >ecute</span>
      </motion.div>

      {/* Tagline */}
      <motion.p
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="font-dm"
        style={{ color: '#8B90A0', fontSize: 18, letterSpacing: '0.12em' }}
      >
        Do it now.
      </motion.p>

      {/* Loading dots */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        style={{ display: 'flex', gap: 8, marginTop: 40 }}
      >
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#F5A623',
            }}
          />
        ))}
      </motion.div>
    </motion.div>
  );
}
