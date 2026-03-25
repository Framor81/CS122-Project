import { Billboard, Text } from '@react-three/drei'
import { useCapsuleColorFromName } from '../hooks/useCapsuleColorFromName.js'
import { usePlayerNameplate } from '../hooks/usePlayerNameplate.js'

function RemotePlayerEntity({ id, p, localId }) {
  const color = useCapsuleColorFromName(p.name)
  const nameplate = usePlayerNameplate(p.name)
  if (id === localId) return null

  return (
    <group position={[p.x, p.y, p.z]}>
      <group rotation={[0, p.yaw, 0]}>
        <mesh castShadow>
          <capsuleGeometry args={[0.4, 1.0, 8, 16]} />
          <meshStandardMaterial
            color={color}
            roughness={0.48}
            metalness={0.04}
            emissive={color}
            emissiveIntensity={0.09}
          />
        </mesh>
        <Text
          position={[0, 0.12, 0.41]}
          color="#3f2b2b"
          fontSize={0.14}
          anchorX="center"
          anchorY="middle"
        >
          :)
        </Text>
      </group>
      <Billboard
        position={nameplate.billboardPosition}
        follow
        lockX
        lockY
        lockZ
      >
        <Text
          fontSize={nameplate.fontSize}
          color={nameplate.color}
          outlineWidth={nameplate.outlineWidth}
          outlineColor={nameplate.outlineColor}
          anchorX="center"
          anchorY="bottom"
        >
          {nameplate.displayText}
        </Text>
      </Billboard>
    </group>
  )
}

export function RemotePlayers({ players, localId }) {
  return (
    <>
      {Object.entries(players).map(([id, p]) => (
        <RemotePlayerEntity key={id} id={id} p={p} localId={localId} />
      ))}
    </>
  )
}
