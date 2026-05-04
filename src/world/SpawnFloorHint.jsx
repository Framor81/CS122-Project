import { Text } from '@react-three/drei'

/** Subtle reminder at world spawn (museum mode). */
export function SpawnFloorHint({ spawn, combatEnabled, floorThickness = 0.12 }) {
  if (combatEnabled) return null
  const x = spawn?.x ?? 0
  const z = spawn?.z ?? 6
  const y = floorThickness + 0.02

  return (
    <group position={[x, y, z]}>
      <Text
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        fontSize={0.2}
        color="#c5b8a8"
        outlineWidth={0.02}
        outlineColor="#0a0908"
        anchorX="center"
        anchorY="middle"
        maxWidth={5}
        textAlign="center"
        lineHeight={1.35}
      >
        {`WASD / arrows — Shift to run\nExplore the museum`}
      </Text>
    </group>
  )
}
