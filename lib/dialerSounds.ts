const HOLD_MUSIC_URL = 'https://api.aeondial.com/static/HoldMusic.mp3'

let holdAudio: HTMLAudioElement | null = null
let audioCtx: AudioContext | null = null

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
      onComplete?.()
    }
  }, interval)
}

export function playDialerMusic(): () => void {
  if (typeof window === 'undefined') return () => {}

  if (holdAudio) {
    holdAudio.pause()
    holdAudio = null
  }

  holdAudio = new Audio(HOLD_MUSIC_URL)
  holdAudio.loop = true
  holdAudio.volume = 0
  holdAudio.play().catch(() => {})

  fadeAudioTo(holdAudio, 0.4, 2000)

  return () => {
    if (holdAudio) {
      const audioToStop = holdAudio
      fadeAudioTo(audioToStop, 0, 800, () => {
        audioToStop.pause()
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

    osc.start(cursor)
    osc.stop(cursor + toneSec)

    cursor += toneSec + (tone.gapMs / 1000)
  })
}

export function playConnected(): void {
  void playToneSequence([
    { freq: 523, ms: 80, gain: 0.4, gapMs: 20 },
    { freq: 659, ms: 80, gain: 0.4, gapMs: 20 },
    { freq: 784, ms: 80, gain: 0.4, gapMs: 20 },
  ])
}

export function playHangup(): void {
  void playToneSequence([
    { freq: 440, ms: 150, gain: 0.35, gapMs: 30 },
    { freq: 330, ms: 150, gain: 0.35, gapMs: 30 },
  ])
}

export function playDialTone(): void {
  void playToneSequence([
    { freq: 880, ms: 40, gain: 0.2, gapMs: 0 },
  ])
}

export function stopDialerMusicImmediate(): void {
  if (!holdAudio) return
  holdAudio.pause()
  holdAudio = null
}
