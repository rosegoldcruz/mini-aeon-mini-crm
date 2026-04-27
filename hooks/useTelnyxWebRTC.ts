'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

export interface TelnyxCall {
  id: string
  state: string
  answer: () => void
  hangup: () => void
  mute: () => void
  unmute: () => void
}

export type RtcStatus = 'idle' | 'connecting' | 'ready' | 'error'

export function useTelnyxWebRTC(
  onReady?: () => void,
  onCallStart?: (call: TelnyxCall) => void,
  onCallEnd?: () => void,
) {
  const [rtcStatus,     setRtcStatus]     = useState<RtcStatus>('idle')
  const [rtcError,      setRtcError]      = useState<string | null>(null)
  const [activeRtcCall, setActiveRtcCall] = useState<TelnyxCall | null>(null)
  const [muted,         setMuted]         = useState(false)

  const clientRef      = useRef<any>(null)
  const onReadyRef     = useRef(onReady)
  const onCallStartRef = useRef(onCallStart)
  const onCallEndRef   = useRef(onCallEnd)

  useEffect(() => { onReadyRef.current     = onReady     }, [onReady])
  useEffect(() => { onCallStartRef.current = onCallStart }, [onCallStart])
  useEffect(() => { onCallEndRef.current   = onCallEnd   }, [onCallEnd])

  const connectRtc = useCallback(async (sipUsername: string, sipPassword: string) => {
    if (typeof window === 'undefined' || clientRef.current) return
    setRtcStatus('connecting')
    setRtcError(null)
    try {
      const { TelnyxRTC } = await import('@telnyx/webrtc')
      const client = new TelnyxRTC({ login: sipUsername, password: sipPassword })

      client.on('telnyx.ready', () => {
        setRtcStatus('ready')
        onReadyRef.current?.()
      })

      client.on('telnyx.error', (err: Error) => {
        setRtcStatus('error')
        setRtcError(err?.message ?? 'WebRTC error')
      })

      client.on('telnyx.socket.close', () => {
        setRtcStatus('idle')
        setActiveRtcCall(null)
      })

      client.on('telnyx.notification', (notification: any) => {
        const { type, call } = notification

        if (type === 'callInvite') {
          // Auto-answer — this is a progressive dialer
          call.answer()
          setActiveRtcCall(call)
          setMuted(false)
          onCallStartRef.current?.(call)
        }

        if (type === 'callUpdate') {
          const state: string = call?.state ?? ''
          if (['hangup', 'destroy', 'purge'].includes(state)) {
            setActiveRtcCall(null)
            setMuted(false)
            onCallEndRef.current?.()
          } else {
            setActiveRtcCall((prev) => (prev?.id === call?.id ? call : prev))
          }
        }
      })

      client.connect()
      clientRef.current = client
    } catch (err: any) {
      setRtcStatus('error')
      setRtcError(err?.message ?? 'Failed to load WebRTC')
    }
  }, [])

  const disconnectRtc = useCallback(() => {
    try { clientRef.current?.disconnect() } catch { /* */ }
    clientRef.current = null
    setRtcStatus('idle')
    setActiveRtcCall(null)
    setMuted(false)
  }, [])

  const hangupRtcCall = useCallback(() => {
    try { activeRtcCall?.hangup() } catch { /* */ }
  }, [activeRtcCall])

  const toggleMute = useCallback(() => {
    if (!activeRtcCall) return
    if (muted) { activeRtcCall.unmute(); setMuted(false) }
    else        { activeRtcCall.mute();  setMuted(true)  }
  }, [activeRtcCall, muted])

  useEffect(() => () => { disconnectRtc() }, [disconnectRtc])

  return { rtcStatus, rtcError, activeRtcCall, muted, toggleMute, hangupRtcCall, connectRtc, disconnectRtc }
}
