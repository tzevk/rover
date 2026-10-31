// Skeleton shown while a page's data loads, shaped like the usual heading, stats and table.
export default function Loading() {
  return (
    <div className="skeleton" aria-busy="true">
      <div className="sk sk-title" />
      <div className="stats">
        {[0, 1, 2, 3].map((i) => <div key={i} className="sk sk-stat" />)}
      </div>
      <div className="sk sk-panel" />
    </div>
  );
}
