const HOLD_MUSIC_URL = 'https://api.aeondial.com/static/HoldMusic.mp3'

let holdAudio: HTMLAudioElement | null = null
let audioCtx: AudioContext | null = null
let activeCallAudioBlocked = false
const fadeTimers = new Set<number>()
const toneStopTimers = new Set<number>()
const activeOscillators = new Set<OscillatorNode>()

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return null
    audioCtx = new Ctx()
  }
  return audioCtx
}

async function ensureContextRunning(): Promise<AudioContext | null> {
  const ctx = getAudioContext()
  if (!ctx) return null
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {
      return null
    }
  }
  return ctx
}

function fadeAudioTo(
  audio: HTMLAudioElement,
  targetVolume: number,
  durationMs: number,
  onComplete?: () => void
) {
  const steps = 30
  const interval = durationMs / steps
  const startVolume = audio.volume
  const delta = (targetVolume - startVolume) / steps
  let step = 0
  const timer = window.setInterval(() => {
    step++
    audio.volume = Math.min(1, Math.max(0, startVolume + delta * step))
    if (step >= steps) {
      window.clearInterval(timer)
      fadeTimers.delete(timer)
      onComplete?.()
    }
  }, interval)
  fadeTimers.add(timer)
}

function resetAudioElement(audio: HTMLAudioElement): void {
  audio.pause()
  try {
    audio.currentTime = 0
  } catch {
    /* noop */
  }
}

function isDialerAudioBlocked(reason: string): boolean {
  if (!activeCallAudioBlocked) return false
  console.log('[AUDIO_BLOCKED_ACTIVE_CALL]', { reason })
  return true
}

export function clearDialerAudioActiveCallBlock(reason: string): void {
  if (!activeCallAudioBlocked) return
  void reason
  activeCallAudioBlocked = false
}

export function stopAllDialerAudio(reason: string): void {
  activeCallAudioBlocked = true
  console.log('[AUDIO_STOP_ALL]', `reason=${reason}`)

  fadeTimers.forEach((timer) => window.clearInterval(timer))
  fadeTimers.clear()

  toneStopTimers.forEach((timer) => window.clearTimeout(timer))
  toneStopTimers.clear()

  activeOscillators.forEach((osc) => {
    try { osc.stop(0) } catch { /* noop */ }
    try { osc.disconnect() } catch { /* noop */ }
  })
  activeOscillators.clear()

  if (holdAudio) {
    resetAudioElement(holdAudio)
    holdAudio = null
  }
}

export function playDialerMusic(): () => void {
  if (typeof window === 'undefined') return () => {}
  if (isDialerAudioBlocked('hold-start')) return () => {}

  if (holdAudio) {
    resetAudioElement(holdAudio)
    holdAudio = null
  }

  console.log('[AUDIO_HOLD_START]')
  holdAudio = new Audio(HOLD_MUSIC_URL)
  holdAudio.loop = true
  holdAudio.volume = 0
  holdAudio.play().catch(() => {})

  fadeAudioTo(holdAudio, 0.4, 2000)

  return () => {
    if (holdAudio) {
      const audioToStop = holdAudio
      fadeAudioTo(audioToStop, 0, 800, () => {
        resetAudioElement(audioToStop)
        if (holdAudio === audioToStop) holdAudio = null
      })
    }
  }
}

type Tone = { freq: number; ms: number; gain: number; gapMs: number }

async function playToneSequence(tones: Tone[]) {
  const ctx = await ensureContextRunning()
  if (!ctx) return

  const start = ctx.currentTime + 0.005
  let cursor = start

  tones.forEach((tone) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(tone.freq, cursor)

    const toneSec = tone.ms / 1000
    const fadeSec = Math.min(0.02, toneSec)

    gain.gain.setValueAtTime(tone.gain, cursor)
    gain.gain.linearRampToValueAtTime(0, cursor + toneSec)

    osc.connect(gain)
    gain.connect(ctx.destination)

    activeOscillators.add(osc)
    osc.start(cursor)
    osc.stop(cursor + toneSec)
    const stopTimer = window.setTimeout(() => {
      activeOscillators.delete(osc)
      toneStopTimers.delete(stopTimer)
      try { osc.disconnect() } catch { /* noop */ }
      try { gain.disconnect() } catch { /* noop */ }
    }, Math.max(0, (cursor + toneSec - ctx.currentTime) * 1000) + 50)
    toneStopTimers.add(stopTimer)

    cursor += toneSec + (tone.gapMs / 1000)
  })
}

export function playConnected(): void {
  if (isDialerAudioBlocked('connected-tone')) return
  void playToneSequence([
    { freq: 523, ms: 80, gain: 0.4, gapMs: 20 },
    { freq: 659, ms: 80, gain: 0.4, gapMs: 20 },
    { freq: 784, ms: 80, gain: 0.4, gapMs: 20 },
  ])
}

export function playHangup(): void {
  if (isDialerAudioBlocked('hangup-tone')) return
  void playToneSequence([
    { freq: 440, ms: 150, gain: 0.35, gapMs: 30 },
    { freq: 330, ms: 150, gain: 0.35, gapMs: 30 },
  ])
}

export function playDialTone(): void {
  if (isDialerAudioBlocked('dial-tick')) return
  console.log('[AUDIO_DIAL_TICK]')
  void playToneSequence([
    { freq: 880, ms: 40, gain: 0.2, gapMs: 0 },
  ])
}

export function stopDialerMusicImmediate(): void {
  if (!holdAudio) return
  resetAudioElement(holdAudio)
  holdAudio = null
}
