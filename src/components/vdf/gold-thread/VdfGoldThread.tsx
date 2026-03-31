import s from './VdfGoldThread.module.css';

export interface VdfGoldThreadProps {
  maxWidth?: string;
  className?: string;
}

export function VdfGoldThread({ maxWidth = '600px', className }: VdfGoldThreadProps) {
  return (
    <div
      className={`${s.thread} ${className || ''}`}
      style={{ maxWidth }}
      aria-hidden="true"
    />
  );
}

export default VdfGoldThread;
