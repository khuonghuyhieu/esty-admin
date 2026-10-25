import Link from "next/link";

export function Header({ appName }: { appName: string }) {
  return (
    <header className="site-header wrap">
      <Link className="brand" href="/" aria-label={`${appName} home`}>
        <svg aria-hidden="true" width="36" height="36" viewBox="0 0 36 36" fill="none">
          <path d="M5 10 18 4l13 7-1 19-13 3L5 26Z" fill="var(--accent)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="m5 10 12 7 14-6M17 17v16M12 7l13 7" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span>{appName}</span>
      </Link>
      <nav aria-label="Main navigation"><Link href="/">Home</Link><Link href="/privacy">Privacy</Link></nav>
    </header>
  );
}
