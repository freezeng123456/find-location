import { useState, type FormEvent } from "react";
import {
  Check,
  ChevronRight,
  Clock3,
  Folder,
  History,
  Plus,
  Scale,
  Sparkles,
  X,
} from "lucide-react";
import type {
  Category,
  QueryRecord,
  Rule,
} from "../../shared/contracts";

type LibraryTab = "history" | "categories" | "rules";

interface LibraryDrawerProps {
  initialTab: LibraryTab;
  queries: QueryRecord[];
  categories: Category[];
  rules: Rule[];
  onClose: () => void;
  onSelectQuery: (id: string) => void;
  onCreateCategory: (name: string, color: string) => Promise<void>;
  onDecideRule: (id: string, accept: boolean) => Promise<void>;
}

const colors = [
  "#d96f45",
  "#28766e",
  "#d0a43c",
  "#7868a6",
  "#527ba3",
  "#a6535f",
];

export function LibraryDrawer({
  initialTab,
  queries,
  categories,
  rules,
  onClose,
  onSelectQuery,
  onCreateCategory,
  onDecideRule,
}: LibraryDrawerProps) {
  const [tab, setTab] = useState<LibraryTab>(initialTab);

  return (
    <aside className="library-drawer">
      <header className="library-header">
        <div>
          <span className="panel-kicker">你的资料库</span>
          <h2>地点之外的脉络</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="关闭">
          <X size={18} />
        </button>
      </header>

      <nav className="library-tabs">
        <button
          className={tab === "history" ? "is-active" : ""}
          onClick={() => setTab("history")}
        >
          <History size={16} />
          查询
        </button>
        <button
          className={tab === "categories" ? "is-active" : ""}
          onClick={() => setTab("categories")}
        >
          <Folder size={16} />
          类别
        </button>
        <button
          className={tab === "rules" ? "is-active" : ""}
          onClick={() => setTab("rules")}
        >
          <Scale size={16} />
          规则
          {rules.some((rule) => rule.status === "proposed") && (
            <span className="tab-dot" />
          )}
        </button>
      </nav>

      <div className="library-content">
        {tab === "history" && (
          <HistoryList queries={queries} onSelect={onSelectQuery} />
        )}
        {tab === "categories" && (
          <CategoryManager
            categories={categories}
            onCreate={onCreateCategory}
          />
        )}
        {tab === "rules" && (
          <RulesList rules={rules} onDecide={onDecideRule} />
        )}
      </div>
    </aside>
  );
}

function HistoryList({
  queries,
  onSelect,
}: {
  queries: QueryRecord[];
  onSelect: (id: string) => void;
}) {
  if (queries.length === 0) {
    return (
      <div className="library-empty">
        <Clock3 size={24} />
        <h3>还没有查询</h3>
        <p>粘贴一段文字或公开链接，第一次发现会出现在这里。</p>
      </div>
    );
  }

  return (
    <div className="history-list">
      {queries.map((query) => (
        <button
          key={query.id}
          className="history-row"
          onClick={() => onSelect(query.id)}
        >
          <span className={`query-status query-status--${query.status}`}>
            {query.status === "ready" ? (
              <Sparkles size={15} />
            ) : (
              <Clock3 size={15} />
            )}
          </span>
          <span className="history-copy">
            <strong>{query.title}</strong>
            <small>
              {query.status === "ready"
                ? `${query.candidates.length} 个候选`
                : query.status === "failed"
                  ? "处理失败"
                  : "等待处理"}
              {" · "}
              {relativeDate(query.createdAt)}
            </small>
          </span>
          <ChevronRight size={16} />
        </button>
      ))}
    </div>
  );
}

function CategoryManager({
  categories,
  onCreate,
}: {
  categories: Category[];
  onCreate: (name: string, color: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(colors[0]);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onCreate(name.trim(), color);
      setName("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="category-manager">
      <form onSubmit={submit} className="category-form">
        <label>
          <span>新类别</span>
          <div className="category-name-input">
            <i style={{ background: color }} />
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：周末散步"
              maxLength={30}
            />
            <button disabled={busy || !name.trim()} aria-label="创建类别">
              <Plus size={17} />
            </button>
          </div>
        </label>
        <div className="color-options" aria-label="选择颜色">
          {colors.map((option) => (
            <button
              key={option}
              type="button"
              className={color === option ? "is-active" : ""}
              style={{ background: option }}
              onClick={() => setColor(option)}
              aria-label={option}
            />
          ))}
        </div>
      </form>

      <div className="category-list">
        {categories.map((category) => (
          <div className="category-row" key={category.id}>
            <span style={{ background: category.color }} />
            <strong>{category.name}</strong>
            <small>{category.placeCount} 个地点</small>
          </div>
        ))}
        {categories.length === 0 && (
          <p className="subtle-empty">类别由你定义，不会影响 Agent 的提取。</p>
        )}
      </div>
    </div>
  );
}

function RulesList({
  rules,
  onDecide,
}: {
  rules: Rule[];
  onDecide: (id: string, accept: boolean) => Promise<void>;
}) {
  return (
    <div className="rules-list">
      {rules.map((rule) => (
        <article
          key={rule.id}
          className={`rule-card rule-card--${rule.status}`}
        >
          <div className="rule-heading">
            <span>{scopeLabel(rule.scope)}</span>
            <small>
              {rule.status === "proposed"
                ? "等待确认"
                : rule.status === "active"
                  ? "生效中"
                  : "已拒绝"}
            </small>
          </div>
          <p>{rule.content}</p>
          {rule.status === "proposed" && (
            <div className="rule-actions">
              <button onClick={() => onDecide(rule.id, false)}>拒绝</button>
              <button
                className="rule-accept"
                onClick={() => onDecide(rule.id, true)}
              >
                <Check size={14} />
                接受规则
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function scopeLabel(scope: Rule["scope"]) {
  const labels: Record<Rule["scope"], string> = {
    system: "系统规则",
    user: "个人规则",
    task: "本次规则",
    correction: "纠正规则",
  };
  return labels[scope];
}

function relativeDate(value: string) {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}
