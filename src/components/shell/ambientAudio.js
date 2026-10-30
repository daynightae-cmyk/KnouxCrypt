// Original procedural low-level soundscape. No remote media or microphone access.
export function createAmbientAudio(Context) {
  const context = new Context();
  const master = context.createGain();
  master.gain.value = 0;
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = 420; filter.Q.value = .4;
  filter.connect(master); master.connect(context.destination);
  const nodes = [];
  for (const [frequency, level, detune] of [[55,.2,-4],[82.4069,.09,3],[110,.035,-2]]) {
    const oscillator = context.createOscillator(); const gain = context.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = frequency; oscillator.detune.value = detune;
    gain.gain.value = level; oscillator.connect(gain); gain.connect(filter); oscillator.start(); nodes.push(oscillator);
  }
  const lfo = context.createOscillator(); const lfoDepth = context.createGain();
  lfo.frequency.value = .07; lfoDepth.gain.value = 85; lfo.connect(lfoDepth); lfoDepth.connect(filter.frequency); lfo.start(); nodes.push(lfo);
  let enabled = false; let visible = true; let intensity = .06; let disposed = false;
  let lastCue = -Infinity;
  const cues = new Set();
  function fade() {
    if (disposed) return;
    const now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(enabled && visible ? intensity : 0, now, .7);
  }
  return {
    async enable() { if (disposed) return; await context.resume(); enabled = true; fade(); },
    mute() { enabled = false; fade(); },
    setVisible(value) { visible = value; fade(); },
    setScene(splash) { intensity = splash ? .08 : .045; fade(); },
    cue(kind = 'tap') {
      if (disposed || !enabled || !visible || context.state === 'suspended') return false;
      const now = context.currentTime;
      if (now - lastCue < .09) return false;
      lastCue = now;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = kind === 'navigate' ? 330 : kind === 'toggle' ? 440 : 520;
      envelope.gain.setValueAtTime(0, now);
      envelope.gain.linearRampToValueAtTime(.006, now + .008);
      envelope.gain.exponentialRampToValueAtTime(.0001, now + .09);
      oscillator.connect(envelope); envelope.connect(master);
      cues.add(oscillator);
      oscillator.onended = () => { cues.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
      oscillator.start(now); oscillator.stop(now + .11);
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      nodes.forEach(node => node.stop());
      cues.forEach(node => { try { node.stop(); } catch { /* Already ended. */ } });
      cues.clear();
      return context.close();
    },
  };
}
