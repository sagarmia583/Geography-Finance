import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAtomValue } from "jotai";
import { orgInfoAtom } from "@/lib/config";
import { login } from "@/lib/auth.functions";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const orgInfo = useAtomValue(orgInfoAtom);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError("দয়া করে পাসওয়ার্ড লিখুন!");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const result = await login({ password });
      if (result.success) {
        setPassword("");
        navigate({ to: "/" });
      } else {
        setError(result.error || "লগইন করা যায়নি। আবার চেষ্টা করুন।");
      }
    } catch {
      setError("লগইন সার্ভারের সঙ্গে যোগাযোগ করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 border-t-4 border-emerald-600">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{orgInfo.college}</h1>
          <h2 className="text-lg font-semibold text-emerald-700">{orgInfo.dept}</h2>
          <p className="text-gray-500 mt-2">ফাইন্যান্স ও ভাউচার সিস্টেমে লগইন করুন</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label
              htmlFor="login-password"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              পাসওয়ার্ড
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              placeholder="পাসওয়ার্ড লিখুন..."
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
              autoFocus
            />
            {error && (
              <p role="alert" className="mt-2 text-sm text-red-600 font-medium">
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full font-bold py-3 px-4 rounded-lg transition-colors shadow-sm text-white ${
              isLoading ? "bg-gray-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {isLoading ? "চেক করা হচ্ছে..." : "লগইন করুন"}
          </button>
        </form>
      </div>
    </div>
  );
}
