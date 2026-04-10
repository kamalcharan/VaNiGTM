'use client';

import { usePathname } from 'next/navigation';
import { VdfNoiseOverlay, VdfAtmosphere, VdfParticles } from '@/components/vdf';
import s from './layout.module.css';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isIntake = pathname?.startsWith('/intake/');

  return (
    <div className={s.publicLayout}>
      {!isIntake && <VdfAtmosphere />}
      {!isIntake && <VdfParticles />}
      <div className={s.content}>
        {children}
      </div>
      {!isIntake && <VdfNoiseOverlay />}
    </div>
  );
}
