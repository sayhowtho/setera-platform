'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode, type RefObject } from 'react';
import { usePathname } from 'next/navigation';

/*
 * PROTECTED: the ElevenLabs voice widget is how every visitor hears Emily.
 * Same agent-id, same embed script, same element, same default
 * (bottom-right) position as the original homepage embed. Don't change
 * widget config or how the script loads without re-verifying on desktop
 * and phone widths that it appears and starts both a voice call and chat.
 *
 * It lives in the (marketing) layout, so it mounts once and survives
 * client-side page navigations; nothing here ever unmounts or re-keys the
 * element, so a conversation in progress is never reset.
 */
const AGENT_ID = 'agent_your_elevenlabs_agent_id';
const SCRIPT_SRC = 'https://unpkg.com/@elevenlabs/convai-widget-embed';

type EmilyContext = {
  talkToEmily: () => void;
  setHeroVisible: (visible: boolean) => void;
};

const Ctx = createContext<EmilyContext | null>(null);

export function useEmily() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useEmily must be used inside <EmilyWidgetProvider>');
  return ctx;
}

/** Homepage only: keep the widget out of the way while the hero is on screen. */
export function useHideEmilyWhileVisible(ref: RefObject<HTMLElement | null>) {
  const { setHeroVisible } = useEmily();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setHeroVisible(entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      setHeroVisible(false);
    };
  }, [ref, setHeroVisible]);
}

export function EmilyWidgetProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // On a fresh homepage load the hero is in view, so start hidden there
  // (matches the original behaviour); every other page shows it at once.
  const [heroVisible, setHeroVisibleState] = useState(pathname === '/');
  // Once the widget has been shown it stays shown for the session, so a
  // conversation in progress is never hidden by scrolling back to a hero.
  const [latched, setLatched] = useState(pathname !== '/');
  const show = latched || !heroVisible;

  const setHeroVisible = useCallback((visible: boolean) => {
    setHeroVisibleState(visible);
    if (!visible) setLatched(true);
  }, []);

  useEffect(() => {
    if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) return;
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    document.body.appendChild(script);
  }, []);

  const talkToEmily = useCallback(() => {
    // Force the widget visible right away instead of waiting on the hero
    // observer, then scroll to it once it has real layout dimensions.
    setLatched(true);
    window.setTimeout(() => {
      document.querySelector('elevenlabs-convai')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
    // Give the scroll a moment before opening the widget's own panel.
    window.setTimeout(() => {
      try {
        const widget = document.querySelector('elevenlabs-convai') as HTMLElement | null;
        widget?.shadowRoot?.querySelector('button')?.click();
      } catch {
        // Widget not ready yet; the visitor can still click it directly.
      }
    }, 500);
  }, []);

  return (
    <Ctx.Provider value={{ talkToEmily, setHeroVisible }}>
      {children}
      <div style={{ display: show ? undefined : 'none' }}>
        <elevenlabs-convai agent-id={AGENT_ID}></elevenlabs-convai>
      </div>
    </Ctx.Provider>
  );
}

/** A "Talk to Emily" button usable from server-rendered pages. */
export function TalkToEmilyButton({ className, children = 'Talk to Emily' }: { className?: string; children?: ReactNode }) {
  const { talkToEmily } = useEmily();
  return (
    <button type="button" onClick={talkToEmily} className={className}>
      {children}
    </button>
  );
}
