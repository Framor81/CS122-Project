import './CombatHud.css'

export function CombatHud({ healthRatio, ammoInMag, reserveAmmo }) {
  const healthDeg = `${healthRatio * 360}deg`

  return (
    <div className="combat-hud" aria-hidden>
      <div
        className="combat-hud__health-ring"
        style={{
          background: `conic-gradient(#98d58e 0 ${healthDeg}, rgba(255,255,255,0.15) ${healthDeg} 360deg)`,
        }}
      >
        <div className="combat-hud__health-core">
          {ammoInMag}/{reserveAmmo}
        </div>
      </div>
    </div>
  )
}
