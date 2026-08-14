import { useEffect, useRef } from "react";
import {
  ArrowUpRight,
  Check,
  Clock3,
  MapPin,
  Plus,
  Quote,
  Sparkles,
  X,
} from "lucide-react";
import type { Candidate, QueryRecord } from "../../shared/contracts";

interface CandidatePanelProps {
  query: QueryRecord;
  selectedCandidateId: string | null;
  busyCandidateId: string | null;
  onSelect: (id: string) => void;
  onAdd: (candidate: Candidate) => void;
  onClose: () => void;
}

export function CandidatePanel({
  query,
  selectedCandidateId,
  busyCandidateId,
  onSelect,
  onAdd,
  onClose,
}: CandidatePanelProps) {
  return (
    <aside className="floating-panel candidate-panel">
      <header className="panel-header candidate-panel-header">
        <div>
          <span className="panel-kicker">
            <Sparkles size={13} />
            本次发现
          </span>
          <h2>{query.title}</h2>
          <p>
            {query.status === "ready"
              ? `${query.candidates.length} 个候选 · 点击后才会加入地图`
              : "已保存到查询历史"}
          </p>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="关闭候选"
        >
          <X size={18} />
        </button>
      </header>

      {query.status !== "ready" ? (
        <PendingQuery query={query} />
      ) : (
        <div className="candidate-list">
          {query.candidates.map((candidate, index) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              index={index + 1}
              selected={selectedCandidateId === candidate.id}
              busy={busyCandidateId === candidate.id}
              onSelect={() => onSelect(candidate.id)}
              onAdd={() => onAdd(candidate)}
            />
          ))}
        </div>
      )}
    </aside>
  );
}

function PendingQuery({ query }: { query: QueryRecord }) {
  return (
    <div className="pending-query">
      <div className="pending-orbit">
        <span />
        <Sparkles size={22} />
      </div>
      <span className="status-pill">
        <Clock3 size={13} />
        {query.status === "failed"
          ? "处理遇到问题"
          : query.status === "processing"
            ? "Agent 正在整理"
            : "等待 Codex Skill"}
      </span>
      <h3>
        {query.status === "failed"
          ? "这次没有完成"
          : "内容已经进入收件箱"}
      </h3>
      <p>
        {query.status === "failed"
          ? "你可以检查链接是否公开，或改为粘贴正文。"
          : "Skill 模式不消耗模型 API。让 Codex 运行 $place-curator 后，候选会自动出现在这里。"}
      </p>
      <code>npm run places -- pending</code>
    </div>
  );
}

function CandidateCard({
  candidate,
  index,
  selected,
  busy,
  onSelect,
  onAdd,
}: {
  candidate: Candidate;
  index: number;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onAdd: () => void;
}) {
  const element = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selected) {
      element.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selected]);

  return (
    <article
      ref={element}
      className={`candidate-card${selected ? " is-selected" : ""}`}
      onClick={onSelect}
    >
      <div className="candidate-image">
        {candidate.thumbnailUrl ? (
          <img src={candidate.thumbnailUrl} alt="" />
        ) : (
          <div className="image-placeholder">
            <MapPin size={24} />
          </div>
        )}
        <span className="candidate-index">{index}</span>
        <span
          className="confidence-badge"
          style={
            {
              "--confidence": `${candidate.confidence * 3.6}deg`,
            } as React.CSSProperties
          }
          title={`提及 ${candidate.mentionConfidence}% · 匹配 ${candidate.matchConfidence}%`}
        >
          <b>{candidate.confidence}</b>
          <small>%</small>
        </span>
      </div>

      <div className="candidate-body">
        <div className="candidate-title-row">
          <div>
            <span className="place-type">{candidate.type}</span>
            <h3>{candidate.name}</h3>
          </div>
          <ArrowUpRight size={17} />
        </div>
        <p className="candidate-address">{candidate.address}</p>
        <blockquote>
          <Quote size={13} />
          <span>{candidate.quote}</span>
        </blockquote>
        {candidate.note && <p className="candidate-note">{candidate.note}</p>}

        <button
          className={`add-button${candidate.addedPlaceId ? " is-added" : ""}`}
          disabled={Boolean(candidate.addedPlaceId) || busy}
          onClick={(event) => {
            event.stopPropagation();
            onAdd();
          }}
        >
          {candidate.addedPlaceId ? (
            <>
              <Check size={16} />
              已加入
            </>
          ) : busy ? (
            "正在加入…"
          ) : (
            <>
              <Plus size={16} />
              加入我的地图
            </>
          )}
        </button>
      </div>
    </article>
  );
}
