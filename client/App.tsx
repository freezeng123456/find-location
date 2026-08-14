import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Compass,
  Folder,
  History,
  Link2,
  LoaderCircle,
  LogOut,
  MapPin,
  Menu,
  Plus,
  Sparkles,
  Type,
  X,
} from "lucide-react";
import type {
  AppState,
  Candidate,
  DuplicatePlace,
  Place,
} from "../shared/contracts";
import { AuthScreen } from "./components/AuthScreen";
import { CandidatePanel } from "./components/CandidatePanel";
import { DuplicateDialog } from "./components/DuplicateDialog";
import { LibraryDrawer } from "./components/LibraryDrawer";
import { PlaceDetail } from "./components/PlaceDetail";
import { PlaceMap } from "./components/PlaceMap";
import { api, ApiError } from "./lib/api";

type ScreenState = "loading" | "auth" | "app";
type LibraryTab = "history" | "categories" | "rules";

export function App() {
  const [screen, setScreen] = useState<ScreenState>("loading");
  const [data, setData] = useState<AppState | null>(null);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [agentMode, setAgentMode] = useState<"skill" | "api">("skill");
  const [activeQueryId, setActiveQueryId] = useState<string | null>(null);
  const [candidatePanelOpen, setCandidatePanelOpen] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<
    string | null
  >(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(
    null,
  );
  const [busyCandidateId, setBusyCandidateId] = useState<string | null>(
    null,
  );
  const [libraryTab, setLibraryTab] = useState<LibraryTab | null>(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState<{
    candidate: Candidate;
    duplicates: DuplicatePlace[];
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadState = useCallback(async (silent = false) => {
    try {
      const next = await api.state();
      setData(next);
      setScreen("app");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setData(null);
        setScreen("auth");
      } else if (!silent) {
        setToast(error instanceof Error ? error.message : "加载失败");
      }
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const hasPendingQuery = data?.queries.some(
    (query) => query.status === "pending" || query.status === "processing",
  );
  useEffect(() => {
    if (!hasPendingQuery || screen !== "app") return;
    const timer = window.setInterval(() => void loadState(true), 4_000);
    return () => window.clearInterval(timer);
  }, [hasPendingQuery, loadState, screen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeQuery = useMemo(
    () => data?.queries.find((query) => query.id === activeQueryId) ?? null,
    [activeQueryId, data?.queries],
  );
  const selectedPlace = useMemo(
    () =>
      data?.places.find((place) => place.id === selectedPlaceId) ?? null,
    [data?.places, selectedPlaceId],
  );
  const visibleCandidates = activeQuery?.candidates ?? [];

  async function submitQuery(event: React.FormEvent) {
    event.preventDefault();
    if (!input.trim() || submitting) return;
    setSubmitting(true);
    try {
      const result = await api.createQuery(input.trim());
      setAgentMode(result.agentMode);
      setInput("");
      setActiveQueryId(result.query.id);
      setSelectedCandidateId(null);
      setSelectedPlaceId(null);
      setCandidatePanelOpen(true);
      await loadState(true);
      setToast(
        result.agentMode === "skill"
          ? "已放入 Codex Skill 收件箱"
          : "Agent 已开始整理候选",
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function loadDemo() {
    try {
      const query = await api.loadDemo();
      await loadState(true);
      setActiveQueryId(query.id);
      setCandidatePanelOpen(true);
      setSelectedPlaceId(null);
      setSelectedCandidateId(query.candidates[0]?.id ?? null);
      setToast("示例已准备好，你可以纠正它");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "示例加载失败");
    }
  }

  async function addCandidate(
    candidate: Candidate,
    options: { mergePlaceId?: string; forceNew?: boolean } = {},
  ) {
    setBusyCandidateId(candidate.id);
    try {
      const result = await api.addCandidate(candidate.id, options);
      if ("duplicates" in result) {
        setDuplicatePrompt({ candidate, duplicates: result.duplicates });
        return;
      }
      setDuplicatePrompt(null);
      await loadState(true);
      setSelectedPlaceId(result.id);
      setSelectedCandidateId(null);
      setToast(
        options.mergePlaceId ? "已合并为同一地点" : "已加入你的地图",
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.payload &&
        typeof error.payload === "object" &&
        "duplicates" in error.payload
      ) {
        setDuplicatePrompt({
          candidate,
          duplicates: (error.payload as { duplicates: DuplicatePlace[] })
            .duplicates,
        });
      } else {
        setToast(error instanceof Error ? error.message : "加入失败");
      }
    } finally {
      setBusyCandidateId(null);
    }
  }

  async function toggleLike(place: Place) {
    try {
      await api.toggleLike(place.id);
      await loadState(true);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "操作失败");
    }
  }

  async function deletePlace(place: Place) {
    try {
      await api.deletePlace(place.id);
      setSelectedPlaceId(null);
      await loadState(true);
      setToast("地点已移除，历史仍然保留");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "移除失败");
    }
  }

  if (screen === "loading") {
    return (
      <main className="loading-screen">
        <span className="brand-mark brand-mark--large">
          <MapPin size={24} />
        </span>
        <p>正在展开地图…</p>
      </main>
    );
  }

  if (screen === "auth" || !data) {
    return <AuthScreen onAuthenticated={() => void loadState()} />;
  }

  const displayName = data.user.name || data.user.email.split("@")[0];
  const proposedRules = data.rules.filter(
    (rule) => rule.status === "proposed",
  ).length;

  return (
    <main className="app-shell">
      <PlaceMap
        places={data.places}
        candidates={visibleCandidates}
        selectedPlaceId={selectedPlaceId}
        selectedCandidateId={selectedCandidateId}
        onSelectPlace={(id) => {
          setSelectedPlaceId(id);
          setSelectedCandidateId(null);
          setCandidatePanelOpen(false);
        }}
        onSelectCandidate={(id) => {
          setSelectedCandidateId(id);
          setSelectedPlaceId(null);
          setCandidatePanelOpen(true);
        }}
      />

      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <MapPin size={18} strokeWidth={2.4} />
          </span>
          <span>迹点</span>
          <small>PLACE TRACE</small>
        </div>

        <nav className="desktop-nav">
          <button className="is-active">
            <Compass size={16} />
            地图
          </button>
          <button onClick={() => setLibraryTab("history")}>
            <History size={16} />
            查询历史
          </button>
          <button onClick={() => setLibraryTab("categories")}>
            <Folder size={16} />
            类别
          </button>
        </nav>

        <div className="profile-menu">
          <button
            className="rule-indicator"
            onClick={() => setLibraryTab("rules")}
            title="Agent 规则"
          >
            <Sparkles size={16} />
            {proposedRules > 0 && <span>{proposedRules}</span>}
          </button>
          <span className="avatar">{displayName.slice(0, 1)}</span>
          <div className="profile-copy">
            <strong>{displayName}</strong>
            <small>{data.places.length} 个地点</small>
          </div>
          <button
            className="icon-button logout-button"
            aria-label="退出登录"
            onClick={async () => {
              await api.logout();
              setScreen("auth");
              setData(null);
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <form className="discovery-composer" onSubmit={submitQuery}>
        <span className="composer-icon">
          {/^https?:\/\//i.test(input.trim()) ? (
            <Link2 size={20} />
          ) : (
            <Type size={20} />
          )}
        </span>
        <div className="composer-input">
          <label htmlFor="discovery-input">让 Agent 找出内容里的地点</label>
          <textarea
            id="discovery-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="粘贴公开链接，或写下一段文字…"
            rows={1}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
        </div>
        {input && (
          <button
            type="button"
            className="composer-clear"
            onClick={() => setInput("")}
            aria-label="清空"
          >
            <X size={15} />
          </button>
        )}
        <button
          className="discover-button"
          disabled={!input.trim() || submitting}
        >
          {submitting ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <Sparkles size={18} />
          )}
          开始发现
          <ArrowRight size={17} />
        </button>
        <span className="agent-mode">
          <i />
          {agentMode === "skill" ? "Skill 模式" : "API 模式"}
        </span>
      </form>

      <div className="map-summary">
        <span className="summary-number">{data.places.length}</span>
        <span>
          <strong>我的地点</strong>
          <small>{data.places.filter((place) => place.liked).length} 个喜欢</small>
        </span>
      </div>

      <div className="map-legend">
        <span>
          <i className="legend-place" />
          已加入
        </span>
        {visibleCandidates.some((candidate) => !candidate.addedPlaceId) && (
          <span>
            <i className="legend-candidate" />
            本次候选
          </span>
        )}
      </div>

      {data.places.length === 0 && !candidatePanelOpen && (
        <section className="map-empty-card">
          <span className="empty-compass">
            <Compass size={25} />
          </span>
          <p>你的地图还是空的</p>
          <h2>先看看 Agent 会发现什么</h2>
          <button className="secondary-button" onClick={() => void loadDemo()}>
            <Plus size={16} />
            载入杭州示例
          </button>
          <small>候选不会自动加入，由你最后决定</small>
        </section>
      )}

      {candidatePanelOpen && activeQuery && (
        <CandidatePanel
          query={activeQuery}
          selectedCandidateId={selectedCandidateId}
          busyCandidateId={busyCandidateId}
          onSelect={(id) => {
            setSelectedCandidateId(id);
            setSelectedPlaceId(null);
          }}
          onAdd={(candidate) => void addCandidate(candidate)}
          onClose={() => {
            setCandidatePanelOpen(false);
            setSelectedCandidateId(null);
          }}
        />
      )}

      {selectedPlace && (
        <PlaceDetail
          place={selectedPlace}
          categories={data.categories}
          onClose={() => setSelectedPlaceId(null)}
          onLike={() => void toggleLike(selectedPlace)}
          onDelete={() => void deletePlace(selectedPlace)}
          onManageCategories={() => setLibraryTab("categories")}
          onToggleCategory={async (categoryId) => {
            try {
              await api.toggleCategory(selectedPlace.id, categoryId);
              await loadState(true);
            } catch (error) {
              setToast(error instanceof Error ? error.message : "归类失败");
            }
          }}
        />
      )}

      {libraryTab && (
        <>
          <button
            className="drawer-scrim"
            aria-label="关闭资料库"
            onClick={() => setLibraryTab(null)}
          />
          <LibraryDrawer
            key={libraryTab}
            initialTab={libraryTab}
            queries={data.queries}
            categories={data.categories}
            rules={data.rules}
            onClose={() => setLibraryTab(null)}
            onSelectQuery={(id) => {
              setActiveQueryId(id);
              setCandidatePanelOpen(true);
              setSelectedPlaceId(null);
              setLibraryTab(null);
            }}
            onCreateCategory={async (name, color) => {
              try {
                await api.createCategory(name, color);
                await loadState(true);
                setToast("类别已创建");
              } catch (error) {
                setToast(
                  error instanceof Error ? error.message : "创建失败",
                );
              }
            }}
            onDecideRule={async (id, accept) => {
              try {
                await api.decideRule(id, accept);
                await loadState(true);
                setToast(accept ? "新规则已生效" : "已拒绝规则建议");
              } catch (error) {
                setToast(
                  error instanceof Error ? error.message : "操作失败",
                );
              }
            }}
          />
        </>
      )}

      {duplicatePrompt && (
        <DuplicateDialog
          candidate={duplicatePrompt.candidate}
          duplicates={duplicatePrompt.duplicates}
          onCancel={() => setDuplicatePrompt(null)}
          onMerge={(placeId) =>
            void addCandidate(duplicatePrompt.candidate, {
              mergePlaceId: placeId,
            })
          }
          onCreateAnyway={() =>
            void addCandidate(duplicatePrompt.candidate, { forceNew: true })
          }
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <span>
            <Sparkles size={15} />
          </span>
          {toast}
        </div>
      )}

      <button className="mobile-menu" onClick={() => setLibraryTab("history")}>
        <Menu size={20} />
      </button>
    </main>
  );
}
