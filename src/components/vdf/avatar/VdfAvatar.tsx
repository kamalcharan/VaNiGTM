import s from './VdfAvatar.module.css';

export interface VdfAvatarProps {
  initials: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function VdfAvatar({ initials, size = 'md', className }: VdfAvatarProps) {
  return (
    <div className={`${s.avatar} ${s[size]} ${className || ''}`}>
      {initials}
    </div>
  );
}

export default VdfAvatar;
