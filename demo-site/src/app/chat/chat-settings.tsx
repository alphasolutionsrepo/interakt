'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings, CheckCircle, XCircle, Loader2, MessageSquare } from 'lucide-react';

// ============================================================================
// Types & storage
// ============================================================================

export interface ChatSettings {
  apiUrl: string;
  accessToken: string;
}

const STORAGE_KEY = 'interakt-chat-settings';

const DEFAULT_SETTINGS: ChatSettings = {
  apiUrl: 'http://localhost:3000',
  accessToken: '',
};

// ============================================================================
// Hook
// ============================================================================

export function useChatSettings() {
  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_SETTINGS);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
      }
    } catch { /* ignore */ }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (isHydrated) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch { /* ignore */ }
    }
  }, [settings, isHydrated]);

  const updateSettings = useCallback((patch: Partial<ChatSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const isConfigured = Boolean(settings.accessToken);

  return { settings, updateSettings, isConfigured, isHydrated };
}

// ============================================================================
// Settings Modal
// ============================================================================

interface ChatSettingsModalProps {
  settings: ChatSettings;
  onSave: (patch: Partial<ChatSettings>) => void;
  trigger?: React.ReactNode;
}

export function ChatSettingsModal({ settings, onSave, trigger }: ChatSettingsModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [local, setLocal] = useState(settings);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  const handleOpen = (open: boolean) => {
    if (open) {
      setLocal(settings);
      setTestResult(null);
    }
    setIsOpen(open);
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const apiUrl = local.apiUrl.replace(/\/+$/, '');
      const url = `${apiUrl}/api/v1/ai-experiences/chat`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Access-Token': local.accessToken,
        },
        body: JSON.stringify({ message: 'ping' }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({ error: 'Unknown error' }));
        setTestResult({ success: false, error: errBody.error || `HTTP ${response.status}` });
      } else {
        // Consume and discard the SSE stream
        response.body?.cancel();
        setTestResult({ success: true });
      }
    } catch (err) {
      setTestResult({ success: false, error: err instanceof Error ? err.message : 'Connection failed' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    onSave(local);
    setIsOpen(false);
  };

  const canSave = Boolean(local.accessToken.trim());

  return (
    <Dialog open={isOpen} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="icon" className="h-9 w-9 cursor-pointer">
            <Settings className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Chat Settings
          </DialogTitle>
          <DialogDescription>
            Configure the connection to your AI experience. The access token identifies which experience to use.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* API URL */}
          <div className="space-y-2">
            <Label htmlFor="chat-apiUrl">API URL</Label>
            <Input
              id="chat-apiUrl"
              value={local.apiUrl}
              onChange={(e) => setLocal({ ...local, apiUrl: e.target.value })}
              placeholder="http://localhost:3000"
            />
            <p className="text-xs text-muted-foreground">
              Base URL of your Interakt backend
            </p>
          </div>

          {/* Access Token */}
          <div className="space-y-2">
            <Label htmlFor="chat-token">Access Token</Label>
            <Input
              id="chat-token"
              type="password"
              value={local.accessToken}
              onChange={(e) => setLocal({ ...local, accessToken: e.target.value })}
              placeholder="Enter the experience access token"
            />
            <p className="text-xs text-muted-foreground">
              Found in your AI Experience settings in the admin panel. This token uniquely identifies the experience.
            </p>
          </div>

          {/* Test Result */}
          {testResult && (
            <div
              className={`flex items-center gap-2 p-3 rounded-md ${
                testResult.success
                  ? 'bg-green-50 text-green-800 border border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20'
                  : 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20'
              }`}
            >
              {testResult.success ? (
                <>
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  <span className="text-sm">Connected successfully!</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 shrink-0" />
                  <span className="text-sm">{testResult.error || 'Connection failed'}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={isTesting || !canSave}
            className="cursor-pointer"
          >
            {isTesting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              'Test Connection'
            )}
          </Button>
          <Button onClick={handleSave} disabled={!canSave} className="cursor-pointer">
            Save Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
