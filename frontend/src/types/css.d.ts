// CSS Module type declarations — resolves TypeScript "Cannot find module *.module.css"
// Next.js generates next-env.d.ts at dev/build time; this covers standalone tsc checks.
declare module '*.module.css' {
  const styles: Readonly<Record<string, string>>;
  export default styles;
}
