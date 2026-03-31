'use client';

import s from './auth-layout.module.css';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={s.authShell}>
      <div className={s.atmosphere} />
      <div className={s.noise} />
      <div className={s.particles}>
        {[10, 25, 45, 65, 80, 15, 55, 90].map((left, i) => (
          <div
            key={i}
            className={s.particle}
            style={{
              left: `${left}%`,
              animationDelay: `${[0, 1.5, 3, 0.5, 2, 4, 5, 1][i]}s`,
              animationDuration: `${[7, 9, 6, 8, 10, 7.5, 6.5, 9.5][i]}s`,
            }}
          />
        ))}
      </div>
      <div className={s.content}>{children}</div>
    </div>
  );
}
