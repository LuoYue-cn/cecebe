"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="container narrow">
      <div className="notice danger">
        <h1>500</h1>
        <p>页面暂时无法加载，请稍后再试。</p>
        <button className="button" onClick={reset}>
          重新加载
        </button>
      </div>
    </div>
  );
}
