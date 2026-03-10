import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Check,
  Laptop,
  LogOut,
  Mail,
  Shield,
  Trash2,
  UserRound,
} from "lucide-react";
import { apiGet, apiPost, ApiError } from "../lib/apiClient";
import { Header } from "../components/layout/Header";
import { Button } from "../components/ui/button";
import { AUTH_KEYS, dispatchAuthChanged, openAuthModal, reloadAfterAuth } from "../lib/auth";
import { PageFooter } from "../components/layout/Footer";

type SafeUser = {
  id: number;
  username: string;
  email: string | null;
  nickname: string | null;
};

type SessionItem = {
  id: number;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
};

function readStoredUser(): SafeUser | null {
  try {
    const raw = localStorage.getItem(AUTH_KEYS.USER);
    if (!raw) return null;
    return JSON.parse(raw) as SafeUser;
  } catch {
    return null;
  }
}

function formatDateTime(value: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(ms);
}

function parseDeviceLabel(userAgent: string | null): string {
  const ua = (userAgent ?? "").toLowerCase();
  if (!ua) return "알 수 없는 기기";
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios")) {
    return "iOS";
  }
  if (ua.includes("android")) return "Android";
  if (ua.includes("mac os") || ua.includes("macintosh")) return "macOS";
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("linux")) return "Linux";
  return "기타 기기";
}

function validateNicknameInput(value: string): string | null {
  const v = value.trim();
  if (!v) return "닉네임을 입력해주세요.";
  if (v.length < 2) return "닉네임은 최소 2자 이상이어야 합니다.";
  if (!/^[A-Za-z0-9가-힣]+$/.test(v)) {
    return "닉네임은 한글, 영문, 숫자만 사용할 수 있습니다.";
  }
  const hasHangul = /[가-힣]/.test(v);
  const maxLen = hasHangul ? 10 : 15;
  if (v.length > maxLen) {
    return "한글 닉네임은 최대 10자, 영문/숫자 닉네임은 최대 15자까지 가능합니다.";
  }
  return null;
}

export function MyPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [me, setMe] = useState<SafeUser | null>(() => readStoredUser());
  const [nickname, setNickname] = useState("");
  const [nicknameDraft, setNicknameDraft] = useState("");

  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [nicknameEditing, setNicknameEditing] = useState(false);
  const [nickCheckLoading, setNickCheckLoading] = useState(false);
  const [nickCheckedValue, setNickCheckedValue] = useState<string | null>(null);
  const [nickCheckMessage, setNickCheckMessage] = useState<string | null>(null);
  const [emailEditing, setEmailEditing] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailChangeMessage, setEmailChangeMessage] = useState<string | null>(null);
  const [emailChangeError, setEmailChangeError] = useState<string | null>(null);

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [logoutOthersLoading, setLogoutOthersLoading] = useState(false);
  const [logoutAllLoading, setLogoutAllLoading] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteEmail, setDeleteEmail] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [skipLoginModalOnRedirect, setSkipLoginModalOnRedirect] = useState(false);

  const displayName = useMemo(() => {
    const u = me;
    if (!u) return "";
    return (u.nickname?.trim() || u.username || "").trim();
  }, [me]);

  useEffect(() => {
    const sync = () => setMe(readStoredUser());
    window.addEventListener("pickmovie-auth-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("pickmovie-auth-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!me) {
      navigate("/", { replace: true });
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "auto" });
      });
      if (!skipLoginModalOnRedirect) {
        openAuthModal("login");
      } else {
        setSkipLoginModalOnRedirect(false);
      }
      return;
    }

    setNickname(me.nickname ?? "");
    setNicknameDraft(me.nickname ?? "");
    setNicknameEditing(false);
    setNickCheckedValue(null);
    setNickCheckMessage(null);
    setEmailDraft(me.email ?? "");
  }, [me, navigate, skipLoginModalOnRedirect]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const status = String(params.get("emailChange") ?? "");
    if (!status) return;

    if (status === "success") {
      setEmailChangeMessage("이메일 주소가 변경되었습니다.");
      setEmailChangeError(null);
    } else {
      setEmailChangeError("이메일 변경 링크가 유효하지 않거나 만료되었습니다.");
    }

    params.delete("emailChange");
    navigate(
      {
        pathname: location.pathname,
        search: params.toString() ? `?${params.toString()}` : "",
        hash: location.hash,
      },
      { replace: true, state: location.state },
    );
  }, [location.hash, location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    let alive = true;

    const loadMe = async () => {
      if (!me) return;
      try {
        const res = await apiGet<{ user: SafeUser }>("/auth/me");
        if (!alive || !res?.user) return;
        setMe(res.user);
        localStorage.setItem(AUTH_KEYS.USER, JSON.stringify(res.user));
        dispatchAuthChanged();
      } catch {
        // ignore
      }
    };

    void loadMe();

    return () => {
      alive = false;
    };
  }, [me?.id]);

  const loadSessions = async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const res = await apiGet<{ sessions?: SessionItem[] }>("/auth/sessions");
      setSessions(Array.isArray(res?.sessions) ? res.sessions : []);
    } catch {
      setSessionsError("세션 목록을 불러오지 못했습니다.");
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  };

  useEffect(() => {
    if (!me) return;
    void loadSessions();
  }, [me?.id]);

  const saveProfile = async (params: {
    nickname: string;
    successMessage: string;
  }) => {
    if (!me) return;

    setProfileSaving(true);
    setProfileError(null);
    setProfileMessage(null);

    try {
      const res = await apiPost<{ user: SafeUser }>("/auth/profile", {
        nickname: params.nickname,
      });

      if (res?.user) {
        setMe(res.user);
        localStorage.setItem(AUTH_KEYS.USER, JSON.stringify(res.user));
        dispatchAuthChanged();
        setNickname(res.user.nickname ?? "");
        setNicknameDraft(res.user.nickname ?? "");
      }

      setProfileMessage(params.successMessage);
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "프로필 저장에 실패했습니다.";
      setProfileError(msg);
    } finally {
      setProfileSaving(false);
    }
  };

  const onCheckNickname = async () => {
    if (!me) return;
    const trimmed = nicknameDraft.trim();
    const inputError = validateNicknameInput(trimmed);
    if (inputError) {
      setNickCheckedValue(null);
      setNickCheckMessage(inputError);
      return;
    }

    if (trimmed === (me.nickname ?? "").trim()) {
      setNickCheckedValue(trimmed);
      setNickCheckMessage("현재 사용 중인 닉네임입니다.");
      return;
    }

    setNickCheckLoading(true);
    setNickCheckMessage(null);

    try {
      const res = await apiPost<{ available?: boolean }>("/auth/check-nickname", {
        nickname: trimmed,
      });

      if (!res?.available) {
        setNickCheckedValue(null);
        setNickCheckMessage("이미 사용 중인 닉네임입니다.");
        return;
      }

      setNickCheckedValue(trimmed);
      setNickCheckMessage("사용 가능한 닉네임입니다.");
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "중복 확인 중 오류가 발생했습니다.";
      setNickCheckedValue(null);
      setNickCheckMessage(msg);
    } finally {
      setNickCheckLoading(false);
    }
  };

  const onApplyNickname = async () => {
    if (profileSaving) return;
    const trimmed = nicknameDraft.trim();
    const inputError = validateNicknameInput(trimmed);
    if (inputError) {
      setNickCheckMessage(inputError);
      return;
    }

    if (nickCheckedValue !== trimmed) {
      setNickCheckMessage("중복 확인을 먼저 진행해주세요.");
      return;
    }

    await saveProfile({
      nickname: trimmed,
      successMessage: "닉네임이 변경되었습니다.",
    });

    setNicknameEditing(false);
    setNickCheckedValue(null);
    setNickCheckMessage(null);
  };

  const onLogoutOthers = async () => {
    setLogoutOthersLoading(true);
    setSessionsError(null);
    try {
      await apiPost("/auth/sessions/logout-others", {});
      await loadSessions();
    } catch {
      setSessionsError("다른 기기 로그아웃에 실패했습니다.");
    } finally {
      setLogoutOthersLoading(false);
    }
  };

  const onLogoutAll = async () => {
    setLogoutAllLoading(true);
    try {
      await apiPost("/auth/sessions/logout-all", {});
    } finally {
      localStorage.removeItem(AUTH_KEYS.ACCESS);
      localStorage.removeItem(AUTH_KEYS.USER);
      reloadAfterAuth("/");
      setLogoutAllLoading(false);
    }
  };

  const onRequestEmailChange = async () => {
    if (emailSending) return;
    const nextEmail = emailDraft.trim().toLowerCase();
    if (!nextEmail) {
      setEmailChangeError("변경할 이메일을 입력해주세요.");
      return;
    }

    setEmailSending(true);
    setEmailChangeError(null);
    setEmailChangeMessage(null);
    try {
      await apiPost("/auth/email-change/request", { email: nextEmail });
      setEmailEditing(false);
      setEmailChangeMessage("메일이 전송되었습니다. 받은 편지함을 확인하세요.");
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "이메일 변경 메일 전송에 실패했습니다.";
      setEmailChangeError(msg);
    } finally {
      setEmailSending(false);
    }
  };

  const onDeleteAccount = async () => {
    setDeleteLoading(true);
    setDeleteError(null);

    try {
      await apiPost("/auth/account/delete", {
        email: deleteEmail,
        confirmText: deleteConfirmText,
      });

      localStorage.removeItem(AUTH_KEYS.ACCESS);
      localStorage.removeItem(AUTH_KEYS.USER);
      setSkipLoginModalOnRedirect(true);
      setDeleteOpen(false);
      setDeleteConfirmText("");
      setDeleteEmail("");
      reloadAfterAuth("/");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "계정 탈퇴에 실패했습니다.";
      setDeleteError(msg);
    } finally {
      setDeleteLoading(false);
    }
  };

  if (!me) return null;

  return (
    <div className="min-h-screen bg-[#10131b] text-white overflow-x-hidden flex flex-col">
      <Header currentSection="settings" />

      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-800/16 via-[#0b0b12]/80 to-pink-800/12" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_left,rgba(168,85,247,0.09),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_right,rgba(236,72,153,0.07),transparent_50%)]" />
      </div>

      <main className="pt-16 md:pt-20 px-4 md:px-6 pb-4 md:pb-6">
        <div className="mx-auto w-full max-w-[980px]">
          <h1 className="text-xl md:text-2xl font-extrabold text-white">설정</h1>
          <p className="mt-1.5 md:mt-2 text-xs md:text-sm text-white/55">
            프로필, 로그인 기기, 계정 상태를 관리하세요.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 md:gap-4">
            <section className="rounded-xl md:rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl shadow-[0_10px_50px_rgba(0,0,0,0.35)] p-4 md:p-6">
              <div className="flex items-center gap-1.5 md:gap-2 text-white">
                <UserRound className="h-4 w-4 md:h-5 md:w-5 text-white/80" />
                <h2 className="text-sm md:text-base font-bold">프로필 정보</h2>
              </div>

              <div className="mt-4 md:mt-5">
                <div className="space-y-3 md:space-y-4">
                  <div className="rounded-xl border border-white/10 bg-black/25 px-2 md:px-4 py-2.5 md:py-3">
                    <div className="grid grid-cols-[68px,1fr,auto] md:grid-cols-[120px,1fr,auto] items-start gap-1.5 md:gap-3">
                      <div
                        className={`text-white text-xs md:text-sm font-semibold ${
                          nicknameEditing ? "pt-1" : "pt-0"
                        }`}
                      >
                        닉네임
                      </div>
                      <div className="min-w-0">
                        <div className="relative overflow-hidden">
                          <div
                            className={`transition-all duration-250 ease-out ${
                              nicknameEditing
                                ? "max-h-0 opacity-0 -translate-y-1 pointer-events-none"
                                : "max-h-12 opacity-100 translate-y-0"
                            }`}
                          >
                            <div className="text-xs md:text-sm text-white/90 truncate">
                              {(me.nickname ?? "").trim() || "닉네임 미설정"}
                            </div>
                          </div>
                          <div
                            className={`transition-all duration-250 ease-out ${
                              nicknameEditing
                                ? "max-h-40 opacity-100 translate-y-0 mt-0"
                                : "max-h-0 opacity-0 -translate-y-1 pointer-events-none mt-0"
                            }`}
                          >
                            <div className="flex flex-wrap gap-2">
                              <input
                                value={nicknameDraft}
                                onChange={(e) => {
                                  setNicknameDraft(e.target.value);
                                  setNickCheckedValue(null);
                                  setNickCheckMessage(null);
                                }}
                                maxLength={15}
                                placeholder="닉네임을 입력하세요"
                                className="h-9 md:h-10 flex-1 min-w-[180px] md:min-w-[220px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs md:text-sm text-white placeholder:text-white/30 outline-none focus:border-purple-400/50"
                              />
                              <Button
                                type="button"
                                onClick={onCheckNickname}
                                disabled={nickCheckLoading || profileSaving}
                                className="pick-cta !h-8 md:!h-10 min-w-[65px] md:min-w-[65px] !py-0 px-2 md:px-3 leading-none text-[11px] md:text-sm font-semibold bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl"
                              >
                                {nickCheckLoading ? "확인 중..." : "중복확인"}
                              </Button>
                              <Button
                                type="button"
                                onClick={onApplyNickname}
                                disabled={profileSaving}
                                className="pick-cta !h-8 md:!h-10 min-w-[65px] md:min-w-[65px] !py-0 px-2 md:px-3 leading-none text-[11px] md:text-sm font-semibold bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white border-none rounded-xl"
                              >
                                {profileSaving ? "처리 중..." : "적용"}
                              </Button>
                            </div>
                          </div>
                        </div>
                        <p className="mt-1.5 md:mt-2 text-[11px] md:text-xs text-white/50">
                          프로필에 표시되는 닉네임 입니다.
                        </p>
                        {nickCheckMessage ? (
                          <div
                            className={`mt-1.5 md:mt-2 text-xs md:text-sm ${
                              nickCheckedValue ? "text-emerald-300" : "text-rose-300"
                            }`}
                          >
                            {nickCheckMessage}
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="text-[11px] md:text-xs text-purple-200 hover:text-purple-100 pt-1"
                        onClick={() => {
                          if (nicknameEditing) {
                            setNicknameEditing(false);
                            setNicknameDraft(nickname);
                            setNickCheckedValue(null);
                            setNickCheckMessage(null);
                            return;
                          }
                          setNicknameEditing(true);
                          setNickCheckedValue(null);
                          setNickCheckMessage(null);
                        }}
                      >
                        {nicknameEditing ? "취소" : "수정"}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/25 px-2 md:px-4 py-2.5 md:py-3">
                    <div className="grid grid-cols-[68px,1fr,auto] md:grid-cols-[120px,1fr,auto] items-start gap-1.5 md:gap-3">
                      <div
                        className={`text-white text-xs md:text-sm font-semibold ${
                          emailEditing ? "pt-1" : "pt-0"
                        }`}
                      >
                        이메일 주소
                      </div>
                      <div className="min-w-0">
                        {!emailEditing ? (
                          <div className="text-xs md:text-sm text-white/90 truncate">
                            {me.email ?? "이메일 미등록"}
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <input
                              type="email"
                              value={emailDraft}
                              onChange={(e) => setEmailDraft(e.target.value)}
                              placeholder="변경할 이메일을 입력하세요"
                              className="h-9 md:h-10 flex-1 min-w-[180px] md:min-w-[220px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs md:text-sm text-white placeholder:text-white/30 outline-none focus:border-purple-400/50"
                            />
                            <Button
                              type="button"
                              onClick={onRequestEmailChange}
                              disabled={emailSending}
                              className="pick-cta !h-8 md:!h-10 min-w-[65px] md:min-w-[65px] !py-0 px-2 md:px-3 leading-none text-[11px] md:text-sm font-semibold bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white border-none rounded-xl"
                            >
                              {emailSending ? "전송 중..." : "변경"}
                            </Button>
                          </div>
                        )}
                        {emailChangeMessage ? (
                          <p className="mt-2 inline-flex items-center gap-1.5 text-xs md:text-sm text-emerald-300">
                            <Check className="h-3.5 w-3.5 md:h-4 md:w-4" />
                            {emailChangeMessage}
                          </p>
                        ) : null}
                        {emailChangeError ? (
                          <p className="mt-2 text-xs md:text-sm text-rose-300">{emailChangeError}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="text-[11px] md:text-xs text-purple-200 hover:text-purple-100 pt-1"
                        onClick={() => {
                          if (emailEditing) {
                            setEmailEditing(false);
                            setEmailDraft(me.email ?? "");
                            setEmailChangeError(null);
                            return;
                          }
                          setEmailEditing(true);
                          setEmailChangeMessage(null);
                          setEmailChangeError(null);
                        }}
                      >
                        {emailEditing ? "취소" : "변경"}
                      </button>
                    </div>
                    <p className="mt-1.5 md:mt-2 text-[11px] md:text-xs text-white/50">
                      회원 인증 또는 시스템에서 발송하는 이메일을 수신하는 주소입니다.
                    </p>
                  </div>

                  {profileError ? (
                    <div className="text-xs md:text-sm text-rose-300">{profileError}</div>
                  ) : null}
                  {profileMessage ? (
                    <div className="text-xs md:text-sm text-emerald-300">{profileMessage}</div>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="rounded-xl md:rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl shadow-[0_10px_50px_rgba(0,0,0,0.35)] p-4 md:p-6">
              <div className="flex items-center gap-1.5 md:gap-2 text-white">
                <Shield className="h-4 w-4 md:h-5 md:w-5 text-white/80" />
                <h2 className="text-sm md:text-base font-bold">로그인 기기 및 세션</h2>
              </div>
              <p className="mt-1.5 md:mt-2 text-[11px] md:text-xs text-white/55">
                현재 로그인된 기기를 확인하고, 다른 기기 또는 전체 세션을 종료할 수 있습니다.
              </p>

              <div className="mt-3 md:mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={onLogoutOthers}
                  disabled={logoutOthersLoading || sessionsLoading}
                  className="pick-cta h-8 md:h-10 px-2.5 md:px-4 text-[11px] md:text-sm bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl"
                >
                  <Laptop className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2" />
                  {logoutOthersLoading ? "처리 중..." : "다른 기기 로그아웃"}
                </Button>

                <Button
                  type="button"
                  onClick={onLogoutAll}
                  disabled={logoutAllLoading}
                  className="pick-cta h-8 md:h-10 px-2.5 md:px-4 text-[11px] md:text-sm bg-rose-600/80 hover:bg-rose-600 text-white border-none rounded-xl"
                >
                  <LogOut className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2" />
                  {logoutAllLoading ? "처리 중..." : "전체 로그아웃"}
                </Button>
              </div>

              {sessionsError ? (
                <div className="mt-2.5 md:mt-3 text-xs md:text-sm text-rose-300">{sessionsError}</div>
              ) : null}

              <div className="mt-3 md:mt-4 space-y-2">
                {sessionsLoading ? (
                  <div className="text-xs md:text-sm text-white/50">세션 정보를 불러오는 중...</div>
                ) : sessions.length === 0 ? (
                  <div className="text-xs md:text-sm text-white/45">활성 세션이 없습니다.</div>
                ) : (
                  sessions.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-xl border border-white/10 bg-black/25 p-2.5 md:p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs md:text-sm font-semibold text-white">
                          {parseDeviceLabel(s.userAgent)}
                        </div>
                        {s.isCurrent ? (
                          <span className="rounded-full border border-purple-300/60 bg-purple-400/20 px-2 py-0.5 text-[11px] md:text-xs text-purple-100">
                            현재 기기
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-1.5 md:mt-2 text-[11px] md:text-xs text-white/55 space-y-1">
                        <div>
                          IP: <span className="text-white/75">{s.ip ?? "미확인"}</span>
                        </div>
                        <div>
                          로그인: <span className="text-white/75">{formatDateTime(s.createdAt)}</span>
                        </div>
                        <div>
                          만료: <span className="text-white/75">{formatDateTime(s.expiresAt)}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-xl md:rounded-2xl border border-rose-400/20 bg-rose-500/[0.06] backdrop-blur-xl shadow-[0_10px_50px_rgba(0,0,0,0.35)] p-4 md:p-6">
              <div className="flex items-center gap-1.5 md:gap-2 text-rose-200">
                <AlertTriangle className="h-4 w-4 md:h-5 md:w-5" />
                <h2 className="text-sm md:text-base font-bold">계정 탈퇴</h2>
              </div>
              <p className="mt-1.5 md:mt-2 text-[11px] md:text-xs text-rose-100/75 leading-relaxed">
                탈퇴 시 계정, 찜, 플레이리스트 등 모든 계정 데이터가 삭제되며 복구할 수 없습니다.
              </p>

              <div className="mt-3 md:mt-4">
                <Button
                  type="button"
                  onClick={() => {
                    setDeleteOpen(true);
                    setDeleteError(null);
                  }}
                  className="pick-cta h-8 md:h-10 px-2.5 md:px-4 text-[11px] md:text-sm bg-rose-600/85 hover:bg-rose-600 text-white border-none rounded-xl"
                >
                  <Trash2 className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2" />
                  계정 탈퇴 진행
                </Button>
              </div>
            </section>
          </div>
        </div>
      </main>

      <PageFooter />

      {deleteOpen ? (
        <div className="fixed inset-0 z-[80] px-4 py-6 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-[460px] rounded-xl md:rounded-2xl border border-white/10 bg-[#12121b] p-4 md:p-5">
            <div className="text-base md:text-lg font-bold text-white">계정 탈퇴 확인</div>
            <p className="mt-1.5 md:mt-2 text-xs md:text-sm text-white/65">
              계속하려면 확인 문구 <span className="font-semibold text-rose-300">계정 탈퇴</span> 를 입력하고,
              가입한 이메일을 다시 입력하세요.
            </p>

            <div className="mt-3 md:mt-4 space-y-2.5 md:space-y-3">
              <div>
                <label className="text-[11px] md:text-xs text-white/55">확인 문구</label>
                <input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="계정 탈퇴"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs md:text-sm text-white placeholder:text-white/30 outline-none focus:border-rose-400/50"
                />
              </div>

              <div>
                <label className="text-[11px] md:text-xs text-white/55 flex items-center gap-1">
                  <Mail className="h-3 w-3 md:h-3.5 md:w-3.5" />
                  가입한 이메일
                </label>
                <input
                  type="email"
                  value={deleteEmail}
                  onChange={(e) => setDeleteEmail(e.target.value)}
                  placeholder="이메일을 입력하세요"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs md:text-sm text-white placeholder:text-white/30 outline-none focus:border-rose-400/50"
                />
              </div>
            </div>

            {deleteError ? (
              <div className="mt-2.5 md:mt-3 text-xs md:text-sm text-rose-300">{deleteError}</div>
            ) : null}

            <div className="mt-4 md:mt-5 flex gap-2 justify-end">
              <Button
                type="button"
                onClick={() => {
                  if (deleteLoading) return;
                  setDeleteOpen(false);
                  setDeleteEmail("");
                  setDeleteConfirmText("");
                  setDeleteError(null);
                }}
                className="pick-cta h-8 md:h-10 px-2.5 md:px-4 text-[11px] md:text-sm bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl"
                disabled={deleteLoading}
              >
                취소
              </Button>

              <Button
                type="button"
                onClick={onDeleteAccount}
                disabled={deleteLoading}
                className="pick-cta h-8 md:h-10 px-2.5 md:px-4 text-[11px] md:text-sm bg-rose-600/85 hover:bg-rose-600 text-white border-none rounded-xl"
              >
                {deleteLoading ? "처리 중..." : "탈퇴 확정"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
