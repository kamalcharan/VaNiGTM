import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCRO } from '../../hooks/useCRO';
import { CROUtils } from '../../utils/helpers/cro.utils';
import { ConversionFormData } from '../../types/cro.types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { AlertCircle, CheckCircle, Loader2, Shield, Clock, Users } from 'lucide-react';

// Consultation form validation schema
const consultationFormSchema = z.object({
  email: z.string()
    .email('Please enter a valid email address')
    .min(1, 'Email is required'),
  companyName: z.string()
    .min(2, 'Company name must be at least 2 characters')
    .optional(),
  phone: z.string()
    .regex(/^[\+]?[1-9][\d]{0,15}$/, 'Please enter a valid phone number')
    .optional(),
  industry: z.string().optional(),
  companySize: z.string().optional(),
  transformationUrgency: z.string().optional(),
  currentChallenges: z.array(z.string()).optional(),
  specificHelp: z.string().optional(),
  agreeToTerms: z.boolean()
    .refine(val => val === true, 'You must agree to the terms and conditions')
});

type FormData = z.infer<typeof consultationFormSchema>;

interface ConsultationFormProps {
  variant?: 'transformation' | 'ai' | 'general';
  title?: string;
  subtitle?: string;
  ctaText?: string;
  showTrustSignals?: boolean;
  showDetailedFields?: boolean;
  onSuccess?: (data: ConversionFormData & { leadScore: number }) => void;
  onError?: (error: string) => void;
  className?: string;
  source?: string;
}

const ConsultationForm: React.FC<ConsultationFormProps> = ({
  variant = 'general',
  title,
  subtitle,
  ctaText,
  showTrustSignals = true,
  showDetailedFields = false,
  onSuccess,
  onError,
  className = '',
  source = 'unknown'
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [leadScore, setLeadScore] = useState<number>(0);
  const [formStartTime] = useState(Date.now());
  const formRef = useRef<HTMLFormElement>(null);
  
  const { trackConversion, trackFormInteraction, sessionId, utmData } = useCRO();
  
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid },
    reset
  } = useForm<FormData>({
    resolver: zodResolver(consultationFormSchema),
    mode: 'onChange'
  });

  const watchedFields = watch();

  // Industry options for consulting
  const industries = [
    { value: 'healthcare', label: 'Healthcare/Medical' },
    { value: 'pharma', label: 'Pharmaceutical' },
    { value: 'manufacturing', label: 'Manufacturing' },
    { value: 'financial', label: 'Financial Services' },
    { value: 'technology', label: 'Technology/Software' },
    { value: 'consulting', label: 'Consulting/Professional Services' },
    { value: 'other', label: 'Other' }
  ];

  const companySizes = [
    { value: 'startup', label: 'Startup (< 50 employees)' },
    { value: 'small', label: 'Small Business (50-200 employees)' },
    { value: 'medium', label: 'Mid-size (200-1000 employees)' },
    { value: 'large', label: 'Large Enterprise (1000+ employees)' },
    { value: 'enterprise', label: 'Fortune 500/Global Enterprise' }
  ];

  const urgencyOptions = [
    { value: 'immediate', label: 'Immediate (Next 30 days)' },
    { value: 'quarter', label: 'This Quarter (Next 90 days)' },
    { value: 'year', label: 'This Year (Next 12 months)' },
    { value: 'exploring', label: 'Just exploring options' }
  ];

  const challengeOptions = [
    'Digital strategy unclear',
    'Technology implementation struggles',
    'Change management resistance',
    'ROI measurement difficulties',
    'Vendor selection confusion',
    'Internal capability gaps',
    'Budget constraints',
    'Timeline pressures'
  ];

  // Calculate lead score in real-time
  useEffect(() => {
    if (watchedFields.email || watchedFields.companyName) {
      const score = CROUtils.calculateConsultingLeadScore({
        email: watchedFields.email || '',
        companyName: watchedFields.companyName,
        phone: watchedFields.phone,
        industry: watchedFields.industry,
        companySize: watchedFields.companySize,
        transformationUrgency: watchedFields.transformationUrgency,
        currentChallenges: watchedFields.currentChallenges,
        ...utmData
      });
      setLeadScore(score);
    }
  }, [watchedFields, utmData]);

  // Track form interactions
  const handleFieldInteraction = useCallback((fieldName: string, action: 'focus' | 'blur' | 'change') => {
    trackFormInteraction(`consultation_form_${variant}`, fieldName, action);
  }, [trackFormInteraction, variant]);

  // Form submission handler
  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const formCompletionTime = Date.now() - formStartTime;
      
      const formData: ConversionFormData = {
        email: data.email,
        companyName: data.companyName,
        phone: data.phone,
        industry: data.industry,
        ...utmData,
        referrer: document.referrer
      };

      const finalLeadScore = CROUtils.calculateConsultingLeadScore({
        ...formData,
        companySize: data.companySize,
        transformationUrgency: data.transformationUrgency,
        currentChallenges: data.currentChallenges
      });

      // Track consultation request
      CROUtils.trackConsultingConversion({
        eventName: 'consultation_requested',
        eventCategory: 'conversion',
        eventLabel: `${variant}_consultation_${source}`,
        value: finalLeadScore,
        consultationType: variant as 'transformation' | 'ai' | 'general',
        leadScore: finalLeadScore,
        companySize: data.companySize,
        customParameters: {
          form_variant: variant,
          form_source: source,
          completion_time_seconds: Math.round(formCompletionTime / 1000),
          urgency_level: data.transformationUrgency,
          challenges_count: data.currentChallenges?.length || 0,
          is_business_email: CROUtils.isBusinessEmail(data.email),
          session_id: sessionId
        }
      });

      // Simulate API call (replace with actual consultation booking API)
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      onSuccess?.({
        ...formData,
        leadScore: finalLeadScore
      });

      reset();
      setLeadScore(0);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred. Please try again.';
      setSubmitError(errorMessage);
      onError?.(errorMessage);

      CROUtils.trackConsultingConversion({
        eventName: 'consultation_form_error',
        eventCategory: 'error',
        eventLabel: `${variant}_form_error`,
        customParameters: {
          error_message: errorMessage
        }
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get content based on consultation type
  const getContent = () => {
    const content = {
      transformation: {
        title: title || 'Get Transformation Help',
        subtitle: subtitle || 'Book a free strategy session with executives who have delivered successful transformations',
        cta: ctaText || CROUtils.getConsultationCTA('form', 'transformation')
      },
      ai: {
        title: title || 'Get AI Strategy Help',
        subtitle: subtitle || 'Expert consultation on AI implementation and strategy from seasoned practitioners',
        cta: ctaText || CROUtils.getConsultationCTA('form', 'ai')
      },
      general: {
        title: title || 'Book Executive Consultation',
        subtitle: subtitle || 'Strategic guidance from Fortune 500 level executives',
        cta: ctaText || CROUtils.getConsultationCTA('form')
      }
    };

    return content[variant];
  };

  const content = getContent();

  return (
    <div className={`bg-white p-6 rounded-xl shadow-lg border border-gray-200 max-w-lg ${className}`}>
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-xl font-bold text-gray-900 mb-2">{content.title}</h3>
        {content.subtitle && (
          <p className="text-gray-600 text-sm">{content.subtitle}</p>
        )}
      </div>

      {/* Trust signals */}
      {showTrustSignals && (
        <div className="mb-6 flex items-center justify-center space-x-4 text-xs text-gray-500">
          <div className="flex items-center">
            <Shield className="w-4 h-4 mr-1 text-green-500" />
            <span>Risk-Free</span>
          </div>
          <div className="flex items-center">
            <Clock className="w-4 h-4 mr-1 text-blue-500" />
            <span>30 min session</span>
          </div>
          <div className="flex items-center">
            <Users className="w-4 h-4 mr-1 text-purple-500" />
            <span>C-suite expertise</span>
          </div>
        </div>
      )}

      {/* Form */}
      <form ref={formRef} onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Email Field */}
        <div>
          <Label htmlFor="email" className="text-sm font-medium text-gray-700">
            Business Email *
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="you@company.com"
            {...register('email')}
            onFocus={() => handleFieldInteraction('email', 'focus')}
            onBlur={() => handleFieldInteraction('email', 'blur')}
            onChange={(e) => {
              register('email').onChange(e);
              handleFieldInteraction('email', 'change');
            }}
            className={errors.email ? 'border-red-500' : ''}
          />
          {errors.email && (
            <div className="flex items-center mt-1 text-sm text-red-600">
              <AlertCircle className="w-4 h-4 mr-1" />
              {errors.email.message}
            </div>
          )}
          {watchedFields.email && CROUtils.isBusinessEmail(watchedFields.email) && (
            <div className="flex items-center mt-1 text-sm text-green-600">
              <CheckCircle className="w-4 h-4 mr-1" />
              Business email verified
            </div>
          )}
        </div>

        {/* Company Name Field */}
        <div>
          <Label htmlFor="companyName" className="text-sm font-medium text-gray-700">
            Company Name
          </Label>
          <Input
            id="companyName"
            type="text"
            placeholder="Your company name"
            {...register('companyName')}
            onFocus={() => handleFieldInteraction('companyName', 'focus')}
            onBlur={() => handleFieldInteraction('companyName', 'blur')}
            className={errors.companyName ? 'border-red-500' : ''}
          />
        </div>

        {/* Detailed Fields for longer forms */}
        {showDetailedFields && (
          <>
            {/* Phone Field */}
            <div>
              <Label htmlFor="phone" className="text-sm font-medium text-gray-700">
                Phone Number
              </Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+91 98765 43210"
                {...register('phone')}
                onFocus={() => handleFieldInteraction('phone', 'focus')}
              />
            </div>

            {/* Industry Field */}
            <div>
              <Label htmlFor="industry" className="text-sm font-medium text-gray-700">
                Industry
              </Label>
              <Select onValueChange={(value) => setValue('industry', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your industry" />
                </SelectTrigger>
                <SelectContent>
                  {industries.map((industry) => (
                    <SelectItem key={industry.value} value={industry.value}>
                      {industry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Company Size */}
            <div>
              <Label htmlFor="companySize" className="text-sm font-medium text-gray-700">
                Company Size
              </Label>
              <Select onValueChange={(value) => setValue('companySize', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select company size" />
                </SelectTrigger>
                <SelectContent>
                  {companySizes.map((size) => (
                    <SelectItem key={size.value} value={size.value}>
                      {size.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Specific Help */}
            <div>
              <Label htmlFor="specificHelp" className="text-sm font-medium text-gray-700">
                What specific help do you need?
              </Label>
              <Textarea
                id="specificHelp"
                placeholder="Describe your transformation challenges or goals..."
                {...register('specificHelp')}
                rows={3}
              />
            </div>
          </>
        )}

        {/* Terms and Conditions */}
        <div className="flex items-start space-x-2">
          <Checkbox
            id="agreeToTerms"
            {...register('agreeToTerms')}
            onCheckedChange={(checked) => setValue('agreeToTerms', checked as boolean)}
            className={errors.agreeToTerms ? 'border-red-500' : ''}
          />
          <Label htmlFor="agreeToTerms" className="text-xs text-gray-600 leading-tight cursor-pointer">
            I agree to Vikuna's{' '}
            <a href="/terms" className="text-blue-600 hover:underline" target="_blank">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="/privacy" className="text-blue-600 hover:underline" target="_blank">
              Privacy Policy
            </a>
          </Label>
        </div>

        {/* Lead Score Indicator (dev only) */}
        {leadScore > 0 && process.env.NODE_ENV === 'development' && (
          <div className="bg-blue-50 p-2 rounded text-sm text-blue-700">
            Lead Score: {leadScore}/100
          </div>
        )}

        {/* Submit Error */}
        {submitError && (
          <div className="flex items-center p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
            {submitError}
          </div>
        )}

        {/* Submit Button */}
        <Button
          type="submit"
          disabled={isSubmitting || !isValid}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 disabled:opacity-50"
        >
          {isSubmitting ? (
            <div className="flex items-center justify-center">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Booking...
            </div>
          ) : (
            content.cta
          )}
        </Button>

        {/* Footer text */}
        <p className="text-xs text-center text-gray-500 mt-4">
          Free consultation • No sales pressure • Risk-free strategy session
        </p>
      </form>
    </div>
  );
};

export default ConsultationForm;