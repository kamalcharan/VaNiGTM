/**
 * KI-Prime — Hooks barrel export
 *
 * Usage in components:
 *   import { useMe, useLogin, useRegister, useSkillQuery } from '@/hooks';
 */

export { useMe, useInvalidateMe, type MeResponse, type MeUser, type MeTenant } from './useMe';
export {
  useRegister,
  useLogin,
  useLogout,
  useRevokeSessions,
  useSessions,
  useChangePassword,
  useForgotPassword,
  useResetPassword,
  type RegisterPayload,
  type LoginPayload,
  type ActiveSession,
  type SessionInfo,
  type AuthTokens,
  type ChangePasswordPayload,
  type RevokeSessionsPayload,
} from './useAuthMutation';
export {
  useOnboardingStatus,
  useCompleteOnboardingStep,
  type OnboardingStatus,
  type OnboardingStep,
} from './useOnboarding';
export {
  useSkillQuery,
  useSkillMutation,
  type SkillResult,
} from './useSkill';
export { useScrollReveal } from './useScrollReveal';
export {
  usePulses,
  useCreatePulse,
  useUpdatePulse,
  type PulseItem,
  type ListPulsesParams,
  type CreatePulseParams,
  type UpdatePulseParams,
} from './usePulses';
