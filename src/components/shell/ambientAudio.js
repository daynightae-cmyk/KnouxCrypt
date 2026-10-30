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
    dispose() { disposed = true; nodes.forEach(node => node.stop()); return context.close(); },
  };
}
