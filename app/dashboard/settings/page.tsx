"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Bell, Loader2, Monitor, ShieldAlert, User } from "lucide-react";
import { toast } from "sonner";
import { FirebaseError } from "firebase/app";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updateEmail,
  updatePassword,
  updateProfile,
} from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { useAuth } from "@/components/auth-provider";
import { db } from "@/lib/firebase/client";
import { uploadAvatar } from "@/lib/firebase/storage";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Preferences {
  emailUpdates: boolean;
  agentAlerts: boolean;
  billingReminders: boolean;
}

const DEFAULT_PREFS: Preferences = {
  emailUpdates: true,
  agentAlerts: true,
  billingReminders: true,
};

function getInitials(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function prettyAuthError(code: string): string {
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Current password is incorrect.";
    case "auth/weak-password":
      return "New password is too weak.";
    case "auth/requires-recent-login":
      return "Please sign out and sign back in, then try again.";
    case "auth/email-already-in-use":
      return "That email is already in use by another account.";
    default:
      return "Something went wrong.";
  }
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Manage your profile, security, and notification preferences."
      />

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile">
            <User className="mr-2 h-4 w-4" /> Profile
          </TabsTrigger>
          <TabsTrigger value="security">
            <ShieldAlert className="mr-2 h-4 w-4" /> Security
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="mr-2 h-4 w-4" /> Notifications
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileSection authLoading={authLoading} />
        </TabsContent>
        <TabsContent value="security">
          <SecuritySection
            authLoading={authLoading}
            onDeleted={() => router.push("/login")}
          />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationsSection authLoading={authLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
  // (user param is referenced via hooks inside subcomponents)
  // unused outer `user` would shadow nested ones; intentionally not used directly.
  void user;
}

function ProfileSection({ authLoading }: { authLoading: boolean }) {
  const { user } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (cancelled) return;
      const data = (snap.data() as
        | { fullName?: string; email?: string; avatarUrl?: string }
        | undefined) ?? {};
      setFullName(data.fullName ?? user.displayName ?? "");
      setEmail(data.email ?? user.email ?? "");
      setAvatarUrl(data.avatarUrl ?? user.photoURL ?? "");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!user) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadAvatar(user.uid, file);
      setAvatarUrl(url);
      await setDoc(
        doc(db, "users", user.uid),
        { avatarUrl: url },
        { merge: true }
      );
      await updateProfile(user, { photoURL: url });
      toast.success("Avatar updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      await updateProfile(user, { displayName: fullName });
      const updates: Record<string, unknown> = { fullName };
      if (email !== user.email) {
        await updateEmail(user, email);
        updates.email = email;
      }
      await setDoc(doc(db, "users", user.uid), updates, { merge: true });
      toast.success("Profile saved");
    } catch (err) {
      const code =
        err instanceof FirebaseError ? err.code : "";
      toast.error(
        code ? prettyAuthError(code) : err instanceof Error ? err.message : "Save failed."
      );
    } finally {
      setSaving(false);
    }
  }

  const disabled = authLoading || !user || loading;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Profile</CardTitle>
        <CardDescription>
          Your name, email, and avatar that others see.
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSave}>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={fullName} />}
              <AvatarFallback>
                {getInitials(fullName || email)}
              </AvatarFallback>
            </Avatar>
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  "Upload new avatar"
                )}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onAvatarChange}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                PNG, JPG, or GIF.
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={disabled}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={disabled}
                required
              />
              <p className="text-xs text-muted-foreground">
                Changing your email may require recent sign-in.
              </p>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={disabled || saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function SecuritySection({
  authLoading,
  onDeleted,
}: {
  authLoading: boolean;
  onDeleted: () => void;
}) {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    if (!user || !user.email) return;
    if (newPassword !== confirmPassword) {
      toast.error("New password and confirmation do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword
      );
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      const code = err instanceof FirebaseError ? err.code : "";
      toast.error(
        code
          ? prettyAuthError(code)
          : err instanceof Error
          ? err.message
          : "Could not update password."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function onDeleteConfirmed() {
    setDeleting(true);
    try {
      const res = await fetch("/api/auth/delete-account", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Could not delete account.");
      }
      toast.success("Account deleted");
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  const disabled = authLoading || !user;
  const usesPassword =
    user?.providerData.some((p) => p.providerId === "password") ?? false;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
          <CardDescription>
            {usesPassword
              ? "Update the password used to sign in to your account."
              : "Your account signs in with a social provider — password changes aren't applicable."}
          </CardDescription>
        </CardHeader>
        <form onSubmit={onChangePassword}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={disabled || !usesPassword}
                required={usesPassword}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                disabled={disabled || !usesPassword}
                required={usesPassword}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={6}
                disabled={disabled || !usesPassword}
                required={usesPassword}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              disabled={disabled || submitting || !usesPassword}
            >
              {submitting ? "Updating…" : "Update password"}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active sessions</CardTitle>
          <CardDescription>
            Where you&apos;re signed in. Multi-session support is coming soon.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-md border px-3 py-3">
            <div className="flex items-center gap-3">
              <Monitor className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">This browser</div>
                <div className="text-xs text-muted-foreground">
                  Current session · signed in now
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" disabled>
              Sign out other sessions
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base text-destructive">
            Danger zone
          </CardTitle>
          <CardDescription>
            Permanently delete your account and all data. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <AlertDialog>
            <AlertDialogTrigger
              disabled={disabled || deleting}
              className="inline-flex h-9 items-center justify-center rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground shadow-sm hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete account"}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes your profile, agents, integrations,
                  files, and billing record. There is no recovery.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onDeleteConfirmed}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      </Card>
    </div>
  );
}

function NotificationsSection({ authLoading }: { authLoading: boolean }) {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const snap = await getDoc(
        doc(db, "users", user.uid, "preferences", "notifications")
      );
      if (cancelled) return;
      if (snap.exists()) {
        const data = snap.data() as Partial<Preferences>;
        setPrefs({
          emailUpdates: data.emailUpdates ?? DEFAULT_PREFS.emailUpdates,
          agentAlerts: data.agentAlerts ?? DEFAULT_PREFS.agentAlerts,
          billingReminders:
            data.billingReminders ?? DEFAULT_PREFS.billingReminders,
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function onSave() {
    if (!user) return;
    setSaving(true);
    try {
      await setDoc(
        doc(db, "users", user.uid, "preferences", "notifications"),
        { ...prefs, updatedAt: serverTimestamp() },
        { merge: true }
      );
      toast.success("Preferences saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const disabled = authLoading || !user || loading;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Notifications{" "}
          <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Coming soon
          </span>
        </CardTitle>
        <CardDescription>
          Email delivery isn&apos;t wired up yet — your preferences will be
          saved and applied as soon as it ships. Until then, no emails will
          be sent regardless of these toggles.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <ToggleRow
          label="Email updates"
          description="Product news, new integrations, and other announcements."
          checked={prefs.emailUpdates}
          onChange={(v) => setPrefs((p) => ({ ...p, emailUpdates: v }))}
          disabled={disabled}
        />
        <Separator />
        <ToggleRow
          label="Agent completion alerts"
          description="Notify me when an agent finishes a run."
          checked={prefs.agentAlerts}
          onChange={(v) => setPrefs((p) => ({ ...p, agentAlerts: v }))}
          disabled={disabled}
        />
        <Separator />
        <ToggleRow
          label="Billing reminders"
          description="Receipts, upcoming charges, and renewal notices."
          checked={prefs.billingReminders}
          onChange={(v) => setPrefs((p) => ({ ...p, billingReminders: v }))}
          disabled={disabled}
        />
      </CardContent>
      <CardFooter>
        <Button onClick={onSave} disabled={disabled || saving}>
          {saving ? "Saving…" : "Save preferences"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="space-y-0.5">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
