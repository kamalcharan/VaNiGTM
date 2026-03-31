import { VdfNoiseOverlay, VdfAtmosphere, VdfParticles } from '@/components/vdf';
import s from './layout.module.css';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={s.publicLayout}>
      <VdfAtmosphere />
      <VdfParticles />
      <div className={s.content}>
        {children}
      </div>
      <VdfNoiseOverlay />
    </div>
  );
}
