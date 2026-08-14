import { useState, type FormEvent } from "react";
import { ArrowRight, MapPin, Sparkles } from "lucide-react";
import { api } from "../lib/api";

interface AuthScreenProps {
  onAuthenticated: () => void;
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<"register" | "login">("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      if (mode === "register") {
        await api.register({ name, email, password });
      } else {
        await api.login({ email, password });
      }
      onAuthenticated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "暂时无法登录。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <div className="brand brand--light">
          <span className="brand-mark">
            <MapPin size={18} strokeWidth={2.4} />
          </span>
          <span>迹点</span>
        </div>
        <div className="auth-copy">
          <span className="eyebrow eyebrow--light">
            <Sparkles size={14} />
            由 Agent 协助整理
          </span>
          <h1>
            读到一个地方，
            <br />
            就把它留在地图上。
          </h1>
          <p>
            粘贴文章或一段文字。Agent
            先给出候选，你决定哪些真正进入自己的地点记忆。
          </p>
        </div>
        <div className="auth-map-art" aria-hidden="true">
          <span className="route route--one" />
          <span className="route route--two" />
          <span className="art-pin art-pin--one" />
          <span className="art-pin art-pin--two" />
          <span className="art-pin art-pin--three" />
        </div>
        <p className="auth-footnote">每个人拥有完全独立的地图与历史</p>
      </section>

      <section className="auth-panel">
        <div className="auth-form-wrap">
          <div className="auth-heading">
            <span className="auth-step">01</span>
            <div>
              <p>{mode === "register" ? "建立你的地图" : "欢迎回来"}</p>
              <h2>{mode === "register" ? "创建独立空间" : "继续发现地点"}</h2>
            </div>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {mode === "register" && (
              <label>
                <span>怎么称呼你</span>
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="例如：小林"
                  required
                />
              </label>
            )}
            <label>
              <span>邮箱</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>
            <label>
              <span>密码</span>
              <input
                type="password"
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="至少 8 位"
                required
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="primary-button auth-submit" disabled={submitting}>
              {submitting
                ? "请稍候…"
                : mode === "register"
                  ? "创建并进入地图"
                  : "进入我的地图"}
              {!submitting && <ArrowRight size={18} />}
            </button>
          </form>

          <button
            type="button"
            className="text-button auth-switch"
            onClick={() => {
              setError("");
              setMode(mode === "register" ? "login" : "register");
            }}
          >
            {mode === "register"
              ? "已经有空间？直接登录"
              : "第一次使用？创建空间"}
          </button>
        </div>
      </section>
    </main>
  );
}
