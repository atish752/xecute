// Xecute PWA — Web Audio API Focus Sound Synthesizer
// Generates high-quality ambient focus sounds client-side and offline-first without files.

let audioCtx = null;
let masterGain = null;
let activeSourceNode = null;
let activeIntervals = [];

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(0.3, audioCtx.currentTime); // default comfortable volume
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Helper: Noise Buffer Generator
function createNoiseBuffer(color = 'white') {
  const ctx = getAudioContext();
  const bufferSize = ctx.sampleRate * 2; // 2 seconds
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  let lastOut = 0.0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    if (color === 'brown') {
      // Brown noise filter approximation
      data[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = data[i];
      data[i] *= 3.5; // Compensate volume loss
    } else if (color === 'pink') {
      // Pink noise filter approximation
      data[i] = (lastOut + (0.12 * white)) / 1.12;
      lastOut = data[i];
      data[i] *= 2.0;
    } else {
      data[i] = white;
    }
  }
  return buffer;
}

// Stop any currently playing audio
export function stopSound() {
  // Clear any forest/lofi intervals
  activeIntervals.forEach(clearInterval);
  activeIntervals = [];

  if (activeSourceNode) {
    try {
      activeSourceNode.disconnect();
      if (activeSourceNode.stop) activeSourceNode.stop();
    } catch (e) {
      // already stopped or not started
    }
    activeSourceNode = null;
  }
}

// Play sound
export function startSound(type) {
  stopSound();
  if (type === 'silence') return;

  const ctx = getAudioContext();
  const gainNode = ctx.createGain();
  gainNode.connect(masterGain);

  if (type === 'whitenoise') {
    // Generate Brown noise (smoother than white noise)
    const buffer = createNoiseBuffer('brown');
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gainNode);
    source.start();
    activeSourceNode = source;
  } 
  
  else if (type === 'rain') {
    // Rain has two components: low brown noise (rumble) + high crackling pink noise (droplets)
    const rumbleSource = ctx.createBufferSource();
    rumbleSource.buffer = createNoiseBuffer('brown');
    rumbleSource.loop = true;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(300, ctx.currentTime);

    rumbleSource.connect(lowpass);
    lowpass.connect(gainNode);
    rumbleSource.start();

    // High patter
    const patterSource = ctx.createBufferSource();
    patterSource.buffer = createNoiseBuffer('pink');
    patterSource.loop = true;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(1200, ctx.currentTime);
    bandpass.Q.setValueAtTime(1.5, ctx.currentTime);

    const patterGain = ctx.createGain();
    patterGain.gain.setValueAtTime(0.3, ctx.currentTime);

    patterSource.connect(bandpass);
    bandpass.connect(patterGain);
    patterGain.connect(gainNode);
    patterSource.start();

    // Rain drop crackles (random impulses)
    const crackleInterval = setInterval(() => {
      if (Math.random() > 0.4) {
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2000 + Math.random() * 3000, ctx.currentTime);
        
        oscGain.gain.setValueAtTime(0.005, ctx.currentTime);
        oscGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
        
        osc.connect(oscGain);
        oscGain.connect(gainNode);
        osc.start();
        osc.stop(ctx.currentTime + 0.06);
      }
    }, 40);
    activeIntervals.push(crackleInterval);

    // Track active node wrapper
    activeSourceNode = {
      disconnect: () => {
        rumbleSource.disconnect();
        patterSource.disconnect();
        gainNode.disconnect();
      },
      stop: () => {
        rumbleSource.stop();
        patterSource.stop();
      }
    };
  } 
  
  else if (type === 'forest') {
    // Forest: wind rumble + randomized bird chirp + cricket peeps
    const windSource = ctx.createBufferSource();
    windSource.buffer = createNoiseBuffer('brown');
    windSource.loop = true;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.setValueAtTime(180, ctx.currentTime);

    const windGain = ctx.createGain();
    windGain.connect(gainNode);
    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windSource.start();

    // Modulate wind gain to simulate gusts
    const windModulation = setInterval(() => {
      const targetGain = 0.4 + Math.random() * 0.6;
      windGain.gain.linearRampToValueAtTime(targetGain, ctx.currentTime + 2.5);
    }, 3000);
    activeIntervals.push(windModulation);

    // Periodic crickets/birds
    const insectInterval = setInterval(() => {
      const now = ctx.currentTime;
      // Synthesize a quick chirp chirp chirp
      const start = now;
      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.frequency.setValueAtTime(4500 + Math.random() * 200, start + i * 0.1);
        oscGain.gain.setValueAtTime(0.002, start + i * 0.1);
        oscGain.gain.exponentialRampToValueAtTime(0.0001, start + i * 0.1 + 0.05);

        osc.connect(oscGain);
        oscGain.connect(gainNode);
        osc.start(start + i * 0.1);
        osc.stop(start + i * 0.1 + 0.06);
      }
    }, 1500);
    activeIntervals.push(insectInterval);

    // Bird chirping periodically
    const birdInterval = setInterval(() => {
      if (Math.random() > 0.6) {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1500, now);
        osc.frequency.exponentialRampToValueAtTime(3200, now + 0.15);
        osc.frequency.exponentialRampToValueAtTime(2000, now + 0.3);

        oscGain.gain.setValueAtTime(0.015, now);
        oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

        osc.connect(oscGain);
        oscGain.connect(gainNode);
        
        osc.start(now);
        osc.stop(now + 0.4);
      }
    }, 6000);
    activeIntervals.push(birdInterval);

    activeSourceNode = {
      disconnect: () => {
        windSource.disconnect();
        gainNode.disconnect();
      },
      stop: () => {
        windSource.stop();
      }
    };
  }

  else if (type === 'lofi') {
    // Lo-fi tape crackle
    const staticSource = ctx.createBufferSource();
    staticSource.buffer = createNoiseBuffer('pink');
    staticSource.loop = true;

    const staticFilter = ctx.createBiquadFilter();
    staticFilter.type = 'bandpass';
    staticFilter.frequency.setValueAtTime(1000, ctx.currentTime);
    staticFilter.Q.setValueAtTime(0.5, ctx.currentTime);

    const staticGain = ctx.createGain();
    staticGain.gain.setValueAtTime(0.05, ctx.currentTime); // soft tape hiss

    staticSource.connect(staticFilter);
    staticFilter.connect(staticGain);
    staticGain.connect(gainNode);
    staticSource.start();

    // Modulate pitch slightly (wow/flutter LFO)
    const wowOsc = ctx.createOscillator();
    const wowGain = ctx.createGain();
    wowOsc.frequency.setValueAtTime(4.0, ctx.currentTime); // 4Hz flutter
    wowGain.gain.setValueAtTime(4.0, ctx.currentTime); // frequency pitch depth

    wowOsc.connect(wowGain);
    wowOsc.start();

    // Play synthesized jazz chords (Rhodes sound)
    // Chords: Am9 -> D9 -> Gmaj9 -> Cmaj7
    const chords = [
      [57, 60, 64, 67, 71], // Am9 (A, C, E, G, B)
      [50, 54, 57, 60, 64], // D9 (D, F#, A, C, E)
      [55, 59, 62, 66, 69], // Gmaj9 (G, B, D, F#, A)
      [48, 52, 55, 59, 62]  // Cmaj9 (C, E, G, B, D)
    ];

    let chordIndex = 0;

    const playChord = () => {
      const now = ctx.currentTime;
      const notes = chords[chordIndex];
      const oscillators = [];
      const noteGain = ctx.createGain();
      noteGain.gain.setValueAtTime(0.0, now);
      // Soft attack & long release
      noteGain.gain.linearRampToValueAtTime(0.08, now + 1.5);
      noteGain.gain.setValueAtTime(0.08, now + 5.0);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, now + 7.5);

      // Low pass to sound warm
      const rhodesFilter = ctx.createBiquadFilter();
      rhodesFilter.type = 'lowpass';
      rhodesFilter.frequency.setValueAtTime(500, ctx.currentTime);

      noteGain.connect(rhodesFilter);
      rhodesFilter.connect(gainNode);

      notes.forEach((midiNote) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
        osc.frequency.setValueAtTime(freq, now);

        // Apply flutter modulation
        wowGain.connect(osc.frequency);

        osc.connect(noteGain);
        osc.start(now);
        osc.stop(now + 7.6);
        oscillators.push(osc);
      });

      chordIndex = (chordIndex + 1) % chords.length;
    };

    playChord();
    const chordInterval = setInterval(playChord, 8000);
    activeIntervals.push(chordInterval);

    activeSourceNode = {
      disconnect: () => {
        staticSource.disconnect();
        wowOsc.disconnect();
        gainNode.disconnect();
      },
      stop: () => {
        staticSource.stop();
        wowOsc.stop();
      }
    };
  }
}

// Adjust master volume
export function setVolume(value) {
  if (masterGain) {
    // Clamp between 0 and 1
    const clamped = Math.max(0, Math.min(1, value));
    masterGain.gain.setValueAtTime(clamped, getAudioContext().currentTime);
  }
}
