// app/login/_components/login-form.tsx
'use client';

import { useState } from 'react';
import Image from 'next/image';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Eye, EyeOff, AlertCircle, LogIn, ArrowRight } from 'lucide-react';
import { loginSchema } from '@/features/auth/auth.validations';
import type { LoginDTO } from '@/features/auth/auth.validations';
import {
    Form,
    FormField,
    FormItem,
    FormLabel,
    FormControl,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

export function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';

    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [shakeError, setShakeError] = useState(false);

    const form = useForm<LoginDTO>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: '',
            password: '',
        },
    });

    const onSubmit = async (data: LoginDTO) => {
        setIsLoading(true);
        setError(null);
        setShakeError(false);

        try {
            const result = await signIn('credentials', {
                email: data.email,
                password: data.password,
                redirect: false,
            });

            if (result?.error) {
                setError('Invalid email or password. Please try again.');
                setShakeError(true);

                // Remove shake animation after it completes
                setTimeout(() => setShakeError(false), 650);
            } else {
                // Success - redirect
                router.push(callbackUrl);
                router.refresh();
            }
        } catch (err) {
            setError('An unexpected error occurred. Please try again.');
            setShakeError(true);
            setTimeout(() => setShakeError(false), 650);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center w-full px-4">
            <Card
                className={`w-full max-w-md min-w-[350px] md:min-w-[400px] p-8 md:p-10 rounded-2xl shadow-2xl border bg-card/90 backdrop-blur transition-transform ${shakeError ? 'animate-shake' : ''
                    }`}
            >
                <CardHeader className="space-y-1 pb-6">
                    <div className="flex justify-center pb-4">
                        <Image
                            src="/logo/interakt_logo_highres.png"
                            alt="Interakt"
                            width={160}
                            height={46}
                            priority
                            className="h-10 w-auto object-contain dark:hidden"
                        />
                        <Image
                            src="/logo/interakt_logo_highres_dark.png"
                            alt="Interakt"
                            width={160}
                            height={46}
                            priority
                            className="hidden h-10 w-auto object-contain dark:block"
                        />
                    </div>
                    <CardTitle className="text-3xl font-bold text-center">
                        Welcome Back
                    </CardTitle>
                    <CardDescription className="text-center text-base">
                        Enter your credentials to access your account
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                            {/* Error Alert with Animation */}
                            {error && (
                                <Alert
                                    variant="destructive"
                                    className="animate-in fade-in-0 slide-in-from-top-2 duration-300"
                                >
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}

                            {/* Email Field */}
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem className="relative">
                                        <FormControl>
                                            <div className="relative">
                                                <Input
                                                    id="email"
                                                    type="email"
                                                    placeholder=" "
                                                    autoComplete="email"
                                                    disabled={isLoading}
                                                    className="peer h-12 rounded-lg border-2 border-muted bg-background px-4 pt-5 pb-1 text-base transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                                    {...field}
                                                />
                                                <FormLabel
                                                    htmlFor="email"
                                                    className="pointer-events-none absolute left-4 top-3.5 z-10 origin-[0] -translate-y-3 scale-75 transform text-sm text-muted-foreground transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:top-1 peer-focus:scale-75 peer-focus:-translate-y-3 peer-focus:text-primary bg-background px-1"
                                                >
                                                    Email Address
                                                </FormLabel>
                                            </div>
                                        </FormControl>
                                        <FormMessage className="text-xs mt-1" />
                                    </FormItem>
                                )}
                            />

                            {/* Password Field */}
                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem className="relative">
                                        <FormControl>
                                            <div className="relative">
                                                <Input
                                                    id="password"
                                                    type={showPassword ? 'text' : 'password'}
                                                    placeholder=" "
                                                    autoComplete="current-password"
                                                    disabled={isLoading}
                                                    className="peer h-12 rounded-lg border-2 border-muted bg-background px-4 pt-5 pb-1 pr-12 text-base transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                                    {...field}
                                                />
                                                <FormLabel
                                                    htmlFor="password"
                                                    className="pointer-events-none absolute left-4 top-3.5 z-10 origin-[0] -translate-y-3 scale-75 transform text-sm text-muted-foreground transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:top-1 peer-focus:scale-75 peer-focus:-translate-y-3 peer-focus:text-primary bg-background px-1"
                                                >
                                                    Password
                                                </FormLabel>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0 hover:bg-muted/50 rounded-md transition-colors"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    tabIndex={-1}
                                                    disabled={isLoading}
                                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                                >
                                                    {showPassword ? (
                                                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                                                    ) : (
                                                        <Eye className="h-4 w-4 text-muted-foreground" />
                                                    )}
                                                </Button>
                                            </div>
                                        </FormControl>
                                        <FormMessage className="text-xs mt-1" />
                                    </FormItem>
                                )}
                            />

                            {/* Submit Button */}
                            <Button
                                type="submit"
                                className="group w-full h-12 text-base rounded-lg font-semibold shadow-md hover:shadow-lg transition-all"
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Signing in...
                                    </>
                                ) : (
                                    <>
                                        <LogIn className="mr-2 h-4 w-4 transition-transform group-hover:scale-110" />
                                        Sign In
                                        <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                                    </>
                                )}
                            </Button>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
}