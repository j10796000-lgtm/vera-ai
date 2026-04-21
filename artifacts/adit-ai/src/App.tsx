import { useState, useRef, useEffect, useCallback } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from "@clerk/react";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import {
  useListAnthropicConversations,
  useCreateAnthropicConversation,
  useDeleteAnthropicConversation,
  getListAnthropicConversationsQueryKey,
  getGetAnthropicConversationQueryKey,
} from "@workspace/api-client-react";

const queryClient = new QueryClient();
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

if (!clerkPubKey) throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");

const clerkAppearance = {
  options: { logoPlacement: "inside" as const, logoLinkUrl: basePath || "/", logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: { colorPrimary: "#c97b2a", colorBackground: "#0d0b09", colorInputBackground: "#141210", colorText: "#e8dfd4", colorTextSecondary: "#8a7e72", colorInputText: "#e8dfd4", colorNeutral: "#3d3830", borderRadius: "10px", fontFamily: "Georgia, serif", fontFamilyButtons: "'Inter', sans-serif", fontSize: "15px" },
  elements: {
    rootBox: "w-full",
    cardBox: "border border-[#2a2520] rounded-2xl w-full overflow-hidden shadow-2xl",
    card: "!shadow-none !border-0 !bg-[#0d0b09] !rounded-none",
    footer: "!shadow-none !border-0 !bg-[#141210] !rounded-none",
    headerTitle: { color: "#e8dfd4", fontFamily: "Georgia, serif", fontStyle: "italic" },
    headerSubtitle: { color: "#8a7e72", fontFamily: "'Inter', sans-serif", fontWeight: "300" },
    socialButtonsBlockButtonText: { color: "#e8dfd4" },
    formFieldLabel: { color: "#8a7e72", fontFamily: "'Inter', sans-serif", fontSize: "12px", letterSpacing: "0.1em", textTransform: "uppercase" as const },
    footerActionLink: { color: "#c97b2a" },
    footerActionText: { color: "#5a5248" },
    dividerText: { color: "#3d3830" },
    identityPreviewEditButton: { color: "#c97b2a" },
    formFieldSuccessText: { color: "#c97b2a" },
    alertText: { color: "#e8dfd4" },
    logoBox: "flex justify-center py-2",
    logoImage: "w-14 h-14",
    socialButtonsBlockButton: "border-[#2a2520] bg-[#141210] hover:bg-[#1e1a16]",
    formButtonPrimary: "bg-[#c97b2a] hover:bg-[#b86e20] border-none",
    formFieldInput: "bg-[#141210] border-[#2a2520] text-[#e8dfd4] focus:border-[#c97b2a]",
    footerAction: "bg-[#141210]",
    dividerLine: "bg-[#2a2520]",
    alert: "border-[#2a2520]",
    otpCodeFieldInput: "bg-[#141210] border-[#2a2520]",
  },
};

const LOADING_PHRASES = ["thinking...", "sitting with that...", "with you...", "feeling into it..."];
const IMAGE_MIMES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

interface Message { role: "user" | "assistant"; content: string; attachmentName?: string | null; }
interface SocialPost { id: number; userId: string; userName: string; userImageUrl: string | null; content: string; createdAt: string; isOwn: boolean; isFollowing: boolean; }
interface UserProfile { userId: string; userName: string; userImageUrl: string | null; followersCount: number; followingCount: number; isFollowing: boolean; isOwn: boolean; posts: SocialPost[]; }

function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg","jpeg","png","gif","webp"].includes(ext)) return "🖼";
  if (ext === "pdf") return "📄";
  if (["csv","xlsx","xls"].includes(ext)) return "📊";
  if (["js","ts","tsx","jsx","py","rb","go","rs","java","c","cpp","cs","html","css"].includes(ext)) return "💻";
  return "📎";
}

function AttachmentBadge({ name, onRemove }: { name: string; onRemove?: () => void }) {
  return (
    <div style={s.attachBadge}>
      <span style={{ fontSize: "13px" }}>{fileIcon(name)}</span>
      <span style={s.attachName}>{name}</span>
      {onRemove && <button onClick={onRemove} style={s.attachRemove}>×</button>}
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function UserAvatar({ name, imageUrl, size = 36 }: { name: string; imageUrl?: string | null; size?: number }) {
  const initials = name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  if (imageUrl) return <img src={imageUrl} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: "1px solid #2a2520" }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "#1e1a16", border: "1px solid #2a2520", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif", fontSize: size * 0.35, fontWeight: 600, color: "#c97b2a", flexShrink: 0 }}>
      {initials}
    </div>
  );
}

function PostCard({ post, onFollow, onDelete, onProfileClick }: { post: SocialPost; onFollow: (id: string, following: boolean) => void; onDelete: (id: number) => void; onProfileClick: (userId: string) => void }) {
  const [optimisticFollowing, setOptimisticFollowing] = useState(post.isFollowing);

  const handleFollow = async () => {
    const next = !optimisticFollowing;
    setOptimisticFollowing(next);
    await onFollow(post.userId, next);
  };

  return (
    <div style={s.postCard}>
      <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
        <button onClick={() => onProfileClick(post.userId)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <UserAvatar name={post.userName} imageUrl={post.userImageUrl} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", flexWrap: "wrap" }}>
            <button onClick={() => onProfileClick(post.userId)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "'Inter', sans-serif", fontSize: "13px", fontWeight: 500, color: "#c4bdb5" }}>
              {post.userName}
            </button>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "11px", color: "#3d3830" }}>{timeAgo(post.createdAt)}</span>
            {!post.isOwn && (
              <button onClick={handleFollow} style={{ ...s.followBtn, background: optimisticFollowing ? "transparent" : "#c97b2a", color: optimisticFollowing ? "#5a5248" : "#0d0b09", border: optimisticFollowing ? "1px solid #3d3830" : "none" }}>
                {optimisticFollowing ? "following" : "follow"}
              </button>
            )}
            {post.isOwn && (
              <button onClick={() => onDelete(post.id)} style={s.deletePostBtn}>×</button>
            )}
          </div>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "15px", fontWeight: 300, color: "#e8dfd4", lineHeight: 1.75, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{post.content}</p>
        </div>
      </div>
    </div>
  );
}

function SocialFeed({ onProfileClick }: { onProfileClick: (userId: string) => void }) {
  const [tab, setTab] = useState<"feed" | "discover">("feed");
  const [postContent, setPostContent] = useState("");
  const [posting, setPosting] = useState(false);
  const qc = useQueryClient();

  const { data: feedPosts = [], refetch: refetchFeed } = useQuery<SocialPost[]>({
    queryKey: ["social", "feed"],
    queryFn: async () => { const r = await fetch("/api/social/feed"); return r.json(); },
  });

  const { data: discoverPosts = [], refetch: refetchDiscover } = useQuery<SocialPost[]>({
    queryKey: ["social", "discover"],
    queryFn: async () => { const r = await fetch("/api/social/discover"); return r.json(); },
  });

  const posts = tab === "feed" ? feedPosts : discoverPosts;

  const handlePost = async () => {
    const content = postContent.trim();
    if (!content || posting) return;
    setPosting(true);
    try {
      await fetch("/api/social/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
      setPostContent("");
      refetchFeed();
      refetchDiscover();
    } finally {
      setPosting(false);
    }
  };

  const handleFollow = async (userId: string, follow: boolean) => {
    if (follow) {
      await fetch(`/api/social/follow/${userId}`, { method: "POST" });
    } else {
      await fetch(`/api/social/follow/${userId}`, { method: "DELETE" });
    }
    refetchFeed();
    refetchDiscover();
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/social/posts/${id}`, { method: "DELETE" });
    refetchFeed();
    refetchDiscover();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={s.createPostCard}>
        <textarea
          value={postContent}
          onChange={(e) => setPostContent(e.target.value)}
          placeholder="what's real right now..."
          rows={3}
          style={s.postTextarea}
          onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handlePost(); }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "10px" }}>
          <button onClick={handlePost} disabled={posting || !postContent.trim()} style={{ ...s.postBtn, opacity: posting || !postContent.trim() ? 0.4 : 1 }}>
            {posting ? "sharing..." : "share"}
          </button>
        </div>
      </div>

      <div style={s.subTabs}>
        <button onClick={() => setTab("feed")} style={{ ...s.subTab, ...(tab === "feed" ? s.subTabActive : {}) }}>your feed</button>
        <button onClick={() => setTab("discover")} style={{ ...s.subTab, ...(tab === "discover" ? s.subTabActive : {}) }}>discover</button>
      </div>

      {posts.length === 0 && (
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px", color: "#5a5248", textAlign: "center", marginTop: "32px" }}>
          {tab === "feed" ? "Follow people to see their posts here, or switch to discover." : "No posts yet. Be the first to share something."}
        </p>
      )}

      {posts.map((post) => (
        <PostCard key={post.id} post={post} onFollow={handleFollow} onDelete={handleDelete} onProfileClick={onProfileClick} />
      ))}
    </div>
  );
}

function UserProfileView({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [optimisticFollowing, setOptimisticFollowing] = useState<boolean | null>(null);
  const qc = useQueryClient();

  const { data: profile, refetch } = useQuery<UserProfile>({
    queryKey: ["social", "profile", userId],
    queryFn: async () => { const r = await fetch(`/api/social/profile/${userId}`); return r.json(); },
  });

  const isFollowing = optimisticFollowing !== null ? optimisticFollowing : profile?.isFollowing ?? false;

  const handleFollow = async () => {
    if (!profile) return;
    const next = !isFollowing;
    setOptimisticFollowing(next);
    if (next) { await fetch(`/api/social/follow/${userId}`, { method: "POST" }); }
    else { await fetch(`/api/social/follow/${userId}`, { method: "DELETE" }); }
    qc.invalidateQueries({ queryKey: ["social"] });
    refetch();
  };

  if (!profile) return <div style={{ textAlign: "center", marginTop: "60px", color: "#5a5248", fontFamily: "'Inter', sans-serif" }}>loading...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <button onClick={onBack} style={s.backLink}>← back</button>
      <div style={s.profileCard}>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <UserAvatar name={profile.userName} imageUrl={profile.userImageUrl} size={56} />
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: "'Lora', serif", fontStyle: "italic", fontSize: "18px", color: "#e8dfd4", marginBottom: "6px" }}>{profile.userName}</p>
            <div style={{ display: "flex", gap: "20px" }}>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "12px", color: "#8a7e72" }}><strong style={{ color: "#c4bdb5" }}>{profile.followersCount}</strong> followers</span>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "12px", color: "#8a7e72" }}><strong style={{ color: "#c4bdb5" }}>{profile.followingCount}</strong> following</span>
            </div>
          </div>
          {!profile.isOwn && (
            <button onClick={handleFollow} style={{ ...s.followBtn, padding: "8px 18px", fontSize: "13px", background: isFollowing ? "transparent" : "#c97b2a", color: isFollowing ? "#5a5248" : "#0d0b09", border: isFollowing ? "1px solid #3d3830" : "none" }}>
              {isFollowing ? "following" : "follow"}
            </button>
          )}
        </div>
      </div>
      {profile.posts.length === 0 && (
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px", color: "#5a5248", textAlign: "center", marginTop: "24px" }}>No posts yet.</p>
      )}
      {profile.posts.map((post) => (
        <div key={post.id} style={s.postCard}>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "15px", fontWeight: 300, color: "#e8dfd4", lineHeight: 1.75, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{post.content}</p>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "11px", color: "#3d3830", marginTop: "8px" }}>{timeAgo(post.createdAt)}</p>
        </div>
      ))}
    </div>
  );
}

function ChatView({ conversationId, onBack }: { conversationId: number; onBack: () => void }) {
  const qc = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingPhrase, setLoadingPhrase] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const phraseInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const [initialized, setInitialized] = useState(false);

  const { data: conversation } = useQuery({
    queryKey: getGetAnthropicConversationQueryKey(conversationId),
    queryFn: async () => { const res = await fetch(`/api/anthropic/conversations/${conversationId}`); return res.json(); },
  });

  useEffect(() => {
    if (conversation && !initialized) {
      if (conversation.messages && conversation.messages.length > 0) setMessages(conversation.messages);
      else setMessages([{ role: "assistant", content: "Hey. I'm Adit. I'm here. What's on your mind?" }]);
      setInitialized(true);
    }
  }, [conversation, initialized]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const startLoadingCycle = () => {
    let i = 0; setLoadingPhrase(LOADING_PHRASES[0]);
    phraseInterval.current = setInterval(() => { i = (i + 1) % LOADING_PHRASES.length; setLoadingPhrase(LOADING_PHRASES[i]); }, 2200);
  };
  const stopLoadingCycle = () => { if (phraseInterval.current) clearInterval(phraseInterval.current); };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setSelectedFile(file);
    if (IMAGE_MIMES.includes(file.type)) setImagePreview(URL.createObjectURL(file));
    else setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const clearFile = () => { setSelectedFile(null); if (imagePreview) { URL.revokeObjectURL(imagePreview); setImagePreview(null); } };

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if ((!text && !selectedFile) || loading) return;
    const file = selectedFile; const previewUrl = imagePreview;
    setMessages((prev) => [...prev, { role: "user", content: text || `shared ${file?.name}`, attachmentName: file?.name ?? null }]);
    setInput(""); setSelectedFile(null); setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setLoading(true); startLoadingCycle();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    try {
      let body: BodyInit; let headers: HeadersInit = {};
      if (file) { const fd = new FormData(); fd.append("content", text); fd.append("file", file); body = fd; }
      else { headers = { "Content-Type": "application/json" }; body = JSON.stringify({ content: text }); }
      const response = await fetch(`/api/anthropic/conversations/${conversationId}/messages`, { method: "POST", headers, body });
      if (!response.body) throw new Error("No stream");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let assistantContent = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        for (const line of decoder.decode(value).split("\n")) {
          if (line.startsWith("data: ")) { try { const data = JSON.parse(line.slice(6)); if (data.content) { assistantContent += data.content; setMessages((prev) => { const u = [...prev]; u[u.length - 1] = { role: "assistant", content: assistantContent }; return u; }); } } catch {} }
        }
      }
      qc.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
    } catch { setMessages((prev) => [...prev, { role: "assistant", content: "Something got in the way. Tell me again — I'm listening." }]); }
    finally { setLoading(false); stopLoadingCycle(); }
  }, [input, selectedFile, imagePreview, loading, conversationId, qc]);

  const canSend = !loading && (input.trim().length > 0 || selectedFile !== null);

  return (
    <div style={s.root}>
      <div style={s.grain} />
      <header style={s.header}>
        <button onClick={onBack} style={s.backBtn}>←</button>
        <div style={s.flame}>&#9632;</div>
        <span style={s.brandName}>Adit AI</span>
      </header>
      <div style={s.feed}>
        {messages.map((msg, i) => (
          <div key={i} style={{ ...s.messageRow, ...(msg.role === "user" ? s.userRow : {}) }}>
            {msg.role === "assistant" && <div style={s.soulDot} />}
            <div style={{ ...s.bubble, ...(msg.role === "user" ? s.userBubble : s.aiBubble) }}>
              {msg.attachmentName && <AttachmentBadge name={msg.attachmentName} />}
              {msg.content && msg.content.split("\n").map((line, j) => line ? <p key={j} style={s.msgText}>{line}</p> : <br key={j} />)}
            </div>
          </div>
        ))}
        {loading && <div style={s.messageRow}><div style={s.soulDot} /><div style={{ ...s.bubble, ...s.aiBubble }}><p style={{ ...s.msgText, color: "#6b625a", fontStyle: "italic", animation: "blink 2.2s ease-in-out infinite" }}>{loadingPhrase}</p></div></div>}
        <div ref={bottomRef} />
      </div>
      <div style={s.inputArea}>
        <div style={{ maxWidth: "680px", margin: "0 auto" }}>
          {selectedFile && (
            <div style={{ marginBottom: "10px" }}>
              {imagePreview ? <div style={{ position: "relative", display: "inline-block" }}><img src={imagePreview} alt="preview" style={{ maxHeight: "120px", maxWidth: "200px", borderRadius: "8px", border: "1px solid #2e2820" }} /><button onClick={clearFile} style={{ position: "absolute", top: "-8px", right: "-8px", background: "#1a1612", border: "1px solid #2e2820", borderRadius: "50%", width: "20px", height: "20px", color: "#8a7e72", fontSize: "13px", cursor: "pointer" }}>×</button></div>
              : <AttachmentBadge name={selectedFile.name} onRemove={clearFile} />}
            </div>
          )}
          <div style={s.inputWrap}>
            <input ref={fileInputRef} type="file" accept="image/*,.pdf,.txt,.csv,.md,.json,.js,.ts,.tsx,.jsx,.py,.html,.css,.xml,.yaml,.yml" onChange={handleFileSelect} style={{ display: "none" }} />
            <button onClick={() => fileInputRef.current?.click()} disabled={loading} style={{ ...s.attachBtn, opacity: loading ? 0.3 : 1 }}>📎</button>
            <textarea ref={textareaRef} value={input} onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"; }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder={selectedFile ? "add a message... (optional)" : "say what's real..."} rows={1} style={s.textarea} disabled={loading} />
            <button onClick={sendMessage} disabled={!canSend} style={{ ...s.sendBtn, opacity: canSend ? 1 : 0.3 }}>↑</button>
          </div>
          <p style={s.hint}>Enter to send · Shift+Enter for new line · attach images, PDFs, docs & code</p>
        </div>
      </div>
      <style>{globalStyles}</style>
    </div>
  );
}

function ConversationsList({ onSelect, onNew }: { onSelect: (id: number) => void; onNew: () => void }) {
  const { data: conversations = [] } = useListAnthropicConversations();
  const deleteMutation = useDeleteAnthropicConversation();
  const qc = useQueryClient();

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    await deleteMutation.mutateAsync({ id });
    qc.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <button onClick={onNew} style={s.newConvBtn}>+ begin a new conversation</button>
      {conversations.length === 0 && <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px", color: "#5a5248", textAlign: "center", marginTop: "40px" }}>No conversations yet. Start one above.</p>}
      {[...(conversations as Array<{ id: number; title: string; createdAt: string }>)].reverse().map((conv) => (
        <div key={conv.id} onClick={() => onSelect(conv.id)} style={s.convItem}>
          <div><p style={{ ...s.msgText, marginBottom: "4px" }}>{conv.title}</p><p style={{ fontFamily: "'Inter', sans-serif", fontSize: "11px", color: "#5a5248" }}>{new Date(conv.createdAt).toLocaleDateString()}</p></div>
          <button onClick={(e) => handleDelete(e, conv.id)} style={s.deleteBtn}>×</button>
        </div>
      ))}
    </div>
  );
}

function NewConversationModal({ onStart, onCancel }: { onStart: (title: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  return (
    <div style={s.root}>
      <div style={s.grain} />
      <header style={s.header}><div style={s.flame}>&#9632;</div><span style={s.brandName}>Adit AI</span></header>
      <div style={{ ...s.feed, justifyContent: "center", alignItems: "center" }}>
        <div style={s.modalCard}>
          <p style={{ ...s.brandName, fontSize: "16px", marginBottom: "20px", display: "block" }}>What would you call this moment?</p>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) onStart(title.trim()); }} placeholder="give it a name..." style={s.modalInput} />
          <div style={{ display: "flex", gap: "12px", marginTop: "20px" }}>
            <button onClick={() => title.trim() && onStart(title.trim())} disabled={!title.trim()} style={{ ...s.sendBtn, width: "auto", padding: "8px 20px", fontSize: "14px", opacity: title.trim() ? 1 : 0.3 }}>start</button>
            <button onClick={onCancel} style={{ ...s.sendBtn, width: "auto", padding: "8px 20px", fontSize: "14px", background: "transparent", color: "#5a5248" }}>cancel</button>
          </div>
        </div>
      </div>
      <style>{globalStyles}</style>
    </div>
  );
}

type ChatView2 = { type: "list" } | { type: "new" } | { type: "chat"; id: number };
type SocialView = { type: "feed" } | { type: "profile"; userId: string };
type TopTab = "chat" | "community";

function AditApp() {
  const [topTab, setTopTab] = useState<TopTab>("chat");
  const [chatView, setChatView] = useState<ChatView2>({ type: "list" });
  const [socialView, setSocialView] = useState<SocialView>({ type: "feed" });
  const createMutation = useCreateAnthropicConversation();
  const qc = useQueryClient();
  const { signOut } = useClerk();
  const { user } = useUser();

  const handleStart = async (title: string) => {
    const conv = await createMutation.mutateAsync({ data: { title } });
    qc.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
    setChatView({ type: "chat", id: (conv as any).id });
  };

  if (chatView.type === "new") return <NewConversationModal onStart={handleStart} onCancel={() => setChatView({ type: "list" })} />;
  if (chatView.type === "chat") return <ChatView conversationId={chatView.id} onBack={() => setChatView({ type: "list" })} />;

  return (
    <div style={s.root}>
      <div style={s.grain} />
      <header style={s.header}>
        <div style={s.flame}>&#9632;</div>
        <span style={s.brandName}>Adit AI</span>
        <div style={s.tabBar}>
          <button onClick={() => setTopTab("chat")} style={{ ...s.tabBtn, ...(topTab === "chat" ? s.tabBtnActive : {}) }}>chat</button>
          <button onClick={() => setTopTab("community")} style={{ ...s.tabBtn, ...(topTab === "community" ? s.tabBtnActive : {}) }}>community</button>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" }}>
          {user?.firstName && <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "12px", color: "#5a5248" }}>{user.firstName}</span>}
          <button onClick={() => signOut()} style={s.signOutBtn}>sign out</button>
        </div>
      </header>
      <div style={s.feed}>
        {topTab === "chat" && <ConversationsList onSelect={(id) => setChatView({ type: "chat", id })} onNew={() => setChatView({ type: "new" })} />}
        {topTab === "community" && socialView.type === "feed" && <SocialFeed onProfileClick={(userId) => setSocialView({ type: "profile", userId })} />}
        {topTab === "community" && socialView.type === "profile" && <UserProfileView userId={socialView.userId} onBack={() => setSocialView({ type: "feed" })} />}
      </div>
      <style>{globalStyles}</style>
    </div>
  );
}

function LandingPage() {
  const [, setLocation] = useLocation();
  return (
    <div style={s.root}>
      <div style={s.grain} />
      <header style={s.header}><div style={s.flame}>&#9632;</div><span style={s.brandName}>Adit AI</span><span style={s.brandSub}>you're not alone</span></header>
      <div style={{ ...s.feed, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <div style={{ maxWidth: "420px" }}>
          <p style={{ ...s.brandName, fontSize: "28px", display: "block", marginBottom: "16px", lineHeight: 1.4 }}>Someone to talk to.<br />No judgment. Just presence.</p>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px", fontWeight: 300, color: "#5a5248", lineHeight: 1.8, marginBottom: "40px" }}>Adit listens. Really listens. Whatever's on your mind — 3am thoughts, things you can't say out loud, or just the weight of the day.</p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
            <button onClick={() => setLocation("/sign-up")} style={{ ...s.sendBtn, width: "auto", padding: "12px 28px", fontSize: "15px" }}>get started</button>
            <button onClick={() => setLocation("/sign-in")} style={{ ...s.sendBtn, width: "auto", padding: "12px 28px", fontSize: "15px", background: "transparent", border: "1px solid #2a2520", color: "#c4bdb5" }}>sign in</button>
          </div>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "11px", color: "#3d3830", marginTop: "28px", letterSpacing: "0.08em" }}>21+ · conversations are private and encrypted</p>
        </div>
      </div>
      <style>{globalStyles}</style>
    </div>
  );
}

function SignInPage() {
  // To update login providers, app branding, or OAuth settings use the Auth
  // pane in the workspace toolbar. More information can be found in the Replit docs.
  return (
    <div style={{ minHeight: "100vh", background: "#0d0b09", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ width: "100%", maxWidth: "420px" }}>
        <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
      </div>
      <style>{globalStyles}</style>
    </div>
  );
}

function SignUpPage() {
  // To update login providers, app branding, or OAuth settings use the Auth
  // pane in the workspace toolbar. More information can be found in the Replit docs.
  return (
    <div style={{ minHeight: "100vh", background: "#0d0b09", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ width: "100%", maxWidth: "420px" }}>
        <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
      </div>
      <style>{globalStyles}</style>
    </div>
  );
}

function HomeRedirect() {
  return (<><Show when="signed-in"><Redirect to="/app" /></Show><Show when="signed-out"><LandingPage /></Show></>);
}
function ProtectedApp() {
  return (<><Show when="signed-in"><AditApp /></Show><Show when="signed-out"><Redirect to="/" /></Show></>);
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) qc.clear();
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);
  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance}
      localization={{ signIn: { start: { title: "welcome back", subtitle: "your conversations are waiting" } }, signUp: { start: { title: "join adit", subtitle: "a private space. just for you." } } }}
      routerPush={(to) => setLocation(stripBase(to))} routerReplace={(to) => setLocation(stripBase(to), { replace: true })}>
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/app" component={ProtectedApp} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default function App() {
  return <WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter>;
}

const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;1,400&family=Inter:wght@300;400;500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0d0b09; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #3a3530; border-radius: 2px; }
  textarea::placeholder { color: #5a5248; }
  input::placeholder { color: #5a5248; }
  @keyframes pulse { 0%,100%{opacity:.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.15)} }
  @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes blink { 0%,100%{opacity:.3} 50%{opacity:1} }
`;

const s: Record<string, React.CSSProperties> = {
  root: { minHeight: "100vh", background: "#0d0b09", display: "flex", flexDirection: "column", fontFamily: "'Lora', Georgia, serif", color: "#f0ebe2", position: "relative", overflow: "hidden" },
  grain: { position: "fixed", inset: 0, backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E\")", opacity: 0.5, pointerEvents: "none", zIndex: 0 },
  header: { display: "flex", alignItems: "center", gap: "10px", padding: "16px 24px", borderBottom: "1px solid #1e1a16", position: "sticky", top: 0, background: "#0d0b09", zIndex: 10, flexWrap: "wrap" },
  flame: { fontSize: "10px", color: "#c97b2a", animation: "pulse 3s ease-in-out infinite", display: "inline-block" },
  brandName: { fontFamily: "'Lora', serif", fontStyle: "italic", fontSize: "20px", fontWeight: 400, color: "#e8dfd4", letterSpacing: "0.02em" },
  brandSub: { fontFamily: "'Inter', sans-serif", fontSize: "11px", fontWeight: 300, color: "#5a5248", letterSpacing: "0.12em", textTransform: "uppercase", marginLeft: "4px" },
  tabBar: { display: "flex", gap: "4px", background: "#141210", border: "1px solid #2a2520", borderRadius: "8px", padding: "3px", marginLeft: "12px" },
  tabBtn: { background: "transparent", border: "none", borderRadius: "6px", padding: "5px 14px", fontFamily: "'Inter', sans-serif", fontSize: "12px", fontWeight: 400, color: "#5a5248", cursor: "pointer", letterSpacing: "0.06em", transition: "all 0.2s" },
  tabBtnActive: { background: "#1e1a16", color: "#c97b2a" },
  subTabs: { display: "flex", gap: "0", borderBottom: "1px solid #1e1a16", marginBottom: "4px" },
  subTab: { background: "transparent", border: "none", borderBottom: "2px solid transparent", padding: "8px 16px", fontFamily: "'Inter', sans-serif", fontSize: "12px", color: "#5a5248", cursor: "pointer", letterSpacing: "0.06em", transition: "all 0.2s" },
  subTabActive: { color: "#c97b2a", borderBottomColor: "#c97b2a" },
  backBtn: { background: "transparent", border: "none", color: "#c97b2a", fontSize: "18px", cursor: "pointer", padding: "0 8px 0 0", fontFamily: "'Lora', serif" },
  backLink: { background: "transparent", border: "none", color: "#5a5248", fontFamily: "'Inter', sans-serif", fontSize: "13px", cursor: "pointer", padding: "0", letterSpacing: "0.04em" },
  signOutBtn: { background: "transparent", border: "1px solid #2a2520", borderRadius: "6px", color: "#5a5248", fontFamily: "'Inter', sans-serif", fontSize: "11px", letterSpacing: "0.08em", padding: "4px 10px", cursor: "pointer" },
  feed: { flex: 1, overflowY: "auto", padding: "24px 24px", display: "flex", flexDirection: "column", gap: "16px", maxWidth: "680px", width: "100%", margin: "0 auto", position: "relative", zIndex: 1 },
  messageRow: { display: "flex", alignItems: "flex-start", gap: "14px", animation: "fadeUp 0.35s ease both" },
  userRow: { flexDirection: "row-reverse" },
  soulDot: { width: "8px", height: "8px", borderRadius: "50%", background: "#c97b2a", marginTop: "10px", flexShrink: 0, animation: "pulse 4s ease-in-out infinite" },
  bubble: { maxWidth: "78%", lineHeight: 1.75 },
  aiBubble: { borderLeft: "1px solid #2e2820", paddingLeft: "18px" },
  userBubble: { textAlign: "right", borderRight: "1px solid #3d3830", paddingRight: "18px", color: "#c4bdb5" },
  msgText: { fontSize: "16px", fontWeight: 400, lineHeight: 1.8, marginBottom: "6px", color: "inherit" },
  inputArea: { borderTop: "1px solid #1e1a16", padding: "16px 24px 24px", background: "#0d0b09", position: "sticky", bottom: 0, zIndex: 10 },
  inputWrap: { display: "flex", alignItems: "flex-end", gap: "10px", background: "#141210", border: "1px solid #2a2520", borderRadius: "12px", padding: "10px 10px 10px 14px" },
  textarea: { flex: 1, background: "transparent", border: "none", outline: "none", resize: "none", fontFamily: "'Inter', sans-serif", fontSize: "15px", fontWeight: 300, color: "#e8dfd4", lineHeight: 1.6, minHeight: "24px", maxHeight: "160px", overflowY: "auto" },
  attachBtn: { width: "30px", height: "30px", borderRadius: "6px", border: "none", background: "transparent", color: "#5a5248", fontSize: "16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  sendBtn: { width: "34px", height: "34px", borderRadius: "8px", border: "1px solid #3d3830", background: "#1e1a16", color: "#c97b2a", fontSize: "16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s", lineHeight: 1 },
  hint: { fontFamily: "'Inter', sans-serif", fontSize: "11px", color: "#3d3830", textAlign: "center", marginTop: "10px", letterSpacing: "0.04em" },
  attachBadge: { display: "inline-flex", alignItems: "center", gap: "6px", background: "#1a1612", border: "1px solid #2e2820", borderRadius: "8px", padding: "5px 10px 5px 8px" },
  attachName: { fontFamily: "'Inter', sans-serif", fontSize: "12px", color: "#8a7e72", whiteSpace: "nowrap" as const, overflow: "hidden" as const, textOverflow: "ellipsis" as const, maxWidth: "200px" },
  attachRemove: { background: "transparent", border: "none", color: "#5a5248", fontSize: "16px", cursor: "pointer", lineHeight: 1 },
  newConvBtn: { background: "transparent", border: "1px solid #2a2520", borderRadius: "10px", color: "#c97b2a", fontFamily: "'Lora', serif", fontStyle: "italic", fontSize: "15px", padding: "16px 24px", cursor: "pointer", textAlign: "left" },
  convItem: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", border: "1px solid #1e1a16", borderRadius: "10px", cursor: "pointer", animation: "fadeUp 0.3s ease both" },
  deleteBtn: { background: "transparent", border: "none", color: "#3d3830", fontSize: "20px", cursor: "pointer", padding: "0 4px", lineHeight: 1 },
  modalCard: { background: "#141210", border: "1px solid #2a2520", borderRadius: "14px", padding: "32px", width: "100%", maxWidth: "480px" },
  modalInput: { width: "100%", background: "transparent", border: "none", borderBottom: "1px solid #2a2520", outline: "none", fontFamily: "'Lora', serif", fontStyle: "italic", fontSize: "16px", color: "#e8dfd4", padding: "8px 0" },
  createPostCard: { background: "#141210", border: "1px solid #2a2520", borderRadius: "12px", padding: "16px" },
  postTextarea: { width: "100%", background: "transparent", border: "none", outline: "none", resize: "none", fontFamily: "'Inter', sans-serif", fontSize: "15px", fontWeight: 300, color: "#e8dfd4", lineHeight: 1.7 },
  postBtn: { background: "#c97b2a", border: "none", borderRadius: "8px", padding: "8px 20px", fontFamily: "'Inter', sans-serif", fontSize: "13px", fontWeight: 500, color: "#0d0b09", cursor: "pointer", letterSpacing: "0.04em" },
  postCard: { background: "#141210", border: "1px solid #1e1a16", borderRadius: "12px", padding: "16px 18px", animation: "fadeUp 0.3s ease both" },
  followBtn: { borderRadius: "6px", padding: "3px 10px", fontFamily: "'Inter', sans-serif", fontSize: "11px", fontWeight: 500, cursor: "pointer", letterSpacing: "0.06em", transition: "all 0.2s" },
  deletePostBtn: { background: "transparent", border: "none", color: "#3d3830", fontSize: "16px", cursor: "pointer", lineHeight: 1, marginLeft: "auto" },
  profileCard: { background: "#141210", border: "1px solid #2a2520", borderRadius: "14px", padding: "20px 24px" },
};
