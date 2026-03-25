export function CapsuleGun({ reloadProgress = 0, isReloading = false }) {
  // Simple reload animation: tilt + lower gun as reload progresses.
  const reloadCurve = Math.sin(reloadProgress * Math.PI)
  const reloadTilt = -reloadCurve * 1.15
  const reloadYaw = reloadCurve * 0.34
  const reloadDrop = reloadCurve * 0.22
  const magOut = reloadCurve * 0.2
  return (
    <group
      position={[0.55, -0.12 - reloadDrop, 0.1]}
      rotation={[-0.02 + reloadTilt, 0.06 + reloadYaw, -0.12]}
    >
      <mesh castShadow>
        <boxGeometry args={[0.14, 0.12, 0.38]} />
        <meshStandardMaterial color="#8d5560" roughness={0.42} />
      </mesh>
      <mesh position={[0, 0.02, 0.26]} castShadow>
        <cylinderGeometry args={[0.036, 0.042, 0.2, 14]} />
        <meshStandardMaterial color="#c2b8a8" metalness={0.25} roughness={0.35} />
      </mesh>
      {isReloading ? (
        <mesh position={[0.02, -0.09 - magOut, -0.02 - magOut * 0.2]} castShadow>
          <boxGeometry args={[0.06, 0.09, 0.1]} />
          <meshStandardMaterial
            color="#7f5660"
            roughness={0.42}
            emissive="#a1717b"
            emissiveIntensity={0.45}
          />
        </mesh>
      ) : null}
    </group>
  )
}
