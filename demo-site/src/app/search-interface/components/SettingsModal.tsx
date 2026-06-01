'use client';

import { useState } from 'react';
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
import { Settings, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useSettings } from '@/contexts/settings-context';

interface SettingsModalProps {
  /** Optional custom trigger. Defaults to a small icon button. */
  trigger?: React.ReactNode;
}

export function SettingsModal({ trigger }: SettingsModalProps = {}) {
  const { settings, updateSettings } = useSettings();
  const [isOpen, setIsOpen] = useState(false);
  const [localSettings, setLocalSettings] = useState(settings);
  const [exampleQueriesText, setExampleQueriesText] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  const handleOpen = (open: boolean) => {
    if (open) {
      setLocalSettings(settings);
      setExampleQueriesText((settings.exampleQueries || []).join(', '));
      setTestResult(null);
    }
    setIsOpen(open);
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      // Test with local settings directly (not from context)
      const response = await fetch(`${localSettings.apiUrl}/api/v1/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Access-Token': localSettings.accessToken,
        },
        body: JSON.stringify({
          query: 'test',
          page: 1,
          pageSize: 1,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        setTestResult({
          success: false,
          error: error.error || `HTTP ${response.status}: ${response.statusText}`,
        });
      } else {
        setTestResult({ success: true });
      }
    } catch (error) {
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    const parsedQueries = exampleQueriesText
      .split(',')
      .map(q => q.trim())
      .filter(q => q.length > 0);
    updateSettings({ ...localSettings, exampleQueries: parsedQueries });
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="icon" className="h-9 w-9 cursor-pointer">
            <Settings className="h-4 w-4" />
            <span className="sr-only">Settings</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Search Settings
          </DialogTitle>
          <DialogDescription>
            Configure the connection to your Interakt backend API.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* API URL */}
          <div className="space-y-2">
            <Label htmlFor="apiUrl">API URL</Label>
            <Input
              id="apiUrl"
              value={localSettings.apiUrl}
              onChange={(e) => setLocalSettings({ ...localSettings, apiUrl: e.target.value })}
              placeholder="http://localhost:3000"
            />
            <p className="text-xs text-muted-foreground">
              The base URL of your Interakt backend server
            </p>
          </div>

          {/* Access Token */}
          <div className="space-y-2">
            <Label htmlFor="accessToken">Access Token</Label>
            <Input
              id="accessToken"
              type="password"
              value={localSettings.accessToken}
              onChange={(e) => setLocalSettings({ ...localSettings, accessToken: e.target.value })}
              placeholder="Enter your search experience access token"
            />
            <p className="text-xs text-muted-foreground">
              Get this from your Search Experience configuration in the admin panel
            </p>
          </div>

          {/* Example Queries */}
          <div className="space-y-2">
            <Label htmlFor="exampleQueries">Example Queries</Label>
            <Input
              id="exampleQueries"
              value={exampleQueriesText}
              onChange={(e) => setExampleQueriesText(e.target.value)}
              placeholder="date night outfit, summer dress, red sneakers"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated example queries shown on the search landing page
            </p>
          </div>

          {/* Test Result */}
          {testResult && (
            <div
              className={`flex items-center gap-2 p-3 rounded-md ${
                testResult.success
                  ? 'bg-green-50 text-green-800 border border-green-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {testResult.success ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm">Connection successful!</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-red-600" />
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
            disabled={isTesting || !localSettings.accessToken}
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

          <Button
            onClick={handleSave}
            disabled={!localSettings.accessToken}
            className="cursor-pointer"
          >
            Save Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
