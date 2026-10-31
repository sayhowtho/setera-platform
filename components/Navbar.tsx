'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Navbar.module.css';
import { BRAND, CTA, NAV_LINKS, logoSrc } from '../lib/site-content';

type Surface = 'dark' | 'light';
const NAV_HEIGHT = 68;

// Which surface is directly under the fixed nav: the nearest ancestor with
// data-surface="light|dark" of whatever sits just below the nav's bottom
// edge. Pages default to dark. rAF-throttled, passive scroll listener.
function useSurfaceUnderNav(pathname: string): Surface {
  const [surface, setSurface] = useState<Surface>('dark');
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const stack = document.elementsFromPoint(window.innerWidth / 2, NAV_HEIGHT + 1);
      const under = stack.find((el) => !el.closest('nav, [data-nav-overlay]'));
      const marked = under?.closest<HTMLElement>('[data-surface]');
      setSurface(marked?.dataset.surface === 'light' ? 'light' : 'dark');
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(check); };
    check();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pathname]);
  return surface;
}

function MobileMenu({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className={styles.mobileMenu} data-nav-overlay>
      {NAV_LINKS.map(({ href, label }) => (
        <Link key={href} href={href} className={styles.mobileTopLink} onClick={onClose}>{label}</Link>
      ))}
      <div className={styles.mobileDivider} />
      <Link href="/auth/login" className={styles.mobileTopLink} onClick={onClose}>Login</Link>
      <Link href={CTA.demoHref} className={styles.mobileCta} onClick={onClose}>{CTA.demo.toUpperCase()}</Link>
    </div>
  );
}

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const detected = useSurfaceUnderNav(pathname);
  // The mobile menu is always dark, so keep the bar dark while it's open.
  const surface: Surface = menuOpen ? 'dark' : detected;

  return (
    <>
      <nav className={styles.nav} data-nav-surface={surface}>
        <Link href="/" className={styles.navLogo} onClick={() => setMenuOpen(false)} aria-label={`${BRAND.name} home`}>
          {/* Both variants are rendered (≈5 KB each) and swapped with CSS so
              crossing into a light section never waits on an image load. */}
          <Image
            src={logoSrc('dark')}
            alt=""
            width={BRAND.logo.width}
            height={BRAND.logo.height}
            priority
            sizes="180px"
            className={`${styles.logoImg} ${styles.logoOnDark}`}
          />
          <Image
            src={logoSrc('light')}
            alt=""
            width={BRAND.logo.width}
            height={BRAND.logo.height}
            loading="eager"
            sizes="180px"
            className={`${styles.logoImg} ${styles.logoOnLight}`}
          />
        </Link>

        <ul className={styles.navLinks}>
          {NAV_LINKS.map(({ href, label }) => (
            <li key={href}>
              <Link href={href} className={styles.navLink} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>
            </li>
          ))}
        </ul>

        <div className={styles.navRight}>
          <Link href="/auth/login" className={styles.navLoginLink}>Login</Link>
          <Link href={CTA.demoHref} className={styles.navCta}>{CTA.demo.toUpperCase()}</Link>
        </div>

        <div className={styles.mobileActions}>
          <Link href="/auth/login" className={styles.mobileHeaderLogin} onClick={() => setMenuOpen(false)}>
            Login
          </Link>
          <button
            type="button"
            className={styles.menuToggle}
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            <span className={menuOpen ? styles.menuIconOpen : styles.menuIcon} />
          </button>
        </div>
      </nav>

      {/* Rendered outside <nav> deliberately: .nav has backdrop-filter, which
          creates a new containing block for position:fixed descendants. With
          MobileMenu nested inside <nav>, its fixed positioning was being
          computed relative to nav's own 68px-tall box instead of the
          viewport, collapsing it to a ~52px sliver (only the first item
          showing, everything else clipped outside the visible area). */}
      {menuOpen && <MobileMenu onClose={() => setMenuOpen(false)} />}
    </>
  );
}
