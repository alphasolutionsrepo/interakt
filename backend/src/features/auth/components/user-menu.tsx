'use client'

import { KeyRound, LogIn, LogOut } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import type { ChangePasswordDTO } from '../auth.validations'

import { ChangePasswordDialog } from './ChangePasswordDialog'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { activityStore } from '@/shared/activity/activity-store'
import { handleApiResponse } from '@/shared/api/api-error'



export function UserMenu() {
    const { data: session, status } = useSession()
    const pathname = usePathname()
    const userId = session?.user?.id
    const [passwordOpen, setPasswordOpen] = useState(false)
    const [changingPassword, setChangingPassword] = useState(false)

    // Rejects on failure so the dialog shows why
    const changeOwnPassword = async (data: ChangePasswordDTO) => {
        setChangingPassword(true)
        try {
            await handleApiResponse(await fetch(`/api/users/${userId}/change-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            }))
            toast.success('Password changed')
            setPasswordOpen(false)
        } finally {
            setChangingPassword(false)
        }
    }

    useEffect(() => {
        // Not only Log out clears the list: a session that ran out never signed out
        if (userId) activityStore.setOwner(userId)
    }, [userId])

    if (status === 'loading') {
        return <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-muted animate-pulse" />
    }

    if (!session?.user) {
        // Don't show Sign In button if already on login page
        if (pathname === '/login') {
            return null
        }

        return (
            <Button variant="default" asChild className="group">
                <a href="/login" className="flex items-center gap-2">
                    <LogIn className="h-4 w-4 transition-transform group-hover:scale-110" />
                    Sign In
                </a>
            </Button>
        )
    }

    const { user } = session
    const initials = `${user.firstName?.charAt(0) || ''}${user.lastName?.charAt(0) || ''}`.toUpperCase()

    return (
        <>
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                        <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">
                            {user.firstName} {user.lastName}
                        </p>
                        <p className="text-xs leading-none text-muted-foreground">
                            {user.email}
                        </p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setPasswordOpen(true)}>
                    <KeyRound className="mr-2 h-4 w-4" />
                    <span>Change password</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => {
                        // The activity list stays in this browser; don't leave it for the next user
                        activityStore.clear()
                        signOut({ callbackUrl: '/' })
                    }}
                    className="text-red-600 focus:text-red-600"
                >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
        <ChangePasswordDialog
            open={passwordOpen}
            onOpenChange={setPasswordOpen}
            email={user.email}
            onSubmit={changeOwnPassword}
            isSubmitting={changingPassword}
        />
        </>
    )
}