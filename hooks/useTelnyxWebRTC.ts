'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { clearDialerAudioActiveCallBlock, stopAllDialerAudio } from '@/lib/dialerSounds'

export interface TelnyxCall {
  id: string
  state: string | number
  prevState?: string | number
  direction?: string
  telnyxCallControlId?: string
  telnyxLegId?: string
  telnyxSessionId?: string
  options?: {
    remoteSdp?: string
    remoteCallerNumber?: string
    remoteCallerName?: string
  }
  answer: () => void | Promise<void>
  hangup: () => void | Promise<void>
  mute?: () => void
  unmute?: () => void
  muteAudio?: () => void
  unmuteAudio?: () => void
}

export type RtcStatus = 'idle' | 'connecting' | 'ready' | 'error'

function normalizeSipLogin(value: string): string {
  return (value ?? '').trim().replace(/^sip:/i, '').split('@')[0]
}

const TELNYX_STATE_BY_NUMBER: Record<number, string> = {
  0: 'new',
  1: 'requesting',
  2: 'trying',
  3: 'recovering',
  4: 'ringing',
  5: 'answering',
  6: 'early',
  7: 'active',
  8: 'held',
  9: 'hangup',
  10: 'destroy',
  11: 'purge',
}

const ANSWERABLE_STATES = new Set([
  'new',
  'requesting',
  'trying',
  'recovering',
  'ringing',
  'answering',
  'early',
])

const ACTIVE_STATES = new Set(['active', 'held'])
const ENDED_STATES = new Set(['hangup', 'destroy', 'purge'])

function normalizeCallState(state: unknown): string {
  if (typeof state === 'number') return TELNYX_STATE_BY_NUMBER[state] ?? String(state)

  return String(state ?? '')
    .trim()
    .toLowerCase()
    .replace(/^telnyx_rtc\./, '')
}

function getCallId(call: Partial<TelnyxCall> | null | undefined): string | null {
  return call?.id ?? call?.telnyxCallControlId ?? call?.telnyxLegId ?? call?.telnyxSessionId ?? null
}

function summarizeCall(call: Partial<TelnyxCall> | null | undefined) {
  return {
    callId: getCallId(call),
    state: normalizeCallState(call?.state),
    rawState: call?.state,
    prevState: normalizeCallState(call?.prevState),
    rawPrevState: call?.prevState,
    direction: call?.direction,
    telnyxCallControlId: call?.telnyxCallControlId,
    telnyxLegId: call?.telnyxLegId,
    telnyxSessionId: call?.telnyxSessionId,
    remoteCallerNumber: call?.options?.remoteCallerNumber,
    remoteCallerName: call?.options?.remoteCallerName,
    hasRemoteSdp: Boolean(call?.options?.remoteSdp),
  }
}

async function requestMicrophonePermission() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  stream.getTracks().forEach((track) => track.stop())
}

function ensureRemoteAudioElement(): HTMLAudioElement | null {
  if (typeof document === 'undefined') return null

  const existing = document.getElementById('telnyx-remote-audio')
  if (existing instanceof HTMLAudioElement) return existing

  const audio = document.createElement('audio')
  audio.id = 'telnyx-remote-audio'
  audio.autoplay = true
  audio.setAttribute('playsinline', 'true')
  audio.style.display = 'none'
  document.body.appendChild(audio)
  return audio
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
  const activeRtcCallRef = useRef<TelnyxCall | null>(null)
  const answeredCallIdsRef = useRef<Set<string>>(new Set())
  const answeringCallObjectsRef = useRef<WeakSet<object>>(new WeakSet())
  const activeLoggedCallIdsRef = useRef<Set<string>>(new Set())
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

      console.log('[RTC] connecting')
      await requestMicrophonePermission()

      const { TelnyxRTC } = await import('@telnyx/webrtc')
      const client = new TelnyxRTC({ login, password })
      const remoteAudio = ensureRemoteAudioElement()
      if (remoteAudio) {
        client.remoteElement = remoteAudio
      }

      console.log('[RTC_CLIENT_CREATED]', { sdk: '@telnyx/webrtc' })

      const markActiveCall = (call: TelnyxCall) => {
        const callId = getCallId(call)
        stopAllDialerAudio('RTC_CALL_ACTIVE')
        activeRtcCallRef.current = call
        setActiveRtcCall(call)
        setMuted(false)

        if (!callId || activeLoggedCallIdsRef.current.has(callId)) return

        activeLoggedCallIdsRef.current.add(callId)
        console.log('[RTC_CALL_ACTIVE]', summarizeCall(call))
        onCallStartRef.current?.(call)
      }

      const clearActiveCall = (call: TelnyxCall | null | undefined) => {
        const callId = getCallId(call)
        if (callId) {
          answeredCallIdsRef.current.delete(callId)
          activeLoggedCallIdsRef.current.delete(callId)
        }

        activeRtcCallRef.current = null
        setActiveRtcCall(null)
        setMuted(false)
        console.log('[RTC_CALL_HANGUP]', summarizeCall(call))
        clearDialerAudioActiveCallBlock('RTC_CALL_HANGUP')
        onCallEndRef.current?.()
      }

      const hasAnswerAttempt = (call: TelnyxCall, callId: string | null) => {
        if (callId) return answeredCallIdsRef.current.has(callId)
        return answeringCallObjectsRef.current.has(call as unknown as object)
      }

      const markAnswerAttempt = (call: TelnyxCall, callId: string | null) => {
        if (callId) answeredCallIdsRef.current.add(callId)
        else answeringCallObjectsRef.current.add(call as unknown as object)
      }

      const unmarkAnswerAttempt = (call: TelnyxCall, callId: string | null) => {
        if (callId) answeredCallIdsRef.current.delete(callId)
        else answeringCallObjectsRef.current.delete(call as unknown as object)
      }

      const isInboundCall = (notification: any, call: TelnyxCall) => {
        const type = String(notification?.type ?? '').toLowerCase()
        const direction = String(call.direction ?? notification?.direction ?? '').toLowerCase()

        return (
          direction === 'inbound' ||
          type === 'callinvite' ||
          type === 'invite' ||
          Boolean(call.options?.remoteSdp)
        )
      }

      const isAnswerableInboundCall = (notification: any, call: TelnyxCall) => {
        const state = normalizeCallState(call.state)
        const type = String(notification?.type ?? '').toLowerCase()

        return (
          isInboundCall(notification, call) &&
          !ENDED_STATES.has(state) &&
          (
            ANSWERABLE_STATES.has(state) ||
            type === 'callinvite' ||
            type === 'invite'
          )
        )
      }

      const handleNotification = async (notification: any) => {
        const { type, call } = notification
        const rtcCall = call as TelnyxCall | undefined
        const callId = getCallId(rtcCall)
        const state = normalizeCallState(rtcCall?.state)
        const summary = {
          type,
          ...summarizeCall(rtcCall),
        }

        console.log('[RTC_NOTIFICATION]', summary)

        if (type === 'callUpdate' || rtcCall) {
          console.log('[RTC_CALL_UPDATE]', summary)
        }

        if (!rtcCall) return

        if (activeRtcCallRef.current && getCallId(activeRtcCallRef.current) === callId) {
          activeRtcCallRef.current = rtcCall
          setActiveRtcCall(rtcCall)
        }

        if (ACTIVE_STATES.has(state)) {
          markActiveCall(rtcCall)
          return
        }

        if (ENDED_STATES.has(state)) {
          clearActiveCall(rtcCall)
          return
        }

        if (!isAnswerableInboundCall(notification, rtcCall)) return

        activeRtcCallRef.current = rtcCall
        setActiveRtcCall(rtcCall)
        setMuted(false)

        stopAllDialerAudio('RTC_INBOUND_CALL_DETECTED')
        console.log('[RTC_INBOUND_CALL_DETECTED]', summary)

        if (hasAnswerAttempt(rtcCall, callId)) return

        markAnswerAttempt(rtcCall, callId)

        try {
          if (typeof rtcCall.answer !== 'function') {
            throw new Error('Telnyx call object does not expose answer()')
          }

          stopAllDialerAudio('RTC_AUTO_ANSWER_ATTEMPT')
          console.log('[RTC_AUTO_ANSWER_ATTEMPT]', summary)

          const answerResult = rtcCall.answer()
          if (answerResult && typeof answerResult.then === 'function') {
            await answerResult
          }

          stopAllDialerAudio('RTC_AUTO_ANSWER_SUCCESS')
          console.log('[RTC_AUTO_ANSWER_SUCCESS]', {
            ...summary,
            stateAfterAnswer: normalizeCallState(rtcCall.state),
            rawStateAfterAnswer: rtcCall.state,
          })

          if (ACTIVE_STATES.has(normalizeCallState(rtcCall.state))) {
            markActiveCall(rtcCall)
          }
        } catch (err) {
          console.error('[RTC_AUTO_ANSWER_ERROR]', err, {
            ...summary,
            errorName: err instanceof Error ? err.name : undefined,
            errorMessage: err instanceof Error ? err.message : String(err),
            errorStack: err instanceof Error ? err.stack : undefined,
          })
          unmarkAnswerAttempt(rtcCall, callId)
          setRtcStatus('error')
          setRtcError(err instanceof Error ? err.message : 'Failed to answer WebRTC call')
        }
      }

      client.on('telnyx.socket.open', () => {
        console.log('[RTC_SOCKET_OPEN]')
        try {
          const register = (client as any).register
          if (typeof register === 'function') register.call(client)
          console.log('[RTC_REGISTER_CALLED]', { available: typeof register === 'function' })
        } catch (err) {
          console.warn('[RTC_REGISTER_CALLED]', { error: err })
        }
      })

      client.on('telnyx.ready', () => {
        console.log('[RTC_READY]')
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
        activeRtcCallRef.current = null
        setActiveRtcCall(null)
        clearDialerAudioActiveCallBlock('RTC_SOCKET_CLOSE')
      })

      client.on('telnyx.notification', handleNotification)

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
    activeRtcCallRef.current = null
    setActiveRtcCall(null)
    setMuted(false)
    clearDialerAudioActiveCallBlock('RTC_DISCONNECT')
  }, [])

  const hangupRtcCall = useCallback(() => {
    try { activeRtcCallRef.current?.hangup() } catch { /* noop */ }
  }, [activeRtcCall])

  const toggleMute = useCallback(() => {
    if (!activeRtcCall) return

    if (muted) {
      if (activeRtcCall.unmuteAudio) activeRtcCall.unmuteAudio()
      else activeRtcCall.unmute?.()
      setMuted(false)
    } else {
      if (activeRtcCall.muteAudio) activeRtcCall.muteAudio()
      else activeRtcCall.mute?.()
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
