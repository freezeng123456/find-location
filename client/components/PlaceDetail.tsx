import { useState } from "react";
import {
  Bookmark,
  ChevronRight,
  FolderPlus,
  Heart,
  MapPinned,
  Trash2,
  X,
} from "lucide-react";
import type { Category, Place } from "../../shared/contracts";

interface PlaceDetailProps {
  place: Place;
  categories: Category[];
  onClose: () => void;
  onLike: () => void;
  onDelete: () => void;
  onToggleCategory: (categoryId: string) => void;
  onManageCategories: () => void;
}

export function PlaceDetail({
  place,
  categories,
  onClose,
  onLike,
  onDelete,
  onToggleCategory,
  onManageCategories,
}: PlaceDetailProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const attached = new Set(place.categories.map((category) => category.id));

  return (
    <aside className="floating-panel place-detail">
      <div className="place-detail-image">
        {place.thumbnailUrl ? (
          <img src={place.thumbnailUrl} alt="" />
        ) : (
          <div className="detail-image-placeholder">
            <MapPinned size={42} />
          </div>
        )}
        <button
          className="icon-button icon-button--glass"
          onClick={onClose}
          aria-label="关闭地点详情"
        >
          <X size={18} />
        </button>
        <span className="detail-type">{place.type}</span>
      </div>

      <div className="place-detail-content">
        <p className="detail-overline">你的地点</p>
        <h2>{place.name}</h2>
        <p className="detail-address">{place.address}</p>

        <div className="detail-actions">
          <button
            className={`detail-action${place.liked ? " is-active" : ""}`}
            onClick={onLike}
          >
            <Heart
              size={18}
              fill={place.liked ? "currentColor" : "none"}
            />
            {place.liked ? "已喜欢" : "喜欢"}
          </button>
          <button className="detail-action">
            <Bookmark size={18} />
            {place.sourceCount} 个来源
          </button>
        </div>

        <section className="category-section">
          <div className="section-heading-row">
            <h3>归入类别</h3>
            <button className="text-button" onClick={onManageCategories}>
              管理
              <ChevronRight size={14} />
            </button>
          </div>
          {categories.length > 0 ? (
            <div className="category-pills">
              {categories.map((category) => (
                <button
                  key={category.id}
                  className={`category-pill${attached.has(category.id) ? " is-active" : ""}`}
                  style={{ "--category-color": category.color } as React.CSSProperties}
                  onClick={() => onToggleCategory(category.id)}
                >
                  <span />
                  {category.name}
                </button>
              ))}
            </div>
          ) : (
            <button
              className="category-empty"
              onClick={onManageCategories}
            >
              <FolderPlus size={18} />
              创建第一个自定义类别
            </button>
          )}
        </section>

        <div className="detail-meta">
          <span>加入于</span>
          <strong>
            {new Intl.DateTimeFormat("zh-CN", {
              year: "numeric",
              month: "short",
              day: "numeric",
            }).format(new Date(place.createdAt))}
          </strong>
        </div>

        {confirmDelete ? (
          <div className="delete-confirm">
            <p>从地图移除？历史记录仍会保留。</p>
            <div>
              <button
                className="text-button"
                onClick={() => setConfirmDelete(false)}
              >
                取消
              </button>
              <button className="danger-button" onClick={onDelete}>
                确认移除
              </button>
            </div>
          </div>
        ) : (
          <button
            className="delete-button"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={15} />
            从地图移除
          </button>
        )}
      </div>
    </aside>
  );
}
