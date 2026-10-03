import Link from "next/link";
export default function NotFound() {
  return (
    <div className="container narrow">
      <div className="empty">
        <h1>404</h1>
        <p>这份测试或页面不存在，或已被取消分享。</p>
        <Link className="button" href="/">
          回到首页
        </Link>
      </div>
    </div>
  );
}
