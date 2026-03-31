import s from './VdfAtmosphere.module.css';

export interface VdfAtmosphereProps {
  className?: string;
}

export function VdfAtmosphere({ className }: VdfAtmosphereProps) {
  return <div className={`${s.atmosphere} ${className || ''}`} aria-hidden="true" />;
}

export default VdfAtmosphere;
