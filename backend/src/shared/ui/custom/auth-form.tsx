import Form from 'next/form';

import { Input } from '../components/input';
import { Label } from '../components/label';

interface AuthFormProps {
  action: any;
  children: React.ReactNode;
  defaultEmail?: string;
  errors?: {
    firstName?: string[];
    lastName?: string[];
    email?: string[];
    password?: string[];
    general?: string;
  };
  showNameFields?: boolean;
}

export function AuthForm({
  action,
  children,
  defaultEmail = '',
  errors,
  showNameFields = false,
}: AuthFormProps) {
  return (
    <Form action={action} className="flex flex-col gap-6 px-4 sm:px-16">
      {errors?.general && (
        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-sm">
          {errors.general}
        </div>
      )}
      
      <div className="space-y-4">
        {showNameFields && (
          <>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="space-y-2 flex-1">
                <Label
                  htmlFor="firstName"
                  className="text-sm font-medium"
                >
                  First Name
                </Label>
                <Input
                  id="firstName"
                  name="firstName"
                  className={`${errors?.firstName ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                  type="text"
                  placeholder="John"
                  autoComplete="given-name"
                  required
                  aria-invalid={!!errors?.firstName}
                  aria-describedby={errors?.firstName ? "firstName-error" : undefined}
                />
                {errors?.firstName && (
                  <div id="firstName-error" className="text-destructive text-xs mt-1">
                    {errors.firstName.join('. ')}
                  </div>
                )}
              </div>
              
              <div className="space-y-2 flex-1">
                <Label
                  htmlFor="lastName"
                  className="text-sm font-medium"
                >
                  Last Name
                </Label>
                <Input
                  id="lastName"
                  name="lastName"
                  className={`${errors?.lastName ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                  type="text"
                  placeholder="Doe"
                  autoComplete="family-name"
                  required
                  aria-invalid={!!errors?.lastName}
                  aria-describedby={errors?.lastName ? "lastName-error" : undefined}
                />
                {errors?.lastName && (
                  <div id="lastName-error" className="text-destructive text-xs mt-1">
                    {errors.lastName.join('. ')}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
        
        <div className="space-y-2">
          <Label
            htmlFor="email"
            className="text-sm font-medium"
          >
            Email Address
          </Label>

          <Input
            id="email"
            name="email"
            className={`${errors?.email ? 'border-destructive focus-visible:ring-destructive' : ''}`}
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
            defaultValue={defaultEmail}
            aria-invalid={!!errors?.email}
            aria-describedby={errors?.email ? "email-error" : undefined}
          />
          
          {errors?.email && (
            <div id="email-error" className="text-destructive text-xs mt-1">
              {errors.email.join('. ')}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="password"
            className="text-sm font-medium"
          >
            Password
          </Label>

          <Input
            id="password"
            name="password"
            className={`${errors?.password ? 'border-destructive focus-visible:ring-destructive' : ''}`}
            type="password"
            required
            aria-invalid={!!errors?.password}
            aria-describedby={errors?.password ? "password-error" : undefined}
          />
          
          {errors?.password && (
            <div id="password-error" className="text-destructive text-xs mt-1">
              {errors.password.join('. ')}
            </div>
          )}
        </div>
      </div>

      <div className="mt-2">
        {children}
      </div>
    </Form>
  );
}
