import { GitMerge, MapPin, Plus, X } from "lucide-react";
import type { Candidate, DuplicatePlace } from "../../shared/contracts";

interface DuplicateDialogProps {
  candidate: Candidate;
  duplicates: DuplicatePlace[];
  onMerge: (placeId: string) => void;
  onCreateAnyway: () => void;
  onCancel: () => void;
}

export function DuplicateDialog({
  candidate,
  duplicates,
  onMerge,
  onCreateAnyway,
  onCancel,
}: DuplicateDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="dialog duplicate-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="duplicate-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span className="dialog-icon">
            <GitMerge size={20} />
          </span>
          <div>
            <p>加入前确认</p>
            <h2 id="duplicate-title">地图上可能已经有这个地点</h2>
          </div>
          <button
            className="icon-button"
            onClick={onCancel}
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </header>

        <div className="duplicate-source">
          <span>这次的候选</span>
          <strong>{candidate.name}</strong>
          <small>{candidate.address}</small>
        </div>

        <div className="duplicate-list">
          {duplicates.map((place) => (
            <button key={place.id} onClick={() => onMerge(place.id)}>
              <span className="duplicate-pin">
                <MapPin size={17} />
              </span>
              <span>
                <strong>{place.name}</strong>
                <small>{place.address}</small>
              </span>
              <em>
                {place.distanceMeters < 1000
                  ? `${place.distanceMeters} m`
                  : `${(place.distanceMeters / 1000).toFixed(1)} km`}
              </em>
              <span className="merge-label">合并来源</span>
            </button>
          ))}
        </div>

        <footer>
          <button className="text-button" onClick={onCancel}>
            暂不加入
          </button>
          <button className="secondary-button" onClick={onCreateAnyway}>
            <Plus size={16} />
            仍作为新地点
          </button>
        </footer>
      </section>
    </div>
  );
}
