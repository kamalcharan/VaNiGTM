import { VdfCard, VdfAvatar } from '@/components/vdf';
import s from '../page.module.css';

interface TestimonialCardProps {
  quote: string;
  authorName: string;
  authorRole: string;
  authorInitials: string;
}

export default function TestimonialCard({ quote, authorName, authorRole, authorInitials }: TestimonialCardProps) {
  return (
    <VdfCard variant="glass" hoverLift={false}>
      <div className={s.testimonialQuote}>{quote}</div>
      <div className={s.testimonialAuthor}>
        <VdfAvatar initials={authorInitials} size="md" />
        <div>
          <div className={s.testimonialName}>{authorName}</div>
          <div className={s.testimonialRole}>{authorRole}</div>
        </div>
      </div>
    </VdfCard>
  );
}
