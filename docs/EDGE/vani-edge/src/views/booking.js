import {BOOKING_URL} from '../config.js';
import {button} from '../components.js';
import {escapeHTML as e} from '../lib/model.js';

export function bookingContent(process, hasAssessment) {
  return `<span class="tag">30-MINUTE PROCESS REVIEW</span>
    <p>Choose a time with the Vikuna team to discuss your automation priorities and a practical next step.</p>
    ${hasAssessment ? `<div class="notice"><strong>${e(process.name)}</strong><br>${e(process.opportunity)}<br>Bring your brief so we can review the opportunity, controls and open questions together.</div>` : ''}
    <a class="btn primary" href="${BOOKING_URL}" target="_blank" rel="noopener noreferrer">Choose a time on Calendly ↗</a>
    ${hasAssessment ? button('Download my review brief ↓', 'download-brief', 'secondary') : ''}
    <p class="micro">Calendly opens in a new tab. Confirm your booking there. Your assessment and files are not sent automatically.</p>`;
}
