import { useCallback, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

const SEND_INTERVAL_MS = 45

function getServerUrl() {
  const fromEnv = import.meta.env.VITE_MULTIPLAYER_URL
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv
  return undefined
}

export function useMultiplayer(displayName) {
  const [status, setStatus] = useState('connecting')
  const [localId, setLocalId] = useState(null)
  const [remotePlayers, setRemotePlayers] = useState({})
  const socketRef = useRef(null)
  const lastSendRef = useRef(0)

  useEffect(() => {
    const name = typeof displayName === 'string' ? displayName.trim() : ''
    if (!name) return

    const url = getServerUrl()
    const socket = io(url, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
    })

    socketRef.current = socket

    const emitJoin = () => {
      socket.emit('join', { name })
    }

    const onConnect = () => {
      setStatus('connected')
      emitJoin()
    }

    const onDisconnect = () => setStatus('disconnected')
    const onConnectError = () => setStatus('error')

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)

    socket.on('welcome', ({ id: myId, players }) => {
      setLocalId(myId)
      const others = { ...players }
      delete others[myId]
      setRemotePlayers(others)
    })

    socket.on('playerJoined', ({ id, x, y, z, yaw, name: playerName }) => {
      setRemotePlayers((prev) => {
        if (id === socket.id) return prev
        return {
          ...prev,
          [id]: { x, y, z, yaw, name: playerName ?? 'Visitor' },
        }
      })
    })

    socket.on('playerMoved', ({ id, x, y, z, yaw, name: playerName }) => {
      if (id === socket.id) return
      setRemotePlayers((prev) => {
        const prevName = prev[id]?.name
        return {
          ...prev,
          [id]: {
            x,
            y,
            z,
            yaw,
            name: playerName ?? prevName ?? 'Visitor',
          },
        }
      })
    })

    socket.on('playerLeft', (id) => {
      setRemotePlayers((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    })

    if (socket.connected) {
      queueMicrotask(() => {
        setStatus('connected')
        emitJoin()
      })
    }

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.removeAllListeners()
      socket.disconnect()
      socketRef.current = null
    }
  }, [displayName])

  const sendTransform = useCallback((t) => {
    const socket = socketRef.current
    if (!socket?.connected) return
    const now = performance.now()
    if (now - lastSendRef.current < SEND_INTERVAL_MS) return
    lastSendRef.current = now
    socket.emit('transform', t)
  }, [])

  return {
    status,
    localId,
    remotePlayers,
    sendTransform,
  }
}
