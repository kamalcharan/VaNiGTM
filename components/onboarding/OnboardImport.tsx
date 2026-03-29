'use client';

import l from './step-layout.module.css';
import s from './OnboardImport.module.css';

interface Props {
  onComplete: () => void;
  onSkip?: () => void;
}

export default function OnboardImport({ onComplete, onSkip }: Props) {
  return (
    <div className={l.full}>
      <div className={l.fullContent}>
        <div className={s.header}>
          <div className={l.chapter}>Step 6 of 6</div>
          <h2 className={`${l.narrTitle} ${s.centerTitle}`}>
            Bring your <span className={l.glow}>existing clients</span> home.
          </h2>
          <p className={s.headerDesc}>
            Import your client data from CAS statements, InvestWell exports,
            or spreadsheets. You can also skip this and add clients manually later.
          </p>
          <div className={l.optionalBadge}>&#x25CB; Can be done later from Import Center</div>
        </div>

        {/* Import options */}
        <div className={s.cards}>
          <div className={`${s.card} ${s.cardDisabled}`}>
            <span className={s.cardIcon}>&#x1F4C2;</span>
            <div className={s.cardTitle}>Import from CAMS / Karvy</div>
            <div className={s.cardDesc}>Upload CAS PDF or KFintech statements</div>
            <div className={s.cardFormats}>
              <span className={s.formatChip}>CAMS CAS (PDF)</span>
              <span className={s.formatChip}>KFintech CAS</span>
            </div>
            <span className={s.comingSoon}>Coming soon</span>
          </div>

          <div className={`${s.card} ${s.cardDisabled}`}>
            <span className={s.cardIcon}>&#x1F517;</span>
            <div className={s.cardTitle}>Import from InvestWell</div>
            <div className={s.cardDesc}>Upload InvestWell CSV or Excel export</div>
            <div className={s.cardFormats}>
              <span className={s.formatChip}>InvestWell CSV</span>
              <span className={s.formatChip}>Excel</span>
            </div>
            <span className={s.comingSoon}>Coming soon</span>
          </div>

          <div className={s.card} onClick={onComplete}>
            <span className={s.cardIcon}>&#x1F4CA;</span>
            <div className={s.cardTitle}>Start Fresh</div>
            <div className={s.cardDesc}>
              Add clients manually using the client management tool
            </div>
          </div>
        </div>

        <div className={l.nav}>
          <div />
          <div className={l.navRight}>
            <button className={l.navSkip} onClick={onSkip}>
              Skip — I&apos;ll import later
            </button>
            <button className={l.navNext} onClick={onComplete}>
              FINISH SETUP &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
