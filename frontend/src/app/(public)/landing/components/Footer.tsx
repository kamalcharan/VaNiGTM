import s from '../page.module.css';

const linkGroups = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'How It Works', href: '#how-it-works' },
      { label: 'Changelog', href: '#' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Vikuna Technologies', href: 'https://vikuna.tech', external: true },
      { label: 'About Us', href: '#' },
      { label: 'Blog', href: '#' },
      { label: 'Contact', href: 'mailto:charan@vikuna.tech' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '#' },
      { label: 'Terms of Service', href: '#' },
      { label: 'SEBI Compliance', href: '#' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className={s.footer}>
      <div className={s.footerContent}>
        <div className={s.footerBrand}>
          <div className={s.footerBrandName}>ProKey</div>
          <div className={s.footerBrandTagline}>
            AI-powered portfolio intelligence for Indian Mutual Fund Distributors.
            Built by practitioners, for practitioners.
          </div>
          <div className={s.footerBrandCompany}>A Vikuna Technologies Product</div>
        </div>
        {linkGroups.map((group) => (
          <div key={group.title} className={s.footerLinksGroup}>
            <h4>{group.title}</h4>
            {group.links.map((link) => (
              <a
                key={link.label}
                href={link.href}
                {...('external' in link ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {link.label}
              </a>
            ))}
          </div>
        ))}
      </div>
      <div className={s.footerBottom}>
        <div className={s.footerCopy}>&copy; 2026 Vikuna Technologies. All rights reserved.</div>
        <div className={s.footerLegal}>
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="#">Cookies</a>
        </div>
      </div>
    </footer>
  );
}
