import { useState, useRef, useEffect, useCallback } from "react";
import MoodTracker from "./components/MoodTracker";
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
const FREE_DAILY_LIMIT = 10;

interface Message { role: "user" | "assistant"; content: string; attachmentName?: string | null; imageUrl?: string | null; }

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

function getDailyCount(): number {
  const today = new Date().toISOString().split("T")[0];
  const stored = localStorage.getItem("vera_last_reset");
  if (stored !== today) {
    localStorage.setItem("vera_last_reset", today);
    localStorage.setItem("vera_msg_count", "0");
    return 0;
  }
  return parseInt(localStorage.getItem("vera_msg_count") ?? "0", 10);
}

function incrementDailyCount(): number {
  const today = new Date().toISOString().split("T")[0];
  localStorage.setItem("vera_last_reset", today);
  const current = parseInt(localStorage.getItem("vera_msg_count") ?? "0", 10);
  const next = current + 1;
  localStorage.setItem("vera_msg_count", String(next));
  return next;
}

function useSubscriptionStatus() {
  const { data } = useQuery<{ isPro: boolean }>({
    queryKey: ["subscription-status"],
    queryFn: async () => {
      try {
        const r = await fetch("/api/subscription/status");
        if (!r.ok) return { isPro: false };
        return r.json();
      } catch {
        return { isPro: false };
      }
    },
    staleTime: 5 * 60 * 1000,
  });
  return data?.isPro ?? false;
}

function PaywallModal({ onClose, onUpgrade }: { onClose: () => void; onUpgrade: () => void }) {
  return (
    <div style={s.overlay}>
      <div style={s.paywallCard}>
        <div style={{ fontSize: "32px", marginBottom: "16px" }}>✦</div>
        <p style={{ ...s.brandName, fontSize: "22px", display: "block", marginBottom: "12px" }}>You've reached your limit</p>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px", fontWeight: 300, color: "#8a7e72", lineHeight: 1.8, marginBottom: "32px" }}>
          Free conversations are capped at {FREE_DAILY_LIMIT} messages per day. Upgrade to Pro for unlimited — Vera is always here.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <button onClick={onUpgrade} style={{ ...s.sendBtn, width: "100%", height: "auto", padding: "14px 24px", fontSize: "15px", fontFamily: "'Lora', serif", fontStyle: "italic" }}>
            go pro — $9/month
          </button>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#5a5248", fontFamily: "'Inter', sans-serif", fontSize: "13px", cursor: "pointer", padding: "8px" }}>
            maybe later
          </button>
        </div>
      </div>
    </div>
  );
}

function PricingModal({ onClose, onUpgrade, loading }: { onClose: () => void; onUpgrade: () => void; loading: boolean }) {
  return (
    <div style={s.overlay}>
      <div style={{ ...s.paywallCard, maxWidth: "520px" }}>
        <p style={{ ...s.brandName, fontSize: "22px", display: "block", marginBottom: "8px" }}>Choose your plan</p>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "13px", color: "#5a5248", marginBottom: "32px", letterSpacing: "0.04em" }}>Vera is always listening. Pro removes the limits.</p>
        <div style={{ display: "flex", gap: "16px", marginBottom: "32px" }}>
          <div style={s.planCard}>
            <p style={{ fontFamily: "'Lora', serif", fontStyle: "italic", fontSize: "18px", color: "#e8dfd4", marginBottom: "8px" }}>Free</p>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "26px", fontWeight: 600, color: "#c97b2a", marginBottom: "16px" }}>$0</p>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
              {["10 messages per day", "File & image sharing", "Private conversations", "All Claude AI features"].map(f => (
                <li key={f} style={{ fontFamily: "'Inter', sans-serif", fontSize: "13px", color: "#8a7e72", display: "flex", gap: "8px" }}>
                  <span style={{ color: "#3d3830" }}>◆</span>{f}
                </li>
              ))}
            </ul>
          </div>
          <div style={{ ...s.planCard, border: "1px solid #c97b2a", background: "#0f0d0b" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <p style={{ fontFamily: "'Lora', serif", fontStyle: "italic", fontSize: "18px", color: "#e8dfd4" }}>Pro</p>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "10px", letterSpacing: "0.12em", color: "#c97b2a", background: "#1e1a16", border: "1px solid #c97b2a", borderRadius: "4px", padding: "2px 6px" }}>POPULAR</span>
            </div>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "26px", fontWeight: 600, color: "#c97b2a", marginBottom: "16px" }}>$9<span style={{ fontSize: "13px", fontWeight: 400, color: "#5a5248" }}>/mo</span></p>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
              {["Unlimited messages", "File & image sharing", "Private conversations", "Image generation", "Priority support"].map(f => (
                <li key={f} style={{ fontFamily: "'Inter', sans-serif", fontSize: "13px", color: "#c4bdb5", display: "flex", gap: "8px" }}>
                  <span style={{ color: "#c97b2a" }}>◆</span>{f}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button onClick={onUpgrade} disabled={loading} style={{ ...s.sendBtn, width: "100%", height: "auto", padding: "14px 24px", fontSize: "15px", fontFamily: "'Lora', serif", fontStyle: "italic", opacity: loading ? 0.6 : 1 }}>
            {loading ? "opening checkout..." : "start pro — $9/month"}
          </button>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#5a5248", fontFamily: "'Inter', sans-serif", fontSize: "13px", cursor: "pointer", padding: "8px" }}>
            stay on free plan
          </button>
        </div>
      </div>
    </div>
  );
}

function ImageGenModal({ onClose, onGenerate, loading }: { onClose: () => void; onGenerate: (prompt: string) => void; loading: boolean }) {
  const [prompt, setPrompt] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  return (
    <div style={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...s.paywallCard, maxWidth: "480px", padding: "28px" }}>
        <p style={{ fontFamily: "'Lora', serif", fontStyle: "italic", fontSize: "18px", color: "#e8dfd4", marginBottom: "6px" }}>Generate an image</p>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "13px", color: "#5a5248", marginBottom: "20px" }}>Describe what you'd like to see</p>
        <input
          ref={inputRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && prompt.trim() && !loading) onGenerate(prompt.trim()); if (e.key === "Escape") onClose(); }}
          placeholder="a quiet forest at dusk, warm light..."
          style={{ width: "100%", background: "#141210", border: "1px solid #2a2520", borderRadius: "8px", outline: "none", padding: "12px 14px", fontFamily: "'Inter', sans-serif", fontSize: "14px", fontWeight: 300, color: "#e8dfd4", marginBottom: "16px" }}
          disabled={loading}
        />
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={() => prompt.trim() && !loading && onGenerate(prompt.trim())} disabled={!prompt.trim() || loading} style={{ ...s.sendBtn, flex: 1, width: "auto", height: "auto", padding: "10px 20px", fontSize: "14px", opacity: !prompt.trim() || loading ? 0.4 : 1 }}>
            {loading ? "generating..." : "generate"}
          </button>
          <button onClick={onClose} style={{ background: "transparent", border: "1px solid #2a2520", borderRadius: "8px", color: "#5a5248", fontFamily: "'Inter', sans-serif", fontSize: "13px", cursor: "pointer", padding: "10px 16px" }}>
            cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatView({ conversationId, onBack, onNew, isPro }: { conversationId: number; onBack: () => void; onNew: () => void; isPro: boolean }) {
  const qc = useQueryClient();
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem(`vera_chat_${conversationId}`);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingPhrase, setLoadingPhrase] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const [showImageGen, setShowImageGen] = useState(false);
  const [showPastChats, setShowPastChats] = useState(false);
  const [imageGenLoading, setImageGenLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
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
      if (conversation.messages && conversation.messages.length > 0) {
        setMessages(conversation.messages);
      } else if (messages.length === 0) {
        setMessages([{ role: "assistant", content: "Hey. I'm Vera. I'm here. What's on your mind?" }]);
      }
      setInitialized(true);
    }
  }, [conversation, initialized]);

  useEffect(() => {
    try {
      localStorage.setItem(`vera_chat_${conversationId}`, JSON.stringify(messages));
    } catch (e) {
      console.error("Failed to save chat history:", e);
    }
  }, [messages, conversationId]);

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

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const r = await fetch("/api/subscription/checkout", { method: "POST" });
      if (!r.ok) { alert("Payment setup is still being configured. Check back soon!"); return; }
      const { url } = await r.json();
      if (url) window.location.href = url;
    } catch {
      alert("Payment setup is still being configured. Check back soon!");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const { data: allConversations = [] } = useListAnthropicConversations();

  const handleNewChat = () => {
    if (window.confirm("Start a new conversation? Your current chat will be saved separately.")) {
      onBack();
      onNew();
    }
  };

  const handleImageGenerate = async (prompt: string) => {
    setImageGenLoading(true);
    setShowImageGen(false);
    setMessages((prev) => [...prev, { role: "user", content: `generate image: ${prompt}` }]);
    setMessages((prev) => [...prev, { role: "assistant", content: "generating your image..." }]);
    try {
      const r = await fetch("/api/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!r.ok) throw new Error("failed");
      const { b64_json } = await r.json();
      setMessages((prev) => {
        const u = [...prev];
        u[u.length - 1] = { role: "assistant", content: "", imageUrl: `data:image/png;base64,${b64_json}` };
        return u;
      });
    } catch {
      setMessages((prev) => {
        const u = [...prev];
        u[u.length - 1] = { role: "assistant", content: "Couldn't generate that one. Try a different prompt." };
        return u;
      });
    } finally {
      setImageGenLoading(false);
    }
  };

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if ((!text && !selectedFile) || loading) return;

    if (!isPro) {
      const count = getDailyCount();
      if (count >= FREE_DAILY_LIMIT) {
        setShowPaywall(true);
        return;
      }
    }

    const file = selectedFile; const previewUrl = imagePreview;
    setMessages((prev) => [...prev, { role: "user", content: text || `shared ${file?.name}`, attachmentName: file?.name ?? null }]);
    setInput(""); setSelectedFile(null); setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setLoading(true); startLoadingCycle();
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    if (!isPro) incrementDailyCount();

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
  }, [input, selectedFile, imagePreview, loading, conversationId, qc, isPro]);

  const canSend = !loading && (input.trim().length > 0 || selectedFile !== null);

  return (
    <div style={s.root}>
      <div style={s.grain} />
      <header style={s.header}>
        <button onClick={onBack} style={s.backBtn}>←</button>
        <div style={s.flame}>&#9632;</div>
        <span style={s.brandName}>Vera</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
          {!isPro && (
            <button onClick={() => setShowPricing(true)} style={s.proBadge}>
              free · {Math.max(0, FREE_DAILY_LIMIT - getDailyCount())} left
            </button>
          )}
          {isPro && <span style={s.proActiveBadge}>pro ✦</span>}
          <button onClick={() => setShowPastChats(true)} style={s.iconBtn} title="Past conversations">☰</button>
          <button onClick={handleNewChat} style={s.iconBtn} title="New chat">✦ new</button>
        </div>
      </header>
      <div style={s.feed}>
        {messages.map((msg, i) => (
          <div key={i} style={{ ...s.messageRow, ...(msg.role === "user" ? s.userRow : {}) }}>
            {msg.role === "assistant" && <div style={s.soulDot} />}
            <div style={{ ...s.bubble, ...(msg.role === "user" ? s.userBubble : s.aiBubble) }}>
              {msg.attachmentName && <AttachmentBadge name={msg.attachmentName} />}
              {msg.imageUrl && (
                <img
                  src={msg.imageUrl}
                  alt="generated"
                  style={{ maxWidth: "100%", maxHeight: "400px", borderRadius: "10px", border: "1px solid #2e2820", marginBottom: "6px", display: "block" }}
                />
              )}
              {msg.content && msg.content.split("\n").map((line, j) => line ? <p key={j} style={s.msgText}>{line}</p> : <br key={j} />)}
            </div>
          </div>
        ))}
        {(loading || imageGenLoading) && <div style={s.messageRow}><div style={s.soulDot} /><div style={{ ...s.bubble, ...s.aiBubble }}><p style={{ ...s.msgText, color: "#6b625a", fontStyle: "italic", animation: "blink 2.2s ease-in-out infinite" }}>{imageGenLoading ? "painting..." : loadingPhrase}</p></div></div>}
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
            <button onClick={() => fileInputRef.current?.click()} disabled={loading} style={{ ...s.attachBtn, opacity: loading ? 0.3 : 1 }} title="Attach file">📎</button>
            <button onClick={() => setShowImageGen(true)} disabled={loading || imageGenLoading} style={{ ...s.attachBtn, opacity: loading || imageGenLoading ? 0.3 : 1 }} title="Generate image">🎨</button>
            <textarea ref={textareaRef} value={input} onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"; }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder={selectedFile ? "add a message... (optional)" : "say what's real..."} rows={1} style={s.textarea} disabled={loading} />
            <button onClick={sendMessage} disabled={!canSend} style={{ ...s.sendBtn, opacity: canSend ? 1 : 0.3 }}>↑</button>
          </div>
          <p style={s.hint}>Enter to send · Shift+Enter for new line · attach images, PDFs, docs & code · 🎨 generate images</p>
        </div>
      </div>
      {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} onUpgrade={() => { setShowPaywall(false); setShowPricing(true); }} />}
      {showPricing && <PricingModal onClose={() => setShowPricing(false)} onUpgrade={handleCheckout} loading={checkoutLoading} />}
      {showImageGen && <ImageGenModal onClose={() => setShowImageGen(false)} onGenerate={handleImageGenerate} loading={imageGenLoading} />}

      {showPastChats && (
        <div style={s.sidebarOverlay} onClick={() => setShowPastChats(false)}>
          <div style={s.sidebar} onClick={(e) => e.stopPropagation()}>
            <div style={s.sidebarHeader}>
              <span style={{ fontFamily: "'Lora', serif", fontStyle: "italic", fontSize: "16px", color: "#c4bdb5" }}>conversations</span>
              <button onClick={() => setShowPastChats(false)} style={s.sidebarClose}>×</button>
            </div>
            <button onClick={() => { setShowPastChats(false); handleNewChat(); }} style={s.sidebarNewBtn}>✦ new conversation</button>
            <div style={s.sidebarList}>
              {(allConversations as Array<{ id: number; title: string; createdAt: string }>).length === 0 && (
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "13px", color: "#3d3830", padding: "16px 0", textAlign: "center" }}>no past conversations</p>
              )}
              {[...(allConversations as Array<{ id: number; title: string; createdAt: string }>)].reverse().map((conv) => {
                const isActive = conv.id === conversationId;
                const cachedMsgs: Message[] = (() => { try { const d = localStorage.getItem(`vera_chat_${conv.id}`); return d ? JSON.parse(d) : []; } catch { return []; } })();
                const preview = cachedMsgs.find((m) => m.role === "user")?.content ?? "—";
                return (
                  <div
                    key={conv.id}
                    style={{ ...s.sidebarItem, ...(isActive ? s.sidebarItemActive : {}) }}
                    onClick={() => { setShowPastChats(false); if (!isActive) { onBack(); setTimeout(() => { /* VERAApp will handle navigation via onSelect */ }, 0); } }}
                  >
                    <p style={{ fontFamily: "'Lora', serif", fontStyle: "italic", fontSize: "14px", color: isActive ? "#c97b2a" : "#c4bdb5", marginBottom: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conv.title}</p>
                    <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "11px", color: "#5a5248", marginBottom: "4px" }}>{new Date(conv.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                    {preview !== "—" && <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "12px", color: "#3d3830", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>"{preview.slice(0, 60)}{preview.length > 60 ? "…" : ""}"</p>}
                    {!isActive && <button onClick={(e) => { e.stopPropagation(); setShowPastChats(false); onBack(); }} style={{ marginTop: "8px", background: "transparent", border: "1px solid #2a2520", borderRadius: "5px", color: "#5a5248", fontFamily: "'Inter', sans-serif", fontSize: "11px", padding: "3px 10px", cursor: "pointer", letterSpacing: "0.06em" }}>view →</button>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <style>{globalStyles}</style>
    </div>
  );
}

function ConversationsList({ onSelect, onNew, isPro, onShowPricing }: { onSelect: (id: number) => void; onNew: () => void; isPro: boolean; onShowPricing: () => void }) {
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
      {!isPro && (
        <div style={s.freeNotice}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "12px", color: "#5a5248" }}>
            {Math.max(0, FREE_DAILY_LIMIT - getDailyCount())} of {FREE_DAILY_LIMIT} free messages remaining today
          </span>
          <button onClick={onShowPricing} style={{ background: "transparent", border: "none", color: "#c97b2a", fontFamily: "'Inter', sans-serif", fontSize: "12px", cursor: "pointer", padding: "0", textDecoration: "underline" }}>
            go pro
          </button>
        </div>
      )}
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
      <header style={s.header}><div style={s.flame}>&#9632;</div><span style={s.brandName}>Vera</span></header>
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

type ChatViewState = { type: "list" } | { type: "new" } | { type: "chat"; id: number };

function VERAApp() {
  const [chatView, setChatView] = useState<ChatViewState>({ type: "list" });
  const [activeTab, setActiveTab] = useState<"chat" | "mood">("chat");
  const [showPricing, setShowPricing] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const createMutation = useCreateAnthropicConversation();
  const qc = useQueryClient();
  const { signOut } = useClerk();
  const { user } = useUser();
  const isPro = useSubscriptionStatus();

  const handleStart = async (title: string) => {
    const conv = await createMutation.mutateAsync({ data: { title } });
    qc.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
    setChatView({ type: "chat", id: (conv as any).id });
  };

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const r = await fetch("/api/subscription/checkout", { method: "POST" });
      if (!r.ok) { alert("Payment setup is still being configured. Check back soon!"); return; }
      const { url } = await r.json();
      if (url) window.location.href = url;
    } catch {
      alert("Payment setup is still being configured. Check back soon!");
    } finally {
      setCheckoutLoading(false);
    }
  };

  if (chatView.type === "new") return <NewConversationModal onStart={handleStart} onCancel={() => setChatView({ type: "list" })} />;
  if (chatView.type === "chat") return <ChatView conversationId={chatView.id} onBack={() => setChatView({ type: "list" })} onNew={() => setChatView({ type: "new" })} isPro={isPro} />;

  return (
    <div style={s.root}>
      <div style={s.grain} />
      <header style={s.header}>
        <div style={s.flame}>&#9632;</div>
        <span style={s.brandName}>Vera</span>
        <nav style={{ display: "flex", gap: "4px", marginLeft: "24px" }}>
          <button
            onClick={() => setActiveTab("chat")}
            style={{
              ...s.navTab,
              ...(activeTab === "chat" ? s.navTabActive : {}),
            }}
          >
            chat
          </button>
          <button
            onClick={() => setActiveTab("mood")}
            style={{
              ...s.navTab,
              ...(activeTab === "mood" ? s.navTabActive : {}),
            }}
          >
            mood
          </button>
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
          {isPro && <span style={s.proActiveBadge}>pro ✦</span>}
          {user?.firstName && <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "12px", color: "#5a5248" }}>{user.firstName}</span>}
          <button onClick={() => signOut()} style={s.signOutBtn}>sign out</button>
        </div>
      </header>
      {activeTab === "chat" ? (
        <div style={s.feed}>
          <ConversationsList onSelect={(id) => setChatView({ type: "chat", id })} onNew={() => setChatView({ type: "new" })} isPro={isPro} onShowPricing={() => setShowPricing(true)} />
        </div>
      ) : (
        <MoodTracker />
      )}
      {showPricing && <PricingModal onClose={() => setShowPricing(false)} onUpgrade={handleCheckout} loading={checkoutLoading} />}
      <style>{globalStyles}</style>
    </div>
  );
}

function LandingPage() {
  const [, setLocation] = useLocation();
  return (
    <div style={s.root}>
      <div style={s.grain} />
      <header style={s.header}><div style={s.flame}>&#9632;</div><span style={s.brandName}>Vera</span><span style={s.brandSub}>you're not alone</span></header>
      <div style={{ ...s.feed, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <div style={{ maxWidth: "420px" }}>
          <p style={{ ...s.brandName, fontSize: "28px", display: "block", marginBottom: "16px", lineHeight: 1.4 }}>Someone to talk to.<br />No judgment. Just presence.</p>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px", fontWeight: 300, color: "#5a5248", lineHeight: 1.8, marginBottom: "40px" }}>Vera listens. Really listens. Whatever's on your mind — 3am thoughts, things you can't say out loud, or just the weight of the day.</p>
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
  return (<><Show when="signed-in"><VERAApp /></Show><Show when="signed-out"><Redirect to="/" /></Show></>);
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
      localization={{ signIn: { start: { title: "welcome back", subtitle: "your conversations are waiting" } }, signUp: { start: { title: "join vera", subtitle: "a private space. just for you." } } }}
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
  backBtn: { background: "transparent", border: "none", color: "#c97b2a", fontSize: "18px", cursor: "pointer", padding: "0 8px 0 0", fontFamily: "'Lora', serif" },
  signOutBtn: { background: "transparent", border: "1px solid #2a2520", borderRadius: "6px", color: "#5a5248", fontFamily: "'Inter', sans-serif", fontSize: "11px", letterSpacing: "0.08em", padding: "4px 10px", cursor: "pointer" },
  navTab: { background: "transparent", border: "1px solid transparent", borderRadius: "6px", color: "#5a5248", fontFamily: "'DM Sans', sans-serif", fontSize: "13px", letterSpacing: "0.06em", padding: "5px 14px", cursor: "pointer", transition: "all 0.2s" },
  navTabActive: { background: "#141210", border: "1px solid #2a2520", color: "#c4bdb5" },
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
  overlay: { position: "fixed", inset: 0, background: "rgba(13,11,9,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "24px", backdropFilter: "blur(4px)" },
  paywallCard: { background: "#0f0d0b", border: "1px solid #2a2520", borderRadius: "18px", padding: "40px 36px", maxWidth: "420px", width: "100%", textAlign: "center" },
  planCard: { flex: 1, background: "#141210", border: "1px solid #1e1a16", borderRadius: "12px", padding: "20px 16px" },
  proBadge: { background: "transparent", border: "1px solid #2a2520", borderRadius: "6px", color: "#5a5248", fontFamily: "'Inter', sans-serif", fontSize: "11px", letterSpacing: "0.06em", padding: "4px 10px", cursor: "pointer" },
  iconBtn: { background: "transparent", border: "1px solid #2a2520", borderRadius: "6px", color: "#5a5248", fontFamily: "'Inter', sans-serif", fontSize: "11px", letterSpacing: "0.06em", padding: "4px 10px", cursor: "pointer" },
  sidebarOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", justifyContent: "flex-end" } as React.CSSProperties,
  sidebar: { width: "300px", background: "#0d0b09", borderLeft: "1px solid #1e1a16", display: "flex", flexDirection: "column", height: "100%", overflowY: "hidden" } as React.CSSProperties,
  sidebarHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 16px", borderBottom: "1px solid #1e1a16" },
  sidebarClose: { background: "transparent", border: "none", color: "#5a5248", fontSize: "20px", cursor: "pointer", lineHeight: 1, padding: "0 4px" },
  sidebarNewBtn: { margin: "16px 20px 0", background: "transparent", border: "1px solid #2a2520", borderRadius: "7px", color: "#c97b2a", fontFamily: "'Inter', sans-serif", fontSize: "12px", letterSpacing: "0.08em", padding: "9px 14px", cursor: "pointer", textAlign: "left" } as React.CSSProperties,
  sidebarList: { flex: 1, overflowY: "auto", padding: "12px 12px 20px" } as React.CSSProperties,
  sidebarItem: { padding: "12px 14px", borderRadius: "8px", cursor: "pointer", marginBottom: "6px", border: "1px solid transparent", transition: "background 0.15s" },
  sidebarItemActive: { background: "#141210", border: "1px solid #2a2520" },
  proActiveBadge: { fontFamily: "'Inter', sans-serif", fontSize: "11px", letterSpacing: "0.08em", color: "#c97b2a", padding: "4px 10px", background: "#1a1410", border: "1px solid #3d2a15", borderRadius: "6px" },
  freeNotice: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: "#141210", border: "1px solid #1e1a16", borderRadius: "8px" },
};
