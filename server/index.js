import process from 'node:process'
import { createServer } from 'node:http'
import { Server } from 'socket.io'

const PORT = Number(process.env.PORT || process.env.MULTIPLAYER_PORT || 3001)
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'https://cs122-project.vercel.app'
const EXTRA_CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const allowedOrigins = [
  FRONTEND_ORIGIN,
  'https://franciscomoralespuente.com',
  'https://www.franciscomoralespuente.com',
  'http://localhost:5173',
  ...EXTRA_CORS_ORIGINS,
]

const DEFAULT_SPAWN = { x: 0, y: 1, z: 6, yaw: 0 }
const MAX_HEALTH = 100
const PLAYER_HIT_DAMAGE = 34
const RESPAWN_MS = 3000
const DEFAULT_SESSION = 'PUBLIC'

/** @type {Record<string, {
 * x: number; y: number; z: number; yaw: number; name: string;
 * health: number; alive: boolean; kills: number; deaths: number; respawnAt: number;
 * }>} */
const players = Object.create(null)
const socketSession = Object.create(null)
const socketUserId = Object.create(null)
const sessionFirstSocket = Object.create(null)
const sessionHostUserId = Object.create(null)
const sessionMuseumLive = Object.create(null)
const sessionFavoritesRoundActive = Object.create(null)
/** @type {Record<string, Record<string, string[]>>} */
const sessionFavoritesPicks = Object.create(null)

const MAX_FAVORITE_PICKS = 5

function sanitizeSessionCode(raw) {
  if (typeof raw !== 'string') return DEFAULT_SESSION
  const code = raw.trim().toUpperCase().replace(/[^A-Z]/g, '')
  return code.length > 0 ? code.slice(0, 4) : DEFAULT_SESSION
}

function sanitizeName(raw) {
  if (typeof raw !== 'string') return 'Visitor'
  const trimmed = raw.trim().slice(0, 24)
  return trimmed.length > 0 ? trimmed : 'Visitor'
}

function sanitizeUserId(raw) {
  if (typeof raw !== 'string') return ''
  const t = raw.trim()
  return t.length > 0 ? t.slice(0, 128) : ''
}

function clearSessionRoom(sessionCode) {
  delete sessionFirstSocket[sessionCode]
  delete sessionHostUserId[sessionCode]
  delete sessionMuseumLive[sessionCode]
  delete sessionFavoritesRoundActive[sessionCode]
  delete sessionFavoritesPicks[sessionCode]
}

function getSessionHostUserId(sessionCode) {
  return sessionHostUserId[sessionCode] || ''
}

function getConnectedUserIds(sessionCode) {
  const set = new Set()
  for (const sid of Object.keys(players)) {
    if (socketSession[sid] !== sessionCode) continue
    const u = socketUserId[sid]
    if (u) set.add(u)
  }
  return [...set].sort()
}

function broadcastSessionPresence(io, sessionCode) {
  const userIds = getConnectedUserIds(sessionCode)
  io.to(sessionCode).emit('sessionPresence', { userIds })
}

const httpServer = createServer()
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Allow server-to-server or local tools without browser origin header.
      if (!origin) return callback(null, true)
      if (allowedOrigins.includes(origin)) return callback(null, true)
      return callback(new Error(`CORS blocked for origin: ${origin}`), false)
    },
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})

io.on('connection', (socket) => {
  const id = socket.id

  const onJoin = (payload) => {
    if (players[id]) return
    const name = sanitizeName(payload?.name)
    const sessionCode = sanitizeSessionCode(payload?.sessionCode)
    const userId = sanitizeUserId(payload?.userId)
    const hostUserId = sanitizeUserId(payload?.hostUserId)
    const inMuseum = Boolean(payload?.inMuseum)

    socketSession[id] = sessionCode
    socketUserId[id] = userId
    socket.join(sessionCode)
    if (!sessionFirstSocket[sessionCode]) {
      sessionFirstSocket[sessionCode] = id
    }
    if (hostUserId) {
      sessionHostUserId[sessionCode] = hostUserId
    }
    players[id] = {
      ...DEFAULT_SPAWN,
      name,
      health: MAX_HEALTH,
      alive: true,
      kills: 0,
      deaths: 0,
      respawnAt: 0,
    }

    const hid = sessionHostUserId[sessionCode] || ''
    const isDbHost = Boolean(userId && hid && userId === hid)
    if (inMuseum && (isDbHost || !hid)) {
      sessionMuseumLive[sessionCode] = true
      io.to(sessionCode).emit('museumSessionLive', { live: true })
    }

    const roomPlayers = Object.fromEntries(
      Object.entries(players).filter(([sid]) => socketSession[sid] === sessionCode),
    )

    const legacyHostSocket = sessionFirstSocket[sessionCode] || null
    const connectedUserIds = getConnectedUserIds(sessionCode)

    socket.emit('welcome', {
      id,
      players: roomPlayers,
      sessionCode,
      hostId: legacyHostSocket,
      museumSessionLive: Boolean(sessionMuseumLive[sessionCode]),
      favoritesRoundActive: Boolean(sessionFavoritesRoundActive[sessionCode]),
      favoritesPicks: sessionFavoritesPicks[sessionCode]
        ? { ...sessionFavoritesPicks[sessionCode] }
        : {},
      connectedUserIds,
    })

    socket.to(sessionCode).emit('playerJoined', { id, ...players[id] })
    broadcastSessionPresence(io, sessionCode)
  }

  socket.once('join', onJoin)

  socket.on('favoritesStartRound', () => {
    const sessionCode = socketSession[id] || DEFAULT_SESSION
    const uid = socketUserId[id] || ''
    const hid = getSessionHostUserId(sessionCode)
    if (hid) {
      if (uid !== hid) return
    } else if (sessionFirstSocket[sessionCode] !== id) {
      return
    }
    sessionFavoritesRoundActive[sessionCode] = true
    sessionFavoritesPicks[sessionCode] = Object.create(null)
    io.to(sessionCode).emit('favoritesRound', {
      active: true,
      picks: { ...sessionFavoritesPicks[sessionCode] },
    })
  })

  socket.on('favoritesCancelRound', () => {
    const sessionCode = socketSession[id] || DEFAULT_SESSION
    const uid = socketUserId[id] || ''
    const hid = getSessionHostUserId(sessionCode)
    if (hid) {
      if (uid !== hid) return
    } else if (sessionFirstSocket[sessionCode] !== id) {
      return
    }
    sessionFavoritesRoundActive[sessionCode] = false
    delete sessionFavoritesPicks[sessionCode]
    io.to(sessionCode).emit('favoritesRound', {
      active: false,
      picks: {},
    })
  })

  socket.on('favoritesSubmitPicks', (payload) => {
    const sessionCode = socketSession[id] || DEFAULT_SESSION
    if (!sessionFavoritesRoundActive[sessionCode]) return
    const uid = socketUserId[id] || ''
    const submittedUser = sanitizeUserId(payload?.userId)
    if (!uid || !submittedUser || uid !== submittedUser) return
    const raw = payload?.artworkIds
    if (!Array.isArray(raw) || raw.length > MAX_FAVORITE_PICKS) return
    const ids = raw
      .map((x) => (x == null ? '' : String(x).trim()))
      .filter(Boolean)
      .slice(0, MAX_FAVORITE_PICKS)
    if (!sessionFavoritesPicks[sessionCode]) {
      sessionFavoritesPicks[sessionCode] = Object.create(null)
    }
    sessionFavoritesPicks[sessionCode][uid] = ids
    const merged = { ...sessionFavoritesPicks[sessionCode] }
    io.to(sessionCode).emit('favoritesPicksSync', { picks: merged })
  })

  socket.on('transform', (data) => {
    const p = players[id]
    if (!p || !data || typeof data !== 'object') return
    if (typeof data.x === 'number') p.x = data.x
    if (typeof data.y === 'number') p.y = data.y
    if (typeof data.z === 'number') p.z = data.z
    if (typeof data.yaw === 'number') p.yaw = data.yaw
    const sessionCode = socketSession[id] || DEFAULT_SESSION
    socket.to(sessionCode).emit('playerMoved', {
      id,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      name: p.name,
      health: p.health,
      alive: p.alive,
      kills: p.kills,
      deaths: p.deaths,
      respawnAt: p.respawnAt,
    })
  })

  socket.on('playerHit', ({ victimId }) => {
    if (typeof victimId !== 'string') return
    if (victimId === id) return
    const attacker = players[id]
    const victim = players[victimId]
    if (!attacker || !victim) return
    const attackerSession = socketSession[id] || DEFAULT_SESSION
    const victimSession = socketSession[victimId] || DEFAULT_SESSION
    if (attackerSession !== victimSession) return
    if (!attacker.alive || !victim.alive) return

    victim.health = Math.max(0, victim.health - PLAYER_HIT_DAMAGE)
    io.to(attackerSession).emit('playerDamaged', {
      id: victimId,
      by: id,
      health: victim.health,
      x: victim.x,
      y: victim.y,
      z: victim.z,
    })

    if (victim.health > 0) return

    victim.alive = false
    victim.deaths += 1
    victim.respawnAt = Date.now() + RESPAWN_MS
    attacker.kills += 1
    io.to(attackerSession).emit('playerDied', {
      id: victimId,
      by: id,
      x: victim.x,
      y: victim.y,
      z: victim.z,
      name: victim.name,
      respawnAt: victim.respawnAt,
      stats: {
        [id]: { kills: attacker.kills, deaths: attacker.deaths },
        [victimId]: { kills: victim.kills, deaths: victim.deaths },
      },
    })

    setTimeout(() => {
      const liveVictim = players[victimId]
      if (!liveVictim) return
      const respawnSession = socketSession[victimId] || DEFAULT_SESSION
      liveVictim.health = MAX_HEALTH
      liveVictim.alive = true
      liveVictim.respawnAt = 0
      io.to(respawnSession).emit('playerRespawn', {
        id: victimId,
        health: liveVictim.health,
      })
    }, RESPAWN_MS)
  })

  socket.on('disconnect', () => {
    const sessionCode = socketSession[id] || DEFAULT_SESSION
    const hid = sessionHostUserId[sessionCode] || ''
    const uid = socketUserId[id] || ''

    let otherHostTabs = 0
    if (hid) {
      otherHostTabs = Object.keys(players).filter(
        (sid) => sid !== id && socketSession[sid] === sessionCode && socketUserId[sid] === hid,
      ).length
    }

    const legacyHostSocket = sessionFirstSocket[sessionCode]
    const isHostSocket =
      (hid && uid === hid) || (!hid && legacyHostSocket === id)

    delete players[id]
    delete socketSession[id]
    delete socketUserId[id]

    if (isHostSocket && otherHostTabs > 0) {
      io.to(sessionCode).emit('playerLeft', id)
      broadcastSessionPresence(io, sessionCode)
      return
    }

    if (!isHostSocket) {
      io.to(sessionCode).emit('playerLeft', id)
      broadcastSessionPresence(io, sessionCode)
      return
    }

    // Host leaving closes the entire session for everyone else.
    io.to(sessionCode).emit('sessionClosed', {
      reason: 'host_left',
      countdownMs: 3000,
    })

    Object.keys(socketSession).forEach((sid) => {
      if (socketSession[sid] !== sessionCode) return
      delete players[sid]
      delete socketSession[sid]
      delete socketUserId[sid]
      const memberSocket = io.sockets.sockets.get(sid)
      if (memberSocket) memberSocket.leave(sessionCode)
    })

    clearSessionRoom(sessionCode)
  })
})

httpServer.listen(PORT, () => {
  console.log(`[multiplayer] listening on ${PORT}`)
  console.log(`[multiplayer] allowed origins: ${allowedOrigins.join(', ')}`)
})
