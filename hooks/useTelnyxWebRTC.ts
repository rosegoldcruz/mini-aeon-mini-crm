'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

export interface TelnyxCall {
  id: string
  state: string
  answer: () => void | Promise<void>
  hangup: () => void
  mute: () => void
  unmute: () => void
}

export type RtcStatus = 'idle' | 'connecting' | 'ready' | 'error'

function normalizeSipLogin(value: string): string {
  return (value ?? '').trim().replace(/^sip:/i, '').split('@')[0]
}

export function useTelnyxWebRTC(
  onReady?: () => void,
  onCallStart?: (call: TelnyxCall) => void,
  onCallEnd?: () => void,
) {
  const [rtcStatus, setRtcStatus] = useState<RtcStatus>('idle')
  const [rtcError, setRtcError] = useState<string | null>(null)
  const [activeRtcCall, setActiveRtcCall] = useState<TelnyxCall | null>(null)
  const [muted, setMuted] = useState(false)

  const clientRef = useRef<any>(null)
  const answeredCallIdsRef = useRef<Set<string>>(new Set())
  const onReadyRef = useRef(onReady)
  const onCallStartRef = useRef(onCallStart)
  const onCallEndRef = useRef(onCallEnd)

  useEffect(() => { onReadyRef.current = onReady }, [onReady])
  useEffect(() => { onCallStartRef.current = onCallStart }, [onCallStart])
  useEffect(() => { onCallEndRef.current = onCallEnd }, [onCallEnd])

  const connectRtc = useCallback(async (sipUsername: string, sipPassword: string) => {
    if (typeof window === 'undefined' || clientRef.current) return

    setRtcStatus('connecting')
    setRtcError(null)

    try {
      const login = normalizeSipLogin(sipUsername)
      const password = (sipPassword ?? '').trim()

      if (!login || !password) {
        throw new Error('Missing SIP credentials')
      }

      console.log('[RTC] connecting', { login })

      const { TelnyxRTC } = await import('@telnyx/webrtc')
      const client = new TelnyxRTC({ login, password })

      client.on('telnyx.socket.open', () => {
        console.log('[RTC] socket.open')
        try {
          ;(client as any).register?.()
          console.log('[RTC] explicit register called')
        } catch (err) {
          console.warn('[RTC] explicit register failed', err)
        }
      })

      client.on('telnyx.ready', () => {
        console.log('[RTC] ready')
        setRtcStatus('ready')
        onReadyRef.current?.()
      })

      client.on('telnyx.error', (err: Error) => {
        console.error('[RTC] error', err)
        setRtcStatus('error')
        setRtcError(err?.message ?? 'WebRTC error')
      })

      client.on('telnyx.socket.close', () => {
        console.warn('[RTC] socket.close')
        setRtcStatus('idle')
        setActiveRtcCall(null)
      })

      client.on('telnyx.notification', async (notification: any) => {
        const { type, call } = notification
        const state: string = call?.state ?? ''
        const callId = call?.id ?? call?.telnyxCallControlId ?? call?.telnyxLegId

        console.log('[RTC] notification', {
          type,
          callId,
          callState: state,
          telnyxCallControlId: call?.telnyxCallControlId,
        })

        const shouldAutoAnswer =
          !!call &&
          (
            type === 'callInvite' ||
            (type === 'callUpdate' && ['new', 'ringing'].includes(state))
          )

        if (shouldAutoAnswer && callId && !answeredCallIdsRef.current.has(callId)) {
          answeredCallIdsRef.current.add(callId)

          try {
            console.log('[RTC] auto-answering inbound agent call', {
              type,
              state,
              callId,
              telnyxCallControlId: call?.telnyxCallControlId,
            })

            setActiveRtcCall(call)
            setMuted(false)

            const answerResult = call.answer()
            if (answerResult && typeof answerResult.then === 'function') {
              await answerResult
            }

            console.log('[RTC] auto-answer returned OK', {
              callId,
              state: call?.state,
              telnyxCallControlId: call?.telnyxCallControlId,
            })

            onCallStartRef.current?.(call)
          } catch (err) {
            console.error('[RTC] auto-answer failed', err)
            answeredCallIdsRef.current.delete(callId)
            setRtcStatus('error')
            setRtcError(err instanceof Error ? err.message : 'Failed to answer WebRTC call')
          }
        }

        if (type === 'callUpdate') {
          if (['hangup', 'destroy', 'purge'].includes(state)) {
            console.warn('[RTC] call ended', { state, callId })
            if (callId) answeredCallIdsRef.current.delete(callId)
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
      console.error('[RTC] connect failed', err)
      setRtcStatus('error')
      setRtcError(err?.message ?? 'Failed to load WebRTC')
    }
  }, [])

  const disconnectRtc = useCallback(() => {
    try { clientRef.current?.disconnect() } catch { /* noop */ }
    clientRef.current = null
    setRtcStatus('idle')
    setActiveRtcCall(null)
    setMuted(false)
  }, [])

  const hangupRtcCall = useCallback(() => {
    try { activeRtcCall?.hangup() } catch { /* noop */ }
  }, [activeRtcCall])

  const toggleMute = useCallback(() => {
    if (!activeRtcCall) return

    if (muted) {
      activeRtcCall.unmute()
      setMuted(false)
    } else {
      activeRtcCall.mute()
      setMuted(true)
    }
  }, [activeRtcCall, muted])

  useEffect(() => () => { disconnectRtc() }, [disconnectRtc])

  return {
    rtcStatus,
    rtcError,
    activeRtcCall,
    muted,
    toggleMute,
    hangupRtcCall,
    connectRtc,
    disconnectRtc,
  }
}
