import { useState, type FormEvent } from "react";
import {
  Check,
  ChevronRight,
  Clock3,
  Folder,
  History,
  MapPin,
  Plus,
  Scale,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import type {
  Category,
  Place,
  QueryRecord,
  Rule,
} from "../../shared/contracts";

type LibraryTab = "history" | "categories" | "rules";

interface LibraryDrawerProps {
  initialTab: LibraryTab;
  queries: QueryRecord[];
  categories: Category[];
  places: Place[];
  rules: Rule[];
  onClose: () => void;
  onSelectQuery: (id: string) => void;
  onCreateCategory: (name: string, color: string) => Promise<void>;
  onSetCategoryPlaces: (
    categoryId: string,
    placeIds: string[],
  ) => Promise<void>;
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
  places,
  rules,
  onClose,
  onSelectQuery,
  onCreateCategory,
  onSetCategoryPlaces,
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
            places={places}
            onCreate={onCreateCategory}
            onSetPlaces={onSetCategoryPlaces}
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
  places,
  onCreate,
  onSetPlaces,
}: {
  categories: Category[];
  places: Place[];
  onCreate: (name: string, color: string) => Promise<void>;
  onSetPlaces: (categoryId: string, placeIds: string[]) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(colors[0]);
  const [busy, setBusy] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<Category | null>(null);

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
              创建
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
          <button
            className="category-row"
            key={category.id}
            onClick={() => setEditingCategory(category)}
          >
            <span style={{ background: category.color }} />
            <strong>{category.name}</strong>
            <small>{category.placeCount} 个地点</small>
            <ChevronRight size={15} />
          </button>
        ))}
        {categories.length === 0 && (
          <p className="subtle-empty">类别由你定义，不会影响 Agent 的提取。</p>
        )}
      </div>

      {editingCategory && (
        <CategoryPlacePicker
          category={editingCategory}
          places={places}
          onClose={() => setEditingCategory(null)}
          onSave={async (placeIds) => {
            await onSetPlaces(editingCategory.id, placeIds);
            setEditingCategory(null);
          }}
        />
      )}
    </div>
  );
}

function CategoryPlacePicker({
  category,
  places,
  onClose,
  onSave,
}: {
  category: Category;
  places: Place[];
  onClose: () => void;
  onSave: (placeIds: string[]) => Promise<void>;
}) {
  const initiallySelected = places
    .filter((place) =>
      place.categories.some((item) => item.id === category.id),
    )
    .map((place) => place.id);
  const [selected, setSelected] = useState(
    () => new Set(initiallySelected),
  );
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const normalizedSearch = search.trim().toLocaleLowerCase("zh-CN");
  const visiblePlaces = places.filter((place) =>
    [place.name, place.address, place.type]
      .join(" ")
      .toLocaleLowerCase("zh-CN")
      .includes(normalizedSearch),
  );
  const allVisibleSelected =
    visiblePlaces.length > 0 &&
    visiblePlaces.every((place) => selected.has(place.id));

  function togglePlace(placeId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(placeId)) next.delete(placeId);
      else next.add(placeId);
      return next;
    });
  }

  function toggleVisible() {
    setSelected((current) => {
      const next = new Set(current);
      for (const place of visiblePlaces) {
        if (allVisibleSelected) next.delete(place.id);
        else next.add(place.id);
      }
      return next;
    });
  }

  return (
    <div
      className="category-picker-backdrop"
      onMouseDown={() => !saving && onClose()}
    >
      <section
        className="category-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-picker-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="category-picker-header">
          <span
            className="category-picker-mark"
            style={{ background: category.color }}
          />
          <div>
            <p>选择地点</p>
            <h2 id="category-picker-title">{category.name}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            disabled={saving}
            aria-label="关闭地点选择"
          >
            <X size={18} />
          </button>
        </header>

        <div className="category-picker-tools">
          <label className="place-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索已保存的地点"
              autoFocus
            />
          </label>
          <div className="selection-summary">
            <span>已选择 {selected.size} 个地点</span>
            {visiblePlaces.length > 0 && (
              <button onClick={toggleVisible}>
                {allVisibleSelected ? "取消当前结果" : "选择当前结果"}
              </button>
            )}
          </div>
        </div>

        <div className="place-picker-list">
          {visiblePlaces.map((place) => {
            const checked = selected.has(place.id);
            return (
              <button
                key={place.id}
                className={`place-picker-row${checked ? " is-selected" : ""}`}
                onClick={() => togglePlace(place.id)}
                aria-pressed={checked}
              >
                <span className="place-picker-image">
                  {place.thumbnailUrl ? (
                    <img src={place.thumbnailUrl} alt="" />
                  ) : (
                    <MapPin size={18} />
                  )}
                </span>
                <span className="place-picker-copy">
                  <strong>{place.name}</strong>
                  <small>
                    {place.type} · {place.address}
                  </small>
                </span>
                <span className="place-picker-check">
                  {checked && <Check size={14} />}
                </span>
              </button>
            );
          })}
          {places.length === 0 && (
            <div className="place-picker-empty">
              <MapPin size={22} />
              <h3>还没有已保存的地点</h3>
              <p>先从候选中点击“加入我的地图”，再回来归类。</p>
            </div>
          )}
          {places.length > 0 && visiblePlaces.length === 0 && (
            <div className="place-picker-empty">
              <Search size={22} />
              <h3>没有匹配的地点</h3>
              <p>换一个名称或地址试试。</p>
            </div>
          )}
        </div>

        <footer className="category-picker-footer">
          <button
            className="text-button"
            onClick={onClose}
            disabled={saving}
          >
            取消
          </button>
          <button
            className="primary-button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave([...selected]);
              } catch {
                // The parent surfaces the API error and keeps this picker open.
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "正在保存…" : `保存归类（${selected.size}）`}
          </button>
        </footer>
      </section>
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
