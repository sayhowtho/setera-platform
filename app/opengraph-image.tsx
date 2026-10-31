import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Setera: AI receptionist for contractors and home-service businesses across Canada. Nothing Slips.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: '#020806',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Pulse — background overlay */}
        <svg
          style={{ position: 'absolute', right: -80, top: -80, width: 780, height: 900 }}
          viewBox="0 0 700 800"
        >
          <defs>
            <radialGradient id="glow" cx="50%" cy="62%" r="40%">
              <stop offset="0%" stopColor="#00d4aa" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#00d4aa" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="700" height="800" fill="url(#glow)" />
          <polygon points="350,80 630,560 70,560" fill="none" stroke="#00d4aa" strokeWidth="0.8" strokeOpacity="0.06" />
          <polygon points="350,140 600,540 100,540" fill="none" stroke="#00d4aa" strokeWidth="0.8" strokeOpacity="0.1" />
          <polygon points="350,200 572,524 128,524" fill="none" stroke="#00d4aa" strokeWidth="1" strokeOpacity="0.15" />
          <polygon points="350,258 546,508 154,508" fill="none" stroke="#00d4aa" strokeWidth="1" strokeOpacity="0.22" />
          <polygon points="350,310 522,494 178,494" fill="none" stroke="#00d4aa" strokeWidth="1.2" strokeOpacity="0.3" />
          <polygon points="350,358 500,482 200,482" fill="none" stroke="#00d4aa" strokeWidth="1.5" strokeOpacity="0.45" />
          <polygon points="350,400 480,472 220,472" fill="none" stroke="#00d4aa" strokeWidth="2" strokeOpacity="0.65" />
          <polygon points="350,432 464,464 236,464" fill="#00d4aa" />
        </svg>

        {/* Text — full width */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            paddingLeft: 84,
            paddingRight: 84,
            height: 630,
            width: 1200,
          }}
        >
          <div style={{ fontSize: 220, fontWeight: 700, color: 'white', letterSpacing: -8, lineHeight: 1, marginBottom: 24, display: 'flex' }}>
            SETERA
          </div>

          <div style={{ fontSize: 52, fontWeight: 600, color: 'white', lineHeight: 1.2, marginBottom: 20, display: 'flex' }}>
            AI receptionist for contractors across Canada.
          </div>

          <div style={{ fontSize: 30, color: '#00d4aa', letterSpacing: 4, display: 'flex' }}>
            Nothing Slips.
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}