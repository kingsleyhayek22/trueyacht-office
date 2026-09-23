import { addComment } from "@/app/comments/actions";

export type Comment = {
  id: number;
  kind: string;
  body: string;
  author_name: string | null;
  created_at: string;
};

/** Commentary for one transaction: every message (comments + rejection reasons), plus a box to add one. */
export function CommentsPanel({
  submissionId,
  path,
  comments,
}: {
  submissionId: number;
  path: string;
  comments: Comment[];
}) {
  return (
    <div className="panel comments">
      <div className="panel-title">Commentary</div>
      {comments.length === 0 ? (
        <p className="action-hint">No messages on this transaction yet.</p>
      ) : (
        <ul className="comment-list">
          {comments.map((c) => (
            <li key={c.id} className={`comment ${c.kind}`}>
              <div className="comment-meta">
                <strong>{c.author_name ?? "Staff"}</strong>
                {c.kind === "reject" && <span className="comment-tag">Sent back</span>}
                {c.kind === "archive" && <span className="comment-tag">Archived</span>}
                {c.kind === "split" && <span className="comment-tag">Split</span>}
                <span className="comment-time">{new Date(c.created_at).toLocaleString()}</span>
              </div>
              <div className="comment-body">{c.body}</div>
            </li>
          ))}
        </ul>
      )}
      <form action={addComment.bind(null, submissionId, path)} className="comment-form">
        <textarea name="body" rows={2} placeholder="Add a message about this transaction…" required />
        <button type="submit" className="btn ghost">
          Add comment
        </button>
      </form>
    </div>
  );
}
