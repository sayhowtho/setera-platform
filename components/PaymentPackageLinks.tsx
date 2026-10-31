'use client'
import { useState } from 'react'
import { PAYMENT_PACKAGES } from '@/lib/paymentPackages'

const money = (n: number) => '$' + n.toLocaleString('en-CA')
const moneyExact = (n: number) => '$' + n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// navigator.clipboard is unavailable on some mobile/in-app browsers, so fall
// back to a hidden textarea + execCommand.
async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch {}
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch { return false }
}

const btn: React.CSSProperties = { border: 'none', padding: '0 16px', minHeight: '44px', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '1 1 120px' }

export function PaymentPackageLinks() {
  const [copied, setCopied] = useState<string | null>(null)
  return (
    <div style={{ marginTop: '20px' }}>
      <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: 700, margin: '0 0 10px 0' }}>Standard packages — setup fee included</p>
      {PAYMENT_PACKAGES.map((pkg) => (
        <div key={pkg.name} style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px 20px', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' }}>
            <span style={{ color: '#0a1f13', fontSize: '14px', fontWeight: 700 }}>{pkg.name}</span>
            <span style={{ backgroundColor: '#fef3c7', color: '#92400e', fontSize: '12px', fontWeight: 700, padding: '2px 10px', borderRadius: '20px' }}>{'+ ' + money(pkg.setupFee) + ' Setup Fee'}</span>
          </div>
          <p style={{ color: '#374151', fontSize: '13px', margin: '0 0 2px 0' }}>{pkg.minutes.toLocaleString('en-CA')} min included</p>
          <p style={{ color: '#374151', fontSize: '13px', margin: '0 0 8px 0' }}>{money(pkg.setupFee) + ' setup + ' + moneyExact(pkg.monthly) + ' CAD/mo'}</p>
          <p style={{ color: '#9ca3af', fontSize: '11px', margin: '0 0 12px 0', fontFamily: 'monospace', wordBreak: 'break-all' }}>{pkg.url}</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={async () => { if (await copyText(pkg.url)) { setCopied(pkg.name); setTimeout(() => setCopied(c => (c === pkg.name ? null : c)), 2000) } }}
              style={{ ...btn, backgroundColor: copied === pkg.name ? '#10b981' : '#0f2318', color: '#fff', transition: 'background 0.15s' }}>
              {copied === pkg.name ? 'Copied' : 'Copy Link'}
            </button>
            <a href={pkg.url} target="_blank" rel="noopener noreferrer" style={{ ...btn, backgroundColor: '#fff', color: '#0f2318', border: '1px solid #0f2318' }}>Open Link</a>
          </div>
        </div>
      ))}
    </div>
  )
}
