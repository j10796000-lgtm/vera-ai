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
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#c97b2a",
    colorBackground: "#0d0b09",
    colorInputBackground: "#141210",
    colorText: "#e8dfd4",
    colorTextSecondary: "#8a7e72",
    colorInputText: "#e8dfd4",
    colorNeutral: "#3d3830",
    borderRadius: "10px",
    fontFamily: "Georgia, serif",
    fontFamilyButtons: "'Inter', sans-serif",
    fontSize: "15px",
  },
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
    formFieldRow: "gap-3",
    main: "gap-5",
  },
};

const LOADING_PHRASES = [
  "thinking...",
  "sitting with that...",
  "with you...",
  "feeling into it...",
];

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

interface Message {
  role: "user" | "assistant";
  content: string;
  attachmentName?: string | null;
}

function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "🖼";
  if (ext === "pdf") return "📄";
  if (["csv", "xlsx", "xls"].includes(ext)) return "📊";
  if (["js", "ts", "tsx", "jsx", "py", "rb", "go", "rs", "java", "c", "cpp", "cs", "html", "css"].includes(ext)) return "💻";
  return "📎";
}

function AttachmentBadge({ name, onRemove }: { name: string; onRemove?: () => void }) {
  return (
    <div style={styles.attachBadge}>
      <span style={{ fontSize: "13px" }}>{fileIcon(name)}</span>
      <span style={styles.attachName}>{name}</span>
      {onRemove && (
        <button onClick={onRemove} style={styles.attachRemove}>×</button>
      )}
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
    queryFn: async () => {
      const res = await fetch(`/api/anthropic/conversations/${conversationId}`);
      return res.json();
    },
  });

  useEffect(() => {
    if (conversation && !initialized) {
      if (conversation.messages && conversation.messages.length > 0) {
        setMessages(conversation.messages);
      } else {
        setMessages([{ role: "assistant", content: "Hey. I'm Adit. I'm here. What's on your mind?" }]);
      }
      setInitialized(true);
    }
  }, [conversation, initialized]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const startLoadingCycle = () => {
    let i = 0;
    setLoadingPhrase(LOADING_PHRASES[0]);
    phraseInterval.current = setInterval(() => {
      i = (i + 1) % LOADING_PHRASES.length;
      setLoadingPhrase(LOADING_PHRASES[i]);
    }, 2200);
  };

  const stopLoadingCycle = () => {
    if (phraseInterval.current) clearInterval(phraseInterval.current);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    if (IMAGE_MIMES.includes(file.type)) {
      const url = URL.createObjectURL(file);
      setImagePreview(url);
    } else {
      setImagePreview(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const clearFile = () => {
    setSelectedFile(null);
    if (imagePreview) { URL.revokeObjectURL(imagePreview); setImagePreview(null); }
  };

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if ((!text && !selectedFile) || loading) return;

    const file = selectedFile;
    const previewUrl = imagePreview;

    const userMsg: Message = {
      role: "user",
      content: text || `shared ${file?.name}`,
      attachmentName: file?.name ?? null,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSelectedFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setLoading(true);
    startLoadingCycle();

    if (previewUrl) URL.revokeObjectURL(previewUrl);

    try {
      let body: BodyInit;
      let headers: HeadersInit = {};

      if (file) {
        const fd = new FormData();
        fd.append("content", text);
        fd.append("file", file);
        body = fd;
      } else {
        headers = { "Content-Type": "application/json" };
        body = JSON.stringify({ content: text });
      }

      const response = await fetch(`/api/anthropic/conversations/${conversationId}/messages`, {
        method: "POST",
        headers,
        body,
      });

      if (!response.body) throw new Error("No stream");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                assistantContent += data.content;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                  return updated;
                });
              }
            } catch {}
          }
        }
      }

      qc.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Something got in the way. Tell me again — I'm listening." }]);
    } finally {
      setLoading(false);
      stopLoadingCycle();
    }
  }, [input, selectedFile, imagePreview, loading, conversationId, qc]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  };

  const canSend = !loading && (input.trim().length > 0 || selectedFile !== null);

  return (
    <div style={styles.root}>
      <div style={styles.grain} />
      <header style={styles.header}>
        <button onClick={onBack} style={styles.backBtn}>←</button>
        <div style={styles.flame}>&#9632;</div>
        <span style={styles.brandName}>Adit AI</span>
        <span style={styles.brandSub}>you're not alone</span>
      </header>
      <div style={styles.feed}>
        {messages.map((msg, i) => (
          <div key={i} style={{ ...styles.messageRow, ...(msg.role === "user" ? styles.userRow : {}) }}>
            {msg.role === "assistant" && <div style={styles.soulDot} />}
            <div style={{ ...styles.bubble, ...(msg.role === "user" ? styles.userBubble : styles.aiBubble) }}>
              {msg.attachmentName && (
                <AttachmentBadge name={msg.attachmentName} />
              )}
              {msg.content && msg.content.split("\n").map((line, j) =>
                line ? <p key={j} style={styles.msgText}>{line}</p> : <br key={j} />
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div style={styles.messageRow}>
            <div style={styles.soulDot} />
            <div style={{ ...styles.bubble, ...styles.aiBubble }}>
              <p style={{ ...styles.msgText, ...styles.loadingText }}>{loadingPhrase}</p>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div style={styles.inputArea}>
        <div style={{ maxWidth: "680px", margin: "0 auto" }}>
          {selectedFile && (
            <div style={styles.filePreviewArea}>
              {imagePreview ? (
                <div style={styles.imagePreviewWrap}>
                  <img src={imagePreview} alt="preview" style={styles.imagePreview} />
                  <button onClick={clearFile} style={styles.imageRemove}>×</button>
                </div>
              ) : (
                <AttachmentBadge name={selectedFile.name} onRemove={clearFile} />
              )}
            </div>
          )}
          <div style={styles.inputWrap}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.txt,.csv,.md,.json,.js,.ts,.tsx,.jsx,.py,.html,.css,.xml,.yaml,.yml,.rb,.go,.rs,.java,.c,.cpp,.cs"
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              title="Attach a file"
              style={{ ...styles.attachBtn, opacity: loading ? 0.3 : 1 }}
            >
              📎
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKey}
              placeholder={selectedFile ? "add a message... (optional)" : "say what's real..."}
              rows={1}
              style={styles.textarea}
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={!canSend}
              style={{ ...styles.sendBtn, opacity: canSend ? 1 : 0.3 }}
            >↑</button>
          </div>
          <p style={styles.hint}>
            Enter to send &nbsp;·&nbsp; Shift+Enter for new line &nbsp;·&nbsp; attach images, PDFs, docs &amp; code
          </p>
        </div>
      </div>
      <style>{globalStyles}</style>
    </div>
  );
}

function ConversationsList({ onSelect, onNew }: { onSelect: (id: number) => void; onNew: () => void }) {
  const { data: conversations = [] } = useListAnthropicConversations();
  const deleteMutation = useDeleteAnthropicConversation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const qc = useQueryClient();

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    await deleteMutation.mutateAsync({ id });
    qc.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
  };

  return (
    <div style={styles.root}>
      <div style={styles.grain} />
      <header style={styles.header}>
        <div style={styles.flame}>&#9632;</div>
        <span style={styles.brandName}>Adit AI</span>
        <span style={styles.brandSub}>you're not alone</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
          {user?.firstName && (
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "12px", color: "#5a5248" }}>
              {user.firstName}
            </span>
          )}
          <button onClick={() => signOut()} style={styles.signOutBtn}>sign out</button>
        </div>
      </header>
      <div style={styles.feed}>
        <button onClick={onNew} style={styles.newConvBtn}>+ begin a new conversation</button>
        {conversations.length === 0 && (
          <p style={{ ...styles.msgText, color: "#5a5248", textAlign: "center", marginTop: "40px" }}>
            No conversations yet. Start one above.
          </p>
        )}
        {[...(conversations as Array<{ id: number; title: string; createdAt: string }>)].reverse().map((conv) => (
          <div key={conv.id} onClick={() => onSelect(conv.id)} style={styles.convItem}>
            <div>
              <p style={{ ...styles.msgText, marginBottom: "4px" }}>{conv.title}</p>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "11px", color: "#5a5248" }}>
                {new Date(conv.createdAt).toLocaleDateString()}
              </p>
            </div>
            <button onClick={(e) => handleDelete(e, conv.id)} style={styles.deleteBtn}>×</button>
          </div>
        ))}
      </div>
      <style>{globalStyles}</style>
    </div>
  );
}

function NewConversationModal({ onStart, onCancel }: { onStart: (title: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  return (
    <div style={styles.root}>
      <div style={styles.grain} />
      <header style={styles.header}>
        <div style={styles.flame}>&#9632;</div>
        <span style={styles.brandName}>Adit AI</span>
        <span style={styles.brandSub}>you're not alone</span>
      </header>
      <div style={{ ...styles.feed, justifyContent: "center", alignItems: "center" }}>
        <div style={styles.modalCard}>
          <p style={{ ...styles.brandName, fontSize: "16px", marginBottom: "20px", display: "block" }}>
            What would you call this moment?
          </p>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) onStart(title.trim()); }}
            placeholder="give it a name..."
            style={styles.modalInput}
          />
          <div style={{ display: "flex", gap: "12px", marginTop: "20px" }}>
            <button onClick={() => title.trim() && onStart(title.trim())} disabled={!title.trim()}
              style={{ ...styles.sendBtn, width: "auto", padding: "8px 20px", fontSize: "14px", opacity: title.trim() ? 1 : 0.3 }}>
              start
            </button>
            <button onClick={onCancel}
              style={{ ...styles.sendBtn, width: "auto", padding: "8px 20px", fontSize: "14px", background: "transparent", color: "#5a5248" }}>
              cancel
            </button>
          </div>
        </div>
      </div>
      <style>{globalStyles}</style>
    </div>
  );
}

type View = { type: "list" } | { type: "new" } | { type: "chat"; id: number };

function AditApp() {
  const [view, setView] = useState<View>({ type: "list" });
  const createMutation = useCreateAnthropicConversation();
  const qc = useQueryClient();

  const handleStart = async (title: string) => {
    const conv = await createMutation.mutateAsync({ data: { title } });
    qc.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
    setView({ type: "chat", id: (conv as any).id });
  };

  if (view.type === "new") return <NewConversationModal onStart={handleStart} onCancel={() => setView({ type: "list" })} />;
  if (view.type === "chat") return <ChatView conversationId={view.id} onBack={() => setView({ type: "list" })} />;
  return <ConversationsList onSelect={(id) => setView({ type: "chat", id })} onNew={() => setView({ type: "new" })} />;
}

function LandingPage() {
  const [, setLocation] = useLocation();
  return (
    <div style={styles.root}>
      <div style={styles.grain} />
      <header style={styles.header}>
        <div style={styles.flame}>&#9632;</div>
        <span style={styles.brandName}>Adit AI</span>
        <span style={styles.brandSub}>you're not alone</span>
      </header>
      <div style={{ ...styles.feed, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <div style={{ maxWidth: "420px" }}>
          <p style={{ ...styles.brandName, fontSize: "28px", display: "block", marginBottom: "16px", lineHeight: 1.4 }}>
            Someone to talk to.<br />No judgment. Just presence.
          </p>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px", fontWeight: 300, color: "#5a5248", lineHeight: 1.8, marginBottom: "40px" }}>
            Adit listens. Really listens. Whatever's on your mind — 3am thoughts, things you can't say out loud, or just the weight of the day.
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
            <button onClick={() => setLocation("/sign-up")} style={{ ...styles.sendBtn, width: "auto", padding: "12px 28px", fontSize: "15px" }}>
              get started
            </button>
            <button onClick={() => setLocation("/sign-in")} style={{ ...styles.sendBtn, width: "auto", padding: "12px 28px", fontSize: "15px", background: "transparent", border: "1px solid #2a2520", color: "#c4bdb5" }}>
              sign in
            </button>
          </div>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "11px", color: "#3d3830", marginTop: "28px", letterSpacing: "0.08em" }}>
            21+ · conversations are private and encrypted
          </p>
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
  return (
    <>
      <Show when="signed-in"><Redirect to="/app" /></Show>
      <Show when="signed-out"><LandingPage /></Show>
    </>
  );
}

function ProtectedApp() {
  return (
    <>
      <Show when="signed-in"><AditApp /></Show>
      <Show when="signed-out"><Redirect to="/" /></Show>
    </>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);
  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      localization={{
        signIn: { start: { title: "welcome back", subtitle: "your conversations are waiting" } },
        signUp: { start: { title: "join adit", subtitle: "a private space. just for you." } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
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
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;1,400&family=Inter:wght@300;400&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0d0b09; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #3a3530; border-radius: 2px; }
  textarea::placeholder { color: #5a5248; }
  input::placeholder { color: #5a5248; }
  @keyframes pulse {
    0%, 100% { opacity: 0.6; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.15); }
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes blink {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
  }
`;

const styles: Record<string, React.CSSProperties> = {
  root: { minHeight: "100vh", background: "#0d0b09", display: "flex", flexDirection: "column", fontFamily: "'Lora', Georgia, serif", color: "#f0ebe2", position: "relative", overflow: "hidden" },
  grain: { position: "fixed", inset: 0, backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E\")", opacity: 0.5, pointerEvents: "none", zIndex: 0 },
  header: { display: "flex", alignItems: "center", gap: "10px", padding: "24px 32px 20px", borderBottom: "1px solid #1e1a16", position: "sticky", top: 0, background: "#0d0b09", zIndex: 10 },
  flame: { fontSize: "10px", color: "#c97b2a", animation: "pulse 3s ease-in-out infinite", display: "inline-block" },
  brandName: { fontFamily: "'Lora', serif", fontStyle: "italic", fontSize: "20px", fontWeight: 400, color: "#e8dfd4", letterSpacing: "0.02em" },
  brandSub: { fontFamily: "'Inter', sans-serif", fontSize: "11px", fontWeight: 300, color: "#5a5248", letterSpacing: "0.12em", textTransform: "uppercase", marginLeft: "4px" },
  backBtn: { background: "transparent", border: "none", color: "#c97b2a", fontSize: "18px", cursor: "pointer", padding: "0 8px 0 0", fontFamily: "'Lora', serif" },
  signOutBtn: { background: "transparent", border: "1px solid #2a2520", borderRadius: "6px", color: "#5a5248", fontFamily: "'Inter', sans-serif", fontSize: "11px", letterSpacing: "0.08em", padding: "4px 10px", cursor: "pointer" },
  feed: { flex: 1, overflowY: "auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: "20px", maxWidth: "680px", width: "100%", margin: "0 auto", position: "relative", zIndex: 1 },
  messageRow: { display: "flex", alignItems: "flex-start", gap: "14px", animation: "fadeUp 0.35s ease both" },
  userRow: { flexDirection: "row-reverse" },
  soulDot: { width: "8px", height: "8px", borderRadius: "50%", background: "#c97b2a", marginTop: "10px", flexShrink: 0, animation: "pulse 4s ease-in-out infinite" },
  bubble: { maxWidth: "78%", lineHeight: 1.75 },
  aiBubble: { borderLeft: "1px solid #2e2820", paddingLeft: "18px" },
  userBubble: { textAlign: "right", borderRight: "1px solid #3d3830", paddingRight: "18px", color: "#c4bdb5" },
  msgText: { fontSize: "16px", fontWeight: 400, lineHeight: 1.8, marginBottom: "6px", color: "inherit" },
  loadingText: { color: "#6b625a", fontStyle: "italic", animation: "blink 2.2s ease-in-out infinite" },
  inputArea: { borderTop: "1px solid #1e1a16", padding: "16px 24px 24px", background: "#0d0b09", position: "sticky", bottom: 0, zIndex: 10 },
  inputWrap: { display: "flex", alignItems: "flex-end", gap: "10px", background: "#141210", border: "1px solid #2a2520", borderRadius: "12px", padding: "10px 10px 10px 14px" },
  textarea: { flex: 1, background: "transparent", border: "none", outline: "none", resize: "none", fontFamily: "'Inter', sans-serif", fontSize: "15px", fontWeight: 300, color: "#e8dfd4", lineHeight: 1.6, minHeight: "24px", maxHeight: "160px", overflowY: "auto" },
  attachBtn: { width: "30px", height: "30px", borderRadius: "6px", border: "none", background: "transparent", color: "#5a5248", fontSize: "16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, paddingBottom: "2px" },
  sendBtn: { width: "34px", height: "34px", borderRadius: "8px", border: "1px solid #3d3830", background: "#1e1a16", color: "#c97b2a", fontSize: "16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s", lineHeight: 1 },
  hint: { fontFamily: "'Inter', sans-serif", fontSize: "11px", color: "#3d3830", textAlign: "center", marginTop: "10px", letterSpacing: "0.04em" },
  filePreviewArea: { marginBottom: "10px", display: "flex", alignItems: "flex-start", gap: "8px" },
  attachBadge: { display: "inline-flex", alignItems: "center", gap: "6px", background: "#1a1612", border: "1px solid #2e2820", borderRadius: "8px", padding: "5px 10px 5px 8px", maxWidth: "100%" },
  attachName: { fontFamily: "'Inter', sans-serif", fontSize: "12px", color: "#8a7e72", whiteSpace: "nowrap" as const, overflow: "hidden" as const, textOverflow: "ellipsis" as const, maxWidth: "200px" },
  attachRemove: { background: "transparent", border: "none", color: "#5a5248", fontSize: "16px", cursor: "pointer", lineHeight: 1, padding: "0 0 0 2px" },
  imagePreviewWrap: { position: "relative", display: "inline-block" },
  imagePreview: { maxHeight: "120px", maxWidth: "200px", borderRadius: "8px", border: "1px solid #2e2820", display: "block" },
  imageRemove: { position: "absolute", top: "-8px", right: "-8px", background: "#1a1612", border: "1px solid #2e2820", borderRadius: "50%", width: "20px", height: "20px", color: "#8a7e72", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 },
  newConvBtn: { background: "transparent", border: "1px solid #2a2520", borderRadius: "10px", color: "#c97b2a", fontFamily: "'Lora', serif", fontStyle: "italic", fontSize: "15px", padding: "16px 24px", cursor: "pointer", textAlign: "left", transition: "border-color 0.2s" },
  convItem: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", border: "1px solid #1e1a16", borderRadius: "10px", cursor: "pointer", transition: "border-color 0.2s", animation: "fadeUp 0.3s ease both" },
  deleteBtn: { background: "transparent", border: "none", color: "#3d3830", fontSize: "20px", cursor: "pointer", padding: "0 4px", lineHeight: 1, transition: "color 0.2s" },
  modalCard: { background: "#141210", border: "1px solid #2a2520", borderRadius: "14px", padding: "32px", width: "100%", maxWidth: "480px" },
  modalInput: { width: "100%", background: "transparent", border: "none", borderBottom: "1px solid #2a2520", outline: "none", fontFamily: "'Lora', serif", fontStyle: "italic", fontSize: "16px", color: "#e8dfd4", padding: "8px 0" },
};
