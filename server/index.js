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

/** @type {Record<string, { x: number; y: number; z: number; yaw: number; name: string }>} */
const players = Object.create(null)

function sanitizeName(raw) {
  if (typeof raw !== 'string') return 'Visitor'
  const trimmed = raw.trim().slice(0, 24)
  return trimmed.length > 0 ? trimmed : 'Visitor'
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
    players[id] = { ...DEFAULT_SPAWN, name }

    socket.emit('welcome', {
      id,
      players: { ...players },
    })

    socket.broadcast.emit('playerJoined', { id, ...players[id] })
  }

  socket.once('join', onJoin)

  socket.on('transform', (data) => {
    const p = players[id]
    if (!p || !data || typeof data !== 'object') return
    if (typeof data.x === 'number') p.x = data.x
    if (typeof data.y === 'number') p.y = data.y
    if (typeof data.z === 'number') p.z = data.z
    if (typeof data.yaw === 'number') p.yaw = data.yaw
    socket.broadcast.emit('playerMoved', {
      id,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      name: p.name,
    })
  })

  socket.on('disconnect', () => {
    delete players[id]
    io.emit('playerLeft', id)
  })
})

httpServer.listen(PORT, () => {
  console.log(`[multiplayer] listening on ${PORT}`)
  console.log(`[multiplayer] allowed origins: ${allowedOrigins.join(', ')}`)
})
