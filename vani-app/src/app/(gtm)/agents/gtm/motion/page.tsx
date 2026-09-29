import { Suspense } from 'react';
import MotionPathway from '@/skills/gtm-motion/screens/MotionPathway';
/** /agents/gtm/motion — G2, Put them in motion. `?step=` reopens a finished step. */
export default function Page() { return <Suspense fallback={null}><MotionPathway /></Suspense>; }
