import { useCallback, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

const SEND_INTERVAL_MS = 45
const MAX_EFFECT_EVENTS = 24

function getServerUrl() {
  const fromEnv = import.meta.env.VITE_MULTIPLAYER_URL
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv
  return undefined
}

export function useMultiplayer(displayName, sessionCode) {
  const [status, setStatus] = useState('connecting')
  const [localId, setLocalId] = useState(null)
  const [remotePlayers, setRemotePlayers] = useState({})
  const [combatById, setCombatById] = useState({})
  const [hitEvents, setHitEvents] = useState([])
  const [deathEvents, setDeathEvents] = useState([])
  const [localRespawnAt, setLocalRespawnAt] = useState(0)
  const [respawnToken, setRespawnToken] = useState(0)
  const [nowMs, setNowMs] = useState(0)
  const [sessionCloseAt, setSessionCloseAt] = useState(0)
  const socketRef = useRef(null)
  const lastSendRef = useRef(0)

  useEffect(() => {
    const name = typeof displayName === 'string' ? displayName.trim() : ''
    const room = typeof sessionCode === 'string' ? sessionCode.trim().toUpperCase() : ''
    if (!name || !room) return

    const url = getServerUrl()
    const socket = io(url, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
    })

    socketRef.current = socket

    const emitJoin = () => {
      socket.emit('join', { name, sessionCode: room })
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
      setCombatById(players || {})
    })

    socket.on('playerJoined', ({ id, x, y, z, yaw, name: playerName, ...rest }) => {
      setRemotePlayers((prev) => {
        if (id === socket.id) return prev
        return {
          ...prev,
          [id]: {
            x,
            y,
            z,
            yaw,
            name: playerName ?? 'Visitor',
            alive: rest.alive ?? true,
            health: rest.health ?? 100,
            kills: rest.kills ?? 0,
            deaths: rest.deaths ?? 0,
            respawnAt: rest.respawnAt ?? 0,
          },
        }
      })
      setCombatById((prev) => ({
        ...prev,
        [id]: {
          ...(prev[id] || {}),
          x,
          y,
          z,
          yaw,
          name: playerName ?? 'Visitor',
          alive: rest.alive ?? true,
          health: rest.health ?? 100,
          kills: rest.kills ?? 0,
          deaths: rest.deaths ?? 0,
          respawnAt: rest.respawnAt ?? 0,
        },
      }))
    })

    socket.on('playerMoved', ({ id, x, y, z, yaw, name: playerName, ...rest }) => {
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
            alive: rest.alive ?? prev[id]?.alive ?? true,
            health: rest.health ?? prev[id]?.health ?? 100,
            kills: rest.kills ?? prev[id]?.kills ?? 0,
            deaths: rest.deaths ?? prev[id]?.deaths ?? 0,
            respawnAt: rest.respawnAt ?? prev[id]?.respawnAt ?? 0,
          },
        }
      })
      setCombatById((prev) => ({
        ...prev,
        [id]: {
          ...(prev[id] || {}),
          x,
          y,
          z,
          yaw,
          name: playerName ?? prev[id]?.name ?? 'Visitor',
          alive: rest.alive ?? prev[id]?.alive ?? true,
          health: rest.health ?? prev[id]?.health ?? 100,
          kills: rest.kills ?? prev[id]?.kills ?? 0,
          deaths: rest.deaths ?? prev[id]?.deaths ?? 0,
          respawnAt: rest.respawnAt ?? prev[id]?.respawnAt ?? 0,
        },
      }))
    })

    socket.on('playerDamaged', ({ id, by, health, x, y, z }) => {
      setCombatById((prev) => {
        const existing = prev[id]
        if (!existing) return prev
        return { ...prev, [id]: { ...existing, health, x, y, z } }
      })
      setHitEvents((prev) => {
        const next = [...prev, { key: `${id}-${Date.now()}-${Math.random()}`, id, by, x, y, z }]
        return next.slice(-MAX_EFFECT_EVENTS)
      })
    })

    socket.on('playerDied', ({ id, by, x, y, z, respawnAt, stats }) => {
      setRemotePlayers((prev) => {
        if (!prev || !prev[id]) return prev
        return {
          ...prev,
          [id]: {
            ...prev[id],
            alive: false,
            health: 0,
          },
        }
      })
      setCombatById((prev) => {
        const next = { ...prev }
        if (next[id]) {
          next[id] = { ...next[id], alive: false, health: 0, x, y, z, respawnAt: respawnAt || 0 }
        }
        if (stats && typeof stats === 'object') {
          Object.entries(stats).forEach(([pid, value]) => {
            if (!next[pid]) return
            next[pid] = {
              ...next[pid],
              kills: typeof value?.kills === 'number' ? value.kills : next[pid].kills,
              deaths: typeof value?.deaths === 'number' ? value.deaths : next[pid].deaths,
            }
          })
        }
        return next
      })
      setDeathEvents((prev) => {
        const next = [...prev, { key: `${id}-${Date.now()}-${Math.random()}`, id, by, x, y, z }]
        return next.slice(-MAX_EFFECT_EVENTS)
      })
      if (id === socket.id && respawnAt) {
        setLocalRespawnAt(respawnAt)
      }
    })

    socket.on('playerRespawn', ({ id, health }) => {
      setRemotePlayers((prev) => {
        if (!prev || !prev[id]) return prev
        return {
          ...prev,
          [id]: {
            ...prev[id],
            alive: true,
            health: typeof health === 'number' ? health : 100,
          },
        }
      })
      setCombatById((prev) => {
        const existing = prev[id]
        if (!existing) return prev
        return {
          ...prev,
          [id]: {
            ...existing,
            alive: true,
            health: typeof health === 'number' ? health : 100,
            respawnAt: 0,
          },
        }
      })
      if (id === socket.id) {
        setLocalRespawnAt(0)
        setRespawnToken((n) => n + 1)
      }
    })

    socket.on('playerLeft', (id) => {
      setRemotePlayers((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      setCombatById((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    })

    socket.on('sessionClosed', ({ countdownMs }) => {
      const delayMs = Math.max(0, Number(countdownMs) || 3000)
      setSessionCloseAt(Date.now() + delayMs)
      setStatus('disconnected')
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
      setSessionCloseAt(0)
    }
  }, [displayName, sessionCode])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now())
    }, 120)
    return () => window.clearInterval(timer)
  }, [])

  const sendTransform = useCallback((t) => {
    const socket = socketRef.current
    if (!socket?.connected) return
    const now = performance.now()
    if (now - lastSendRef.current < SEND_INTERVAL_MS) return
    lastSendRef.current = now
    socket.emit('transform', t)
  }, [])

  const reportPlayerHit = useCallback((victimId) => {
    const socket = socketRef.current
    if (!socket?.connected || !victimId) return
    socket.emit('playerHit', { victimId })
  }, [])

  const localCombat = localId ? combatById[localId] : null
  const respawnRemaining = Math.max(
    0,
    localRespawnAt ? Math.ceil((localRespawnAt - nowMs) / 1000) : 0,
  )
  const sessionCloseRemaining = Math.max(
    0,
    sessionCloseAt ? Math.ceil((sessionCloseAt - nowMs) / 1000) : 0,
  )

  return {
    status,
    localId,
    remotePlayers,
    combatById,
    hitEvents,
    deathEvents,
    localCombat,
    respawnRemaining,
    sessionCloseRemaining,
    respawnToken,
    sendTransform,
    reportPlayerHit,
  }
}
