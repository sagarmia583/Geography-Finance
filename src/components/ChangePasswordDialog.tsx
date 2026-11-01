import { useId, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { changePassword } from "@/lib/auth.functions";
import { notifyFeedback } from "@/lib/feedback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangePasswordDialog({ disabled = false }: { disabled?: boolean }) {
  const navigate = useNavigate();
  const id = useId();
  const submitting = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const clearForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (submitting.current) return;
    if (!nextOpen) clearForm();
    setOpen(nextOpen);
  };

  const showError = (message: string) => {
    setError(message);
    requestAnimationFrame(() => errorRef.current?.focus());
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    setError("");

    if (!currentPassword || currentPassword.length > 1024) {
      showError("বর্তমান পাসওয়ার্ড লিখুন।");
      return;
    }
    if (newPassword.length < 6 || newPassword.length > 1024) {
      showError("নতুন পাসওয়ার্ড ৬ থেকে ১০২৪ অক্ষরের হতে হবে।");
      return;
    }
    if (newPassword === currentPassword) {
      showError("নতুন পাসওয়ার্ড বর্তমান পাসওয়ার্ড থেকে আলাদা হতে হবে।");
      return;
    }
    if (newPassword !== confirmPassword) {
      showError("নতুন পাসওয়ার্ড দুবার একইভাবে লিখুন।");
      return;
    }

    submitting.current = true;
    setPending(true);
    let result: { success: boolean; error?: string };
    try {
      result = await changePassword({ currentPassword, newPassword, confirmPassword });
    } catch {
      showError("পাসওয়ার্ড পরিবর্তন করা যায়নি। সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।");
      return;
    } finally {
      submitting.current = false;
      setPending(false);
    }

    if (!result.success) {
      showError(result.error || "পাসওয়ার্ড পরিবর্তন করা যায়নি। আবার চেষ্টা করুন।");
      return;
    }

    clearForm();
    setOpen(false);
    notifyFeedback.success(
      "পাসওয়ার্ড পরিবর্তন হয়েছে",
      "নতুন পাসওয়ার্ড দিয়ে আবার লগইন করুন। সব ডিভাইসে নতুন করে লগইন করতে হবে।",
      "change-password",
    );
    void navigate({ to: "/login", replace: true });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          <KeyRound aria-hidden="true" />
          পাসওয়ার্ড পরিবর্তন
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-lg sm:max-w-md [&>button]:hidden"
        onEscapeKeyDown={(event) => {
          if (submitting.current) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (submitting.current) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="leading-relaxed">পাসওয়ার্ড পরিবর্তন</DialogTitle>
          <DialogDescription className="leading-relaxed">
            পরিবর্তনের পর সব ডিভাইসে নতুন পাসওয়ার্ড দিয়ে আবার লগইন করতে হবে।
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate aria-busy={pending}>
          <fieldset disabled={pending} className="space-y-4">
            <legend className="sr-only">বর্তমান ও নতুন পাসওয়ার্ড</legend>
            <div className="space-y-2">
              <Label htmlFor={`${id}-current`}>বর্তমান পাসওয়ার্ড</Label>
              <Input
                id={`${id}-current`}
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                maxLength={1024}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-new`}>নতুন পাসওয়ার্ড</Label>
              <Input
                id={`${id}-new`}
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                maxLength={1024}
                aria-describedby={`${id}-hint`}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
              <p id={`${id}-hint`} className="text-xs leading-relaxed text-muted-foreground">
                কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড দিন।
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-confirm`}>নতুন পাসওয়ার্ড আবার লিখুন</Label>
              <Input
                id={`${id}-confirm`}
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                maxLength={1024}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>
            {error && (
              <p
                ref={errorRef}
                role="alert"
                tabIndex={-1}
                className="rounded-md border border-red-200 bg-red-50 p-3 text-sm leading-relaxed text-red-700 focus:outline-none dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
              >
                {error}
              </p>
            )}
            <DialogFooter className="gap-2 sm:space-x-0">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                বাতিল
              </Button>
              <Button type="submit">
                {pending ? "পরিবর্তন হচ্ছে…" : "পাসওয়ার্ড পরিবর্তন করুন"}
              </Button>
            </DialogFooter>
          </fieldset>
          <p role="status" className="sr-only">
            {pending ? "পাসওয়ার্ড পরিবর্তন হচ্ছে। অপেক্ষা করুন।" : ""}
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
